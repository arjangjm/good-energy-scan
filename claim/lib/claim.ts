import { PublicKey } from '@solana/web3.js';
import { getEnv } from './env';
import { hashCode, normalizeCode } from './codes';
import { Claim, getClaim, logEvent, markConfirmed, markExpired, markFailed, markSigned, reserveCode, setPayoutsEnabled } from './db';
import { ChainClient } from './solana/chain';
import { broadcastUntilSettled, isExpired, Outcome } from './solana/broadcast';
import { buildSignedPayout, isValidRecipient } from './solana/payout';
import { readSolPrice, usdToLamports } from './solana/price';
import { treasuryAddress, treasuryKeypair } from './treasury';

export type ClaimResult = {
  status: 'paid' | 'pending' | 'claimed' | 'invalid' | 'paused' | 'limited' | 'failed';
  claimId?: string; signature?: string; amountUsd?: string; seq?: number;
};

// The treasury keeps its rent floor (650,240 lamports on mainnet now, 890,880 before the cut) plus room for fees.
export const TREASURY_FLOOR_LAMPORTS = 1_000_000n;
export const MAX_ATTEMPTS = 3;
export const usd = (units: bigint) => (Number(units) / 1e6).toFixed(2);
// Test seam: lets a test stop the flow right after the signature is saved.
export const hooks = { afterSigned: async (_claimId: string) => {} };

const paid = (c: Claim, signature: string): ClaimResult =>
  ({ status: 'paid', claimId: c.id, signature, amountUsd: usd(c.amount), seq: c.seq });

export async function processClaim(i: { code: string; wallet: string; ipHash: string }, chain: ChainClient): Promise<ClaimResult> {
  const code = normalizeCode(i.code);
  if (!code || !isValidRecipient(i.wallet, treasuryAddress())) return { status: 'invalid' };
  const r = await reserveCode(hashCode(code, getEnv().CODE_PEPPER), i.wallet, i.ipHash);
  if (r.result === 'pending') return resumeClaim(r.claimId!, chain);
  if (r.result === 'claimed') return { status: 'claimed', signature: r.signature ?? undefined, amountUsd: r.amount == null ? undefined : usd(r.amount) };
  if (r.result !== 'reserved') return { status: r.result };
  const claim = (await getClaim(r.claimId!))!;
  try {
    return await payClaim(claim, chain);
  } catch (e) {
    // Nothing was signed yet: free the code so the can still works. Otherwise the status poll finishes the job.
    const released = await markFailed(claim.id, 'error_before_sign', true, ['reserved']).catch(() => false);
    await logEvent('claim_error', { claimId: claim.id, released, error: String((e as Error)?.message ?? e).slice(0, 200) });
    return released ? { status: 'failed', claimId: claim.id } : { status: 'pending', claimId: claim.id };
  }
}

async function payClaim(claim: Claim, chain: ChainClient): Promise<ClaimResult> {
  if (claim.attempts >= MAX_ATTEMPTS) {
    await markFailed(claim.id, 'max_attempts', true, ['reserved']);
    return { status: 'failed', claimId: claim.id };
  }
  const treasury = treasuryKeypair();
  // claim.amount is USD in millionths (990000 = $0.99), paid in SOL at Pyth's price right now.
  const lamports = usdToLamports(claim.amount, await readSolPrice(chain));
  const bal = await chain.balance(treasury.publicKey);
  if (bal < lamports + TREASURY_FLOOR_LAMPORTS) {
    await markFailed(claim.id, 'treasury_low', true, ['reserved']);
    await setPayoutsEnabled(false);
    await logEvent('treasury_low', { lamports: bal.toString(), needed: (lamports + TREASURY_FLOOR_LAMPORTS).toString() });
    return { status: 'paused' };
  }
  const recipient = new PublicKey(claim.wallet);
  const { blockhash, lastValidBlockHeight } = await chain.latestBlockhash();
  const microLamports = await chain.priorityFee([treasury.publicKey]).catch(() => 50_000);
  const signed = buildSignedPayout({
    treasury, recipient, lamports, memo: `Good Energy | scan #${claim.seq} | 33% back`,
    blockhash, lastValidBlockHeight, microLamports,
  });
  // Save the signature BEFORE the first send. If another worker got here first, follow its transaction instead.
  if (!(await markSigned(claim.id, claim.attempts, signed.signature, signed.rawBase64, signed.lastValidBlockHeight))) {
    return resumeClaim(claim.id, chain);
  }
  await hooks.afterSigned(claim.id);
  // Stop well inside the 30 second function limit. If it is still in flight, the status poll takes over.
  const outcome = await broadcastUntilSettled(chain, signed.rawBase64, signed.signature, signed.lastValidBlockHeight, { timeoutMs: 18_000 });
  return settle({ ...claim, attempts: claim.attempts + 1 }, signed.signature, outcome, chain);
}

async function settle(claim: Claim, sig: string, outcome: Outcome, chain: ChainClient): Promise<ClaimResult> {
  if (outcome === 'confirmed') {
    await markConfirmed(claim.id, sig);
    return paid(claim, sig);
  }
  if (outcome === 'failed') {
    await markFailed(claim.id, 'tx_failed', true, ['signed']);
    return { status: 'failed', claimId: claim.id };
  }
  if (outcome === 'expired') {
    // The old transaction can never land now, so signing a new one cannot pay twice.
    if (await markExpired(claim.id, sig)) {
      const fresh = await getClaim(claim.id);
      if (fresh?.status === 'reserved') return payClaim(fresh, chain);
    }
    return resumeClaim(claim.id, chain);
  }
  return { status: 'pending', claimId: claim.id };
}

// Safe to call any number of times. The status poll uses it to finish a payout that was cut off.
export async function resumeClaim(claimId: string, chain: ChainClient): Promise<ClaimResult> {
  const claim = await getClaim(claimId);
  if (!claim) return { status: 'invalid' };
  if (claim.status === 'confirmed') return paid(claim, claim.signature!);
  if (claim.status === 'failed') return { status: claim.error === 'treasury_low' ? 'paused' : 'failed', claimId };
  if (claim.status === 'reserved') return payClaim(claim, chain);
  const sig = claim.signature!, lastValid = claim.lastValidBlockHeight!;
  const st = await chain.signatureStatus(sig);
  if (st?.ok) return settle(claim, sig, 'confirmed', chain);
  if (st?.err) return settle(claim, sig, 'failed', chain);
  if (st === null) {
    const dead = await isExpired(chain, sig, lastValid);
    if (dead) return settle(claim, sig, dead, chain);
  }
  if (claim.rawTx) await chain.sendRaw(claim.rawTx, true).catch(() => {});
  return { status: 'pending', claimId };
}
