'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { chirp, coin } from '@/lib/sound';
import Smiley from './Smiley';

type Result = { status: string; claimId?: string; signature?: string; amountUsd?: string; seq?: number };
type Phase = 'idle' | 'claiming' | 'paid' | 'claimed' | 'invalid' | 'paused' | 'failed';
type Props = {
  code: string; view: 'available' | 'claimed' | 'invalid'; amountUsd: string;
  wallet: string | null; adult: boolean; paidOn: string | null; signature: string | null;
  pendingClaimId: string | null; walletError: string | null; browse: { phantom: string; solflare: string };
};

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function ClaimPanel(p: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(p.view === 'available' ? 'idle' : p.view);
  const [result, setResult] = useState<Result | null>(null);
  const [adult, setAdult] = useState(false);
  const [links, setLinks] = useState<{ phantom: string; solflare: string } | null>(null);
  const [injected, setInjected] = useState<null | 'phantom' | 'solflare'>(null);
  const [other, setOther] = useState(false);
  const [addr, setAddr] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);
  const ready = !!p.wallet && p.adult;

  const finish = useCallback((r: Result) => {
    busy.current = false;
    setResult(r);
    if (r.status === 'paid') { coin(); setPhase('paid'); }
    else if (r.status === 'claimed') setPhase('claimed');
    else if (r.status === 'invalid') setPhase('invalid');
    else if (r.status === 'paused' || r.status === 'limited') setPhase('paused');
    else setPhase('failed');
  }, []);

  // While a payout is on its way, ask the server every 1.5 seconds. The server finishes it if it was cut off.
  const follow = useCallback(async (first: Result) => {
    let r = first;
    for (let i = 0; i < 60 && r.status === 'pending' && r.claimId; i++) {
      await sleep(1500);
      try { r = await (await fetch(`/api/claim/${r.claimId}`, { cache: 'no-store' })).json(); } catch { /* keep trying */ }
    }
    finish(r);
  }, [finish]);

  async function claim() {
    if (busy.current) return;
    busy.current = true;
    chirp();
    setPhase('claiming');
    try {
      const res = await fetch('/api/claim', json({ code: p.code }));
      if (res.status === 401 || res.status === 403) {
        busy.current = false;
        await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
        setPhase('idle');
        router.refresh();
        return;
      }
      await follow(await res.json());
    } catch { finish({ status: 'failed' }); }
  }

  // A payout for this wallet was already started (page reload, second tab). Pick it up.
  useEffect(() => {
    if (p.pendingClaimId && ready && !busy.current) {
      busy.current = true;
      setPhase('claiming');
      void follow({ status: 'pending', claimId: p.pendingClaimId });
    }
  }, [p.pendingClaimId, ready, follow]);

  // Inside Phantom's or Solflare's own browser the wallet is right there. No deeplink needed.
  useEffect(() => {
    const look = () => {
      const w = window as any;
      if (w.phantom?.solana?.isPhantom) setInjected('phantom');
      else if (w.solflare?.isSolflare) setInjected('solflare');
    };
    look();
    const t = setTimeout(look, 600);
    return () => clearTimeout(t);
  }, []);

  // The wallet links must be plain links that exist before the tap, or iOS will not open the app.
  useEffect(() => {
    if (!adult || ready || injected || p.view !== 'available') { setLinks(null); return; }
    let live = true;
    fetch('/api/connect/prepare', json({ code: p.code, adult: true }))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setLinks(j); })
      .catch(() => {});
    return () => { live = false; };
  }, [adult, ready, injected, p.code, p.view]);

  async function saveWallet(wallet: string, provider: string) {
    setErr(null);
    const res = await fetch('/api/session', json({ wallet: wallet.trim(), adult: true, provider })).catch(() => null);
    if (res?.status === 204) router.refresh();
    else setErr("That address doesn't look right.");
  }
  async function connectInjected() {
    try {
      const w = window as any;
      const prov = injected === 'phantom' ? w.phantom.solana : w.solflare;
      const r = await prov.connect();
      const pk = (r?.publicKey ?? prov.publicKey)?.toString();
      if (pk) await saveWallet(pk, `${injected}-injected`);
    } catch { setErr("The wallet didn't connect. Try again."); }
  }
  async function changeWallet() {
    await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
    router.refresh();
  }

  const sig = result?.signature ?? p.signature;
  const amount = result?.amountUsd ?? p.amountUsd;
  const solscan = sig ? <a className="link" href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer">See it on Solscan</a> : null;

  if (phase === 'invalid') return (
    <section className="card"><h1>This code doesn&apos;t look right.</h1><p>Try scanning again.</p></section>
  );
  if (phase === 'claimed') return (
    <section className="card">
      <h1>This can&apos;s already been scanned.</h1>
      {p.paidOn ? <p>Paid on {p.paidOn}.</p> : null}
      {solscan ? <p>{solscan}</p> : null}
    </section>
  );
  if (phase === 'paid') return (
    <section className="card center" data-testid="paid">
      <p className="amount pop">+${amount}</p>
      <h1>in your wallet.</h1>
      {result?.seq ? <p className="small">Scan #{result.seq}. Paid in USDC on Solana.</p> : null}
      <div className="stack">
        {sig ? <a className="btn" href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer">See it on Solscan</a> : null}
        <Link className="btn alt" href="/">Scan another can</Link>
      </div>
      <div className="flash"><Smiley size={72} /></div>
    </section>
  );
  if (phase === 'claiming') return (
    <section className="card center"><h1 className="pulse">Sending to your wallet…</h1><p>This takes a few seconds.</p></section>
  );
  if (phase === 'paused') return (
    <section className="card">
      <h1>Payouts are paused for a minute.</h1><p>Your can is still good. Try again soon.</p>
      <button className="btn" onClick={claim}>Try again</button>
    </section>
  );
  if (phase === 'failed') return (
    <section className="card">
      <h1>Something went wrong.</h1><p>Your can is still good. Try again.</p>
      <button className="btn" onClick={claim}>Try again</button>
    </section>
  );

  if (ready) return (
    <section className="card">
      <h1>This can has ${amount} for you.</h1>
      <p>33% back, paid in USDC to your Solana wallet. Every payout is public on Solana.</p>
      <div className="stack">
        <button className="btn" onClick={claim}>Claim ${amount}</button>
        <p className="small center">to {short(p.wallet!)} · <button className="link" onClick={changeWallet}>change</button></p>
      </div>
    </section>
  );

  return (
    <section className="card">
      <h1>This can has ${amount} for you.</h1>
      <p>33% back, paid in USDC to your Solana wallet. Every payout is public on Solana.</p>
      {p.walletError ? <p className="note">The wallet didn&apos;t connect. Try again.</p> : null}
      {err ? <p className="note">{err}</p> : null}
      <label className="check">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        I&apos;m 18 or older
      </label>
      {injected ? (
        <button className="btn" disabled={!adult} onClick={connectInjected}>Connect</button>
      ) : (
        <div className="stack">
          <a className="btn" href={links?.phantom ?? '#'} aria-disabled={!links}>Phantom</a>
          <a className="btn alt" href={links?.solflare ?? '#'} aria-disabled={!links}>Solflare</a>
          {p.walletError ? (
            <p className="small center">
              Still stuck? <a className="link" href={p.browse.phantom}>Open in Phantom</a> or <a className="link" href={p.browse.solflare}>Open in Solflare</a>
            </p>
          ) : null}
          {other ? (
            <>
              <input className="addr" placeholder="Your Solana address" value={addr} onChange={(e) => setAddr(e.target.value)}
                autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label="Your Solana address" />
              <button className="btn alt" disabled={!adult || addr.trim().length < 32} onClick={() => saveWallet(addr, 'manual')}>Use this address</button>
            </>
          ) : (
            <p className="small center"><button className="link" onClick={() => setOther(true)}>Other wallet</button></p>
          )}
        </div>
      )}
    </section>
  );
}
