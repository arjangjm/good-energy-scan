import { describe, expect, it } from 'vitest';
import bs58 from 'bs58';
import { parseEnv } from '@/lib/env';

const good = {
  PUBLIC_BASE_URL: 'https://ge-scan.vercel.app/',
  RPC_URL: 'https://api.mainnet-beta.solana.com',
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  TREASURY_SECRET_KEY: bs58.encode(new Uint8Array(64).fill(7)),
  CODE_PEPPER: 'ab'.repeat(32),
  ADMIN_TOKEN: 'x'.repeat(40),
  DATABASE_URL: 'postgres://u:p@h:6543/postgres',
};

describe('env', () => {
  it('parses a full env and trims the trailing slash', () => {
    expect(parseEnv(good).PUBLIC_BASE_URL).toBe('https://ge-scan.vercel.app');
  });
  it('names every missing key in one error', () => {
    const { TREASURY_SECRET_KEY, CODE_PEPPER, ...rest } = good;
    expect(() => parseEnv(rest)).toThrow(/TREASURY_SECRET_KEY[\s\S]*CODE_PEPPER/);
  });
  it('rejects a 32-byte treasury key', () => {
    expect(() => parseEnv({ ...good, TREASURY_SECRET_KEY: bs58.encode(new Uint8Array(32).fill(7)) })).toThrow(/TREASURY_SECRET_KEY/);
  });
});
