import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

// Thrown by sendRaw when the node simulated the transaction, it failed, and so it was never forwarded.
export class SimulationFailed extends Error {}

export type SigStatus = { ok: boolean; err: unknown } | null; // null: the cluster has never seen it

export interface ChainClient {
  latestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  blockHeight(): Promise<number>;
  sendRaw(rawBase64: string, skipPreflight: boolean): Promise<void>;
  signatureStatus(sig: string): Promise<SigStatus>;
  balances(owner: PublicKey, mint: PublicKey): Promise<{ lamports: bigint; units: bigint }>;
  priorityFee(accounts: PublicKey[]): Promise<number>;
}

export const MIN_FEE = 10_000;
export const MAX_FEE = 1_000_000;

export function rpcChain(rpcUrl: string): ChainClient {
  const c = new Connection(rpcUrl, 'confirmed');
  return {
    latestBlockhash: () => c.getLatestBlockhash('confirmed'),
    blockHeight: () => c.getBlockHeight('confirmed'),
    async sendRaw(rawBase64, skipPreflight) {
      try {
        await c.sendRawTransaction(Buffer.from(rawBase64, 'base64'), { skipPreflight, maxRetries: 0, preflightCommitment: 'confirmed' });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (!skipPreflight && /simulation failed/i.test(msg)) throw new SimulationFailed(msg);
        throw e;
      }
    },
    async signatureStatus(sig) {
      const r = await c.getSignatureStatuses([sig], { searchTransactionHistory: true });
      const s = r.value[0];
      if (!s) return null;
      if (s.err) return { ok: false, err: s.err };
      const done = s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized';
      return { ok: done, err: null }; // processed but not confirmed yet: neither ok nor failed
    },
    async balances(owner, mint) {
      const lamports = BigInt(await c.getBalance(owner, 'confirmed'));
      let units = 0n;
      try {
        const b = await c.getTokenAccountBalance(getAssociatedTokenAddressSync(mint, owner), 'confirmed');
        units = BigInt(b.value.amount);
      } catch { /* no token account yet */ }
      return { lamports, units };
    },
    async priorityFee(accounts) {
      const fees = (await c.getRecentPrioritizationFees({ lockedWritableAccounts: accounts }))
        .map((f) => f.prioritizationFee).sort((a, b) => a - b);
      const p75 = fees.length ? fees[Math.floor(fees.length * 0.75)] : MIN_FEE;
      return Math.min(MAX_FEE, Math.max(MIN_FEE, p75));
    },
  };
}
