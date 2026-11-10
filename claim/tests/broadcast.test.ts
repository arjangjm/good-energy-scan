import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { LiteChain } from './litesvm-chain';
import { buildSignedPayout } from '@/lib/solana/payout';
import { broadcastUntilSettled } from '@/lib/solana/broadcast';

const fast = { pollMs: 10, resendMs: 30 };
async function sign(chain: LiteChain) {
  const bh = await chain.latestBlockhash();
  return buildSignedPayout({ treasury: chain.treasury, recipient: Keypair.generate().publicKey, lamports: 9_900_000n, memo: 'Good Energy | scan #1 | 33% back', ...bh, microLamports: 50_000 });
}

describe('broadcastUntilSettled', () => {
  it('confirms a good payout', async () => {
    const chain = new LiteChain();
    const s = await sign(chain);
    expect(await broadcastUntilSettled(chain, s.rawBase64, s.signature, s.lastValidBlockHeight, fast)).toBe('confirmed');
  });
  it('fails when the treasury cannot cover the payout', async () => {
    const chain = new LiteChain(5_000_000n);
    const s = await sign(chain);
    expect(await broadcastUntilSettled(chain, s.rawBase64, s.signature, s.lastValidBlockHeight, fast)).toBe('failed');
  });
  it('reports expired once the chain is past the last valid block and never saw it', async () => {
    const chain = new LiteChain();
    const s = await sign(chain);
    chain.dropSends = true;
    chain.height = s.lastValidBlockHeight + 50;
    expect(await broadcastUntilSettled(chain, s.rawBase64, s.signature, s.lastValidBlockHeight, fast)).toBe('expired');
  });
  it('stays pending, and keeps resending the same bytes, while the block window is open', async () => {
    const chain = new LiteChain();
    const s = await sign(chain);
    chain.dropSends = true;
    expect(await broadcastUntilSettled(chain, s.rawBase64, s.signature, s.lastValidBlockHeight, { ...fast, timeoutMs: 200 })).toBe('pending');
    expect(chain.sends).toBeGreaterThan(2);
  });
  it('keeps watching after a network error on the first send, and confirms', async () => {
    const chain = new LiteChain();
    const s = await sign(chain);
    chain.failNextPreflightWith = new Error('fetch failed');
    expect(await broadcastUntilSettled(chain, s.rawBase64, s.signature, s.lastValidBlockHeight, fast)).toBe('confirmed');
  });
});
