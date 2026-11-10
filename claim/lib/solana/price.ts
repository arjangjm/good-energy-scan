import { PublicKey } from '@solana/web3.js';
import type { ChainClient } from './chain';

// Pyth's SOL/USD price, posted on Solana by Pyth (sponsored feed, shard 0). Checked against Coinbase on Nov 10, 2026.
export const PYTH_SOL_USD = new PublicKey('7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE');
export const PYTH_RECEIVER = new PublicKey('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ');
const SOL_USD_FEED = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
export const MAX_PRICE_AGE_S = 300;
const MAX_CONF = 0.02;          // Pyth must know the price within 2%
const USD_RANGE = [5, 10_000];  // outside this, something is broken

export class PriceUnavailable extends Error {}
export type SolPrice = { price: bigint; expo: number; publishTime: number };

// Pyth's PriceUpdateV2 account: 8-byte tag, write authority (32), verification level (1 = full),
// then feed id (32), price i64, confidence u64, exponent i32, publish time i64. All little-endian.
export function parseSolPrice(acc: { owner: PublicKey; data: Uint8Array } | null, nowS: number): SolPrice {
  if (!acc) throw new PriceUnavailable('no price account');
  if (!acc.owner.equals(PYTH_RECEIVER)) throw new PriceUnavailable('price account has the wrong owner');
  const d = Buffer.from(acc.data);
  if (d.length < 101) throw new PriceUnavailable('price account is too short');
  if (d[40] !== 1) throw new PriceUnavailable('price is not fully verified');
  if (d.subarray(41, 73).toString('hex') !== SOL_USD_FEED) throw new PriceUnavailable('wrong price feed');
  const price = d.readBigInt64LE(73), conf = d.readBigUInt64LE(81), expo = d.readInt32LE(89), publishTime = Number(d.readBigInt64LE(93));
  const usd = Number(price) * 10 ** expo;
  if (expo > 0 || !(usd >= USD_RANGE[0] && usd <= USD_RANGE[1])) throw new PriceUnavailable(`price out of range: ${usd}`);
  if (Number(conf) / Number(price) > MAX_CONF) throw new PriceUnavailable('price too uncertain');
  if (nowS - publishTime > MAX_PRICE_AGE_S) throw new PriceUnavailable(`price is ${nowS - publishTime}s old`);
  return { price, expo, publishTime };
}

export async function readSolPrice(chain: ChainClient, nowS = Math.floor(Date.now() / 1000)): Promise<SolPrice> {
  return parseSolPrice(await chain.account(PYTH_SOL_USD), nowS);
}

// USD in millionths (990000 = $0.99) to lamports. Rounds down, so it never pays more than the USD amount.
export function usdToLamports(microUsd: bigint, p: SolPrice): bigint {
  return (microUsd * 10n ** BigInt(3 - p.expo)) / p.price;
}
