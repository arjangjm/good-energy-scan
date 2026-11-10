import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { LiteChain } from './litesvm-chain';
import { buildSignedPayout, COMPUTE_UNIT_LIMIT, isValidRecipient } from '@/lib/solana/payout';

const PAY = 11_511_168n; // $0.99 at 86.00343026 USD per SOL

async function pay(chain: LiteChain, recipient: PublicKey, memo: string) {
  const bh = await chain.latestBlockhash();
  const signed = buildSignedPayout({ treasury: chain.treasury, recipient, lamports: PAY, memo, ...bh, microLamports: 50_000 });
  await chain.sendRaw(signed.rawBase64, false);
  return signed;
}

describe('payout transaction', () => {
  it('pays a fresh wallet the exact lamports, takes the fee from the treasury, and writes the memo', async () => {
    const chain = new LiteChain();
    const user = Keypair.generate().publicKey; // no SOL yet
    const before = chain.lamportsOf(chain.treasury.publicKey);
    await pay(chain, user, 'Good Energy | scan #1 | 33% back');
    expect(chain.lamportsOf(user)).toBe(PAY);
    expect(before - chain.lamportsOf(chain.treasury.publicKey)).toBeGreaterThan(PAY);
    expect(chain.lastLogs.some((l) => l.includes('Memo'))).toBe(true);
    console.log('compute units, payout:', chain.lastCu.toString());
    expect(chain.lastCu).toBeLessThan(BigInt(COMPUTE_UNIT_LIMIT));
  });
  it('pays a repeat wallet again', async () => {
    const chain = new LiteChain();
    const user = Keypair.generate().publicKey;
    await pay(chain, user, 'Good Energy | scan #1 | 33% back');
    await pay(chain, user, 'Good Energy | scan #2 | 33% back');
    expect(chain.lamportsOf(user)).toBe(2n * PAY);
  });
  it('does not pay twice when the same signed bytes are sent again', async () => {
    const chain = new LiteChain();
    const user = Keypair.generate().publicKey;
    const signed = await pay(chain, user, 'Good Energy | scan #1 | 33% back');
    const replay: any = chain.svm.sendTransaction(Transaction.from(Buffer.from(signed.rawBase64, 'base64')));
    expect(replay.constructor.name).not.toBe('TransactionMetadata');
    expect(chain.lamportsOf(user)).toBe(PAY);
  });
  it('rejects addresses we should not pay', () => {
    const treasury = Keypair.generate().publicKey.toBase58();
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('x')], new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'));
    expect(isValidRecipient(pda.toBase58(), treasury)).toBe(false);
    expect(isValidRecipient(treasury, treasury)).toBe(false);
    expect(isValidRecipient('abc', treasury)).toBe(false);
    expect(isValidRecipient(Keypair.generate().publicKey.toBase58(), treasury)).toBe(true);
  });
});
