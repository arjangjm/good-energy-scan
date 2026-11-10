import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { MAX_PRICE_AGE_S, PYTH_RECEIVER, PriceUnavailable, parseSolPrice, usdToLamports } from '@/lib/solana/price';
import { REAL_PUBLISH, REAL_PYTH, pythData } from './pyth';

const acc = (data: Buffer, owner = PYTH_RECEIVER) => ({ owner, data });
const now = 1_800_000_000;

describe('SOL price from Pyth', () => {
  it('reads the real mainnet account', () => {
    expect(parseSolPrice(acc(REAL_PYTH), REAL_PUBLISH + 10)).toEqual({ price: 8600343026n, expo: -8, publishTime: REAL_PUBLISH });
  });
  it('turns $0.99 into lamports, rounding down so it never pays more', () => {
    expect(usdToLamports(990000n, { price: 8600343026n, expo: -8, publishTime: 0 })).toBe(11_511_168n);
    expect(usdToLamports(990000n, { price: 10_000_000_000n, expo: -8, publishTime: 0 })).toBe(9_900_000n);
    expect(usdToLamports(990000n, { price: 700_000_000n, expo: -8, publishTime: 0 })).toBe(141_428_571n);
  });
  it('refuses a stale price', () => {
    expect(() => parseSolPrice(acc(REAL_PYTH), REAL_PUBLISH + MAX_PRICE_AGE_S + 1)).toThrow(PriceUnavailable);
  });
  it('refuses a missing account, or one Pyth does not own', () => {
    expect(() => parseSolPrice(null, now)).toThrow(PriceUnavailable);
    expect(() => parseSolPrice(acc(REAL_PYTH, Keypair.generate().publicKey), REAL_PUBLISH)).toThrow(/owner/);
  });
  it('refuses another feed, or an update that is only partly verified', () => {
    const other = Buffer.from(REAL_PYTH); other[41] ^= 1;
    expect(() => parseSolPrice(acc(other), REAL_PUBLISH)).toThrow(/feed/);
    const partial = Buffer.from(REAL_PYTH); partial[40] = 0;
    expect(() => parseSolPrice(acc(partial), REAL_PUBLISH)).toThrow(/verified/);
  });
  it('refuses a price that makes no sense or is too uncertain', () => {
    expect(() => parseSolPrice(acc(pythData({ price: 100_000_000n, publishTime: now })), now)).toThrow(/range/); // $1
    expect(() => parseSolPrice(acc(pythData({ price: -5n, publishTime: now })), now)).toThrow(/range/);
    expect(() => parseSolPrice(acc(pythData({ price: 10_000_000_000n, conf: 300_000_000n, publishTime: now })), now)).toThrow(/uncertain/); // 3% wide
    expect(() => parseSolPrice(acc(pythData({ price: 10_000_000_000n, publishTime: now }).subarray(0, 90)), now)).toThrow(PriceUnavailable);
  });
});
