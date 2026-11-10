// Checks one real $0.99 payout on mainnet without sending it. No money moves.
//   npx tsx scripts/dry-run-mainnet.ts <envfile> <wallet to pay in the simulation>
// Reads the SOL price from Pyth, builds and signs the exact transaction the server would send, then blanks
// the signature and asks a Solana node to simulate it. The node never holds a payout it could send.
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';

const [file, to] = process.argv.slice(2);
if (!file || !to) { console.error('usage: dry-run-mainnet.ts <envfile> <wallet>'); process.exit(1); }
process.loadEnvFile(file);
const check = (ok: boolean, what: string) => { console.log(ok ? 'PASS' : 'FAIL', what); if (!ok) process.exitCode = 1; };

async function main() {
  const { rpcChain } = await import('../lib/solana/chain');
  const { buildSignedPayout, COMPUTE_UNIT_LIMIT } = await import('../lib/solana/payout');
  const { readSolPrice, usdToLamports } = await import('../lib/solana/price');
  const { TREASURY_FLOOR_LAMPORTS } = await import('../lib/claim');
  const { treasuryKeypair } = await import('../lib/treasury');

  const rpc = process.env.RPC_URL!;
  const chain = rpcChain(rpc), conn = new Connection(rpc, 'confirmed');
  const treasury = treasuryKeypair(), recipient = new PublicKey(to);

  const price = await readSolPrice(chain);
  const lamports = usdToLamports(990000n, price);
  console.log(`SOL price $${(Number(price.price) * 10 ** price.expo).toFixed(2)}, ${Math.floor(Date.now() / 1000) - price.publishTime}s old.`,
    `$0.99 = ${lamports} lamports (${(Number(lamports) / 1e9).toFixed(6)} SOL)`);
  const bal = await chain.balance(treasury.publicKey);
  check(bal >= lamports + TREASURY_FLOOR_LAMPORTS, `treasury ${treasury.publicKey.toBase58()} holds ${(Number(bal) / 1e9).toFixed(6)} SOL, enough for a payout`);

  const { blockhash, lastValidBlockHeight } = await chain.latestBlockhash();
  const microLamports = await chain.priorityFee([treasury.publicKey]);
  const signed = buildSignedPayout({ treasury, recipient, lamports, memo: 'Good Energy | scan #0 | 33% back', blockhash, lastValidBlockHeight, microLamports });
  const tx = VersionedTransaction.deserialize(Buffer.from(signed.rawBase64, 'base64'));
  tx.signatures[0] = new Uint8Array(64);
  const before = await conn.getBalance(recipient, 'confirmed');
  const sim = await conn.simulateTransaction(tx, { sigVerify: false, commitment: 'confirmed', accounts: { encoding: 'base64', addresses: [recipient.toBase58()] } });
  check(sim.value.err === null, `mainnet simulation passes ${sim.value.err ? JSON.stringify(sim.value.err) : ''}`);
  check((sim.value.unitsConsumed ?? Infinity) < COMPUTE_UNIT_LIMIT, `uses ${sim.value.unitsConsumed} compute units, under the ${COMPUTE_UNIT_LIMIT} limit`);
  check(!!sim.value.logs?.some((l) => l.includes('Memo')), 'memo is in the logs');
  const after = sim.value.accounts?.[0]?.lamports;
  check(after != null && BigInt(after) - BigInt(before) === lamports, `the wallet would get exactly ${lamports} lamports`);
  const fee = BigInt((await conn.getFeeForMessage(tx.message, 'confirmed')).value ?? 0);
  console.log(`Fee ${fee} lamports. Right now the treasury covers ${(bal - TREASURY_FLOOR_LAMPORTS) / (lamports + fee)} payouts of $0.99.`);
  console.log('Nothing was sent.');
}
main().catch((e) => { console.error('dry run error:', e?.message ?? e); process.exit(1); });
