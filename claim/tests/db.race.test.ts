import { afterAll, describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { getEnv } from '@/lib/env';
import { hashCode } from '@/lib/codes';
import { closeDb, reserveCode } from '@/lib/db';
import { newCode, retireBatch } from './helpers';

const BATCH = 'test-race';
afterAll(async () => { await retireBatch(BATCH); await closeDb(); });

describe('reserve_code @db', () => {
  it('lets exactly one of 25 racing wallets reserve a code', async () => {
    const code = await newCode(BATCH);
    const h = hashCode(code, getEnv().CODE_PEPPER);
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) =>
      reserveCode(h, Keypair.generate().publicKey.toBase58(), `test-ip-${i}-${Date.now()}`)));
    expect(results.filter((r) => r.result === 'reserved').length).toBe(1);
    expect(results.filter((r) => r.result === 'claimed').length).toBe(24);
  });
  it('says invalid for a code that was never minted', async () => {
    const r = await reserveCode('0'.repeat(64), Keypair.generate().publicKey.toBase58(), 'test-ip');
    expect(r.result).toBe('invalid');
  });
});
