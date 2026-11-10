// Pyth's SOL/USD account bytes for tests. Tests only.
// Real bytes read from mainnet on Nov 10, 2026: 86.00343026 USD per SOL, published at 1794287992.
export const REAL_PYTH = Buffer.from(
  'IvEjY51+9M1gMUcENA3t3zcf1CRyFI8kjp0abRpesqw6zYt/1dayQwHvDYtv2izrpB2hXUCV0do5Kg0vjtDGx7wPTPrIwoC1bfLRngACAAAA3sA9AAAAAAD4////eKnyagAAAAB3qfJqAAAAALwBTwACAAAAiwI4AAAAAAAfBN8bAAAAAAA=',
  'base64',
);
export const REAL_PUBLISH = 1794287992;

// The real account with our own numbers written into the price fields (offsets as in lib/solana/price.ts).
export function pythData(p: { price: bigint; publishTime: number; conf?: bigint; expo?: number }): Buffer {
  const d = Buffer.from(REAL_PYTH);
  d.writeBigInt64LE(p.price, 73);
  d.writeBigUInt64LE(p.conf ?? 1_000_000n, 81);
  d.writeInt32LE(p.expo ?? -8, 89);
  d.writeBigInt64LE(BigInt(p.publishTime), 93);
  return d;
}
