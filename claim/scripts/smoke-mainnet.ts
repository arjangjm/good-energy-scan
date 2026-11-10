// A 1-cent end-to-end test on mainnet against the live site.
//   npx tsx scripts/smoke-mainnet.ts <envfile> <codes.csv>
// Claims the code to a throwaway wallet, checks the chain, tries the code again, then sends the cent back
// and closes the throwaway's token account so the treasury gets the rent back.
import { readFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createCloseAccountInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';

const [file, csv] = process.argv.slice(2);
process.loadEnvFile(file);
const base = process.env.PUBLIC_BASE_URL!.replace(/\/+$/, '');
const conn = new Connection(process.env.RPC_URL!, 'confirmed');
const mint = new PublicKey(process.env.USDC_MINT!);
const treasury = Keypair.fromSecretKey(bs58.decode(process.env.TREASURY_SECRET_KEY!));
const code = readFileSync(csv, 'utf8').trim().split('\n')[1].split(',')[1];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const units = async (owner: PublicKey) => {
  try { return BigInt((await conn.getTokenAccountBalance(getAssociatedTokenAddressSync(mint, owner), 'confirmed')).value.amount); } catch { return 0n; }
};
const check = (ok: boolean, what: string) => { console.log(ok ? 'PASS' : 'FAIL', what); if (!ok) process.exitCode = 1; };

async function main() {
  const user = Keypair.generate();
  const before = await units(treasury.publicKey);
  console.log('treasury USDC units before:', before.toString());

  const s = await fetch(`${base}/api/session`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ wallet: user.publicKey.toBase58(), adult: true, provider: 'manual' }),
  });
  const cookie = (s.headers.get('set-cookie') ?? '').split(';')[0];
  check(s.status === 204 && cookie.startsWith('ge_s='), 'session created for a throwaway wallet');

  const post = () => fetch(`${base}/api/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie }, body: JSON.stringify({ code }),
  }).then((r) => r.json());
  const t0 = Date.now();
  let r = await post();
  for (let i = 0; i < 40 && r.status === 'pending'; i++) { await sleep(1500); r = await fetch(`${base}/api/claim/${r.claimId}`).then((x) => x.json()); }
  console.log('claim result:', r.status, 'in', ((Date.now() - t0) / 1000).toFixed(1), 's', r.signature ? `https://solscan.io/tx/${r.signature}` : '');
  check(r.status === 'paid', 'claim paid');
  const got = await units(user.publicKey);
  check(got === 10000n, `throwaway wallet holds 10000 units (has ${got})`);
  if (r.signature) {
    const st = await conn.getSignatureStatuses([r.signature], { searchTransactionHistory: true });
    check(!!st.value[0] && !st.value[0].err, 'payout transaction is on chain with no error');
  }

  const again = await post();
  check(again.status === 'claimed', `second claim of the same code says claimed (says ${again.status})`);
  check((await units(user.publicKey)) === 10000n, 'no second transfer');

  if (got > 0n) {
    const from = getAssociatedTokenAddressSync(mint, user.publicKey), to = getAssociatedTokenAddressSync(mint, treasury.publicKey);
    const tx = new Transaction().add(
      createTransferCheckedInstruction(from, mint, to, user.publicKey, got, 6),
      createCloseAccountInstruction(from, treasury.publicKey, user.publicKey),
    );
    tx.feePayer = treasury.publicKey;
    const sig = await sendAndConfirmTransaction(conn, tx, [treasury, user], { commitment: 'confirmed' });
    console.log('refund:', `https://solscan.io/tx/${sig}`);
  }
  const after = await units(treasury.publicKey);
  check(after === before, `treasury USDC is back to where it started (${after})`);
}
main().catch((e) => { console.error('smoke test error:', e?.message ?? e); process.exit(1); });
