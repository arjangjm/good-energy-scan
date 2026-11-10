// Mints codes through the admin API and saves them to a CSV (gitignored). Prints no codes.
//   npx tsx scripts/mint-test-codes.ts <envfile> <count> <batch> <amountBaseUnits>
import { writeFileSync } from 'node:fs';

const [file, count, batch, amount] = process.argv.slice(2);
if (!file || !count || !batch || !amount) { console.error('usage: mint-test-codes.ts <envfile> <count> <batch> <amountBaseUnits>'); process.exit(1); }
process.loadEnvFile(file);
const base = process.env.PUBLIC_BASE_URL!.replace(/\/+$/, '');

async function main() {
  const res = await fetch(`${base}/api/admin/mint`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ count: Number(count), batch, amountBaseUnits: Number(amount) }),
  });
  if (!res.ok) { console.error('mint failed:', res.status); process.exit(1); }
  const j = await res.json();
  const out = `codes-${batch}.csv`;
  writeFileSync(out, 'n,code,url\n' + j.codes.map((c: any, i: number) => `${i + 1},${c.code},${c.url}`).join('\n') + '\n', { mode: 0o600 });
  console.log(`minted ${j.codes.length} codes at ${amount} base units -> ${out}`);
}
main();
