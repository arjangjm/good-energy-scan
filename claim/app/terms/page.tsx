import { Brand, Footer } from '@/components/Chrome';

export const metadata = { title: 'Terms | Good Energy' };

export default function Terms() {
  return (
    <main className="shell">
      <Brand />
      <section className="card">
        <h1>Test terms</h1>
        <p>This is a test build of the Good Energy scan page. It can change or stop at any time.</p>
        <p>You must be 18 or older to claim.</p>
        <p>Each code works once. The payout is a cash back rebate on a can you bought. It is paid in SOL on Solana to the wallet you connect, at the SOL price when you claim.</p>
        <p>Payouts are public. Anyone can see the wallet address and the amount on Solana.</p>
        <p>We connect to your wallet only to read its address. We never ask you to sign or approve a payment.</p>
        <p>We store your wallet address and a scrambled copy of your IP address to stop abuse.</p>
      </section>
      <Footer />
    </main>
  );
}
