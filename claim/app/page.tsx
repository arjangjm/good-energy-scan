import { Brand, Footer } from '@/components/Chrome';
import { recentPayouts } from '@/lib/db';
import { usd } from '@/lib/claim';

export const dynamic = 'force-dynamic';
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export default async function Home({ searchParams }: { searchParams: Promise<{ wallet_error?: string }> }) {
  const sp = await searchParams;
  const payouts = await recentPayouts(20).catch(() => []);
  return (
    <main className="shell">
      <Brand />
      <section className="card">
        {sp.wallet_error ? <p className="note">That wallet link ran out. Scan the can again.</p> : null}
        <h1>Scan a Good Energy can.</h1>
        <p>Open your camera. Point it at the code on the can. Get 33% back in your wallet.</p>
      </section>
      {payouts.length ? (
        <>
          <h2>Paid in public</h2>
          <ul className="feed">
            {payouts.map((p) => (
              <li key={p.seq}>
                <span>#{p.seq} · {short(p.wallet)}</span>
                <a href={`https://solscan.io/tx/${p.signature}`} target="_blank" rel="noreferrer">+${usd(p.amount)}</a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Footer />
    </main>
  );
}
