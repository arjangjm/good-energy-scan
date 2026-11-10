import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { NextRequest } from 'next/server';
import { LiteChain } from './litesvm-chain';
import { newCode, retireBatch, walletCallback } from './helpers';
import { getEnv } from '@/lib/env';
import { hashCode } from '@/lib/codes';
import { closeDb, createConnectState, getClaim, getPayoutsEnabled, getSession, lookupCode, setPayoutsEnabled } from '@/lib/db';
import { hooks, processClaim, resumeClaim } from '@/lib/claim';
import { treasuryKeypair } from '@/lib/treasury';
import { COOKIE, hashToken } from '@/lib/session';
import { GET as callback } from '@/app/cb/[state]/route';

const BATCH = 'test-claim';
const PAY = 9_900_000n; // $0.99 at the test price of $100 per SOL
let chain: LiteChain;
let n = 0;
const ip = () => `test-ip-${Date.now()}-${n++}`;
const wallet = () => Keypair.generate().publicKey;

beforeAll(() => { chain = new LiteChain(BigInt(LAMPORTS_PER_SOL), treasuryKeypair()); });
afterAll(async () => { hooks.afterSigned = async () => {}; await retireBatch(BATCH); await setPayoutsEnabled(true); await closeDb(); });

describe('claim service @db', () => {
  it('pays 0.99 once and marks the code paid', async () => {
    const code = await newCode(BATCH), w = wallet();
    const r = await processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, chain);
    expect(r.status).toBe('paid');
    expect(r.amountUsd).toBe('0.99');
    expect(chain.lamportsOf(w)).toBe(PAY);
    expect((await getClaim(r.claimId!))!.status).toBe('confirmed');
    expect((await lookupCode(hashCode(code, getEnv().CODE_PEPPER)))!.status).toBe('paid');
    const again = await processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, chain);
    expect(again.status).toBe('claimed');
    expect(chain.lamportsOf(w)).toBe(PAY);
  });

  it('pays once when the same wallet taps Claim twice at the same moment', async () => {
    const code = await newCode(BATCH), w = wallet();
    const [a, b] = await Promise.all([
      processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, chain),
      processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, chain),
    ]);
    expect([a.status, b.status]).toContain('paid');
    expect(chain.lamportsOf(w)).toBe(PAY);
  });

  it('pays one wallet when two wallets race for one code', async () => {
    const code = await newCode(BATCH), w1 = wallet(), w2 = wallet();
    const rs = await Promise.all([w1, w2].map((w) => processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, chain)));
    expect(rs.map((r) => r.status).sort()).toEqual(['claimed', 'paid']);
    expect(chain.lamportsOf(w1) + chain.lamportsOf(w2)).toBe(PAY);
  });

  it('finishes with the same signature when the server dies right after signing', async () => {
    const code = await newCode(BATCH), w = wallet();
    hooks.afterSigned = async () => { throw new Error('function killed'); };
    const first = await processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, chain);
    hooks.afterSigned = async () => {};
    expect(first.status).toBe('pending');
    const signedSig = (await getClaim(first.claimId!))!.signature;
    expect(signedSig).toBeTruthy();
    expect(chain.lamportsOf(w)).toBe(0n); // nothing sent yet
    let r = await resumeClaim(first.claimId!, chain);
    for (let i = 0; i < 3 && r.status !== 'paid'; i++) r = await resumeClaim(first.claimId!, chain);
    expect(r.status).toBe('paid');
    expect(r.signature).toBe(signedSig);
    const c = (await getClaim(first.claimId!))!;
    expect(c.prevSignatures).toEqual([]);
    expect(c.attempts).toBe(1);
    expect(chain.lamportsOf(w)).toBe(PAY);
  });

  it('does not sign again while the first transaction can still land, and does once it cannot', async () => {
    const code = await newCode(BATCH), w = wallet();
    hooks.afterSigned = async () => { throw new Error('function killed'); };
    const first = await processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, chain);
    hooks.afterSigned = async () => {};
    const sigA = (await getClaim(first.claimId!))!.signature!;
    chain.dropSends = true; // the network loses it
    expect((await resumeClaim(first.claimId!, chain)).status).toBe('pending');
    expect((await getClaim(first.claimId!))!.signature).toBe(sigA); // still the same transaction
    chain.height += 500; // now past its last valid block
    chain.dropSends = false;
    const r = await resumeClaim(first.claimId!, chain);
    expect(r.status).toBe('paid');
    expect(r.signature).not.toBe(sigA);
    const c = (await getClaim(first.claimId!))!;
    expect(c.prevSignatures).toEqual([sigA]);
    expect(c.attempts).toBe(2);
    expect(chain.lamportsOf(w)).toBe(PAY);
  });

  it('pauses, and keeps the can good, when the treasury is empty', async () => {
    const empty = new LiteChain(5_000_000n, treasuryKeypair()); // less than $0.99 plus the rent floor
    const code = await newCode(BATCH), w = wallet();
    try {
      const r = await processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, empty);
      expect(r.status).toBe('paused');
      expect((await lookupCode(hashCode(code, getEnv().CODE_PEPPER)))!.status).toBe('available');
      expect(await getPayoutsEnabled()).toBe(false);
      expect((await processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, chain)).status).toBe('paused');
    } finally { await setPayoutsEnabled(true); }
    expect((await processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, chain)).status).toBe('paid');
  });

  it('pays nothing, keeps the can good, and does not pause, when the SOL price is stale', async () => {
    const stale = new LiteChain(BigInt(LAMPORTS_PER_SOL), treasuryKeypair());
    stale.setSolPrice(10_000_000_000n, Math.floor(Date.now() / 1000) - 3600);
    const code = await newCode(BATCH), w = wallet();
    const r = await processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, stale);
    expect(r.status).toBe('failed');
    expect(stale.lamportsOf(w)).toBe(0n);
    expect((await lookupCode(hashCode(code, getEnv().CODE_PEPPER)))!.status).toBe('available');
    expect(await getPayoutsEnabled()).toBe(true);
    expect((await processClaim({ code, wallet: w.toBase58(), ipHash: ip() }, chain)).status).toBe('paid');
    expect(chain.lamportsOf(w)).toBe(PAY);
  });

  it('rejects a bad code and a bad wallet without touching the database', async () => {
    expect((await processClaim({ code: 'nope', wallet: wallet().toBase58(), ipHash: ip() }, chain)).status).toBe('invalid');
    const code = await newCode(BATCH);
    expect((await processClaim({ code, wallet: treasuryKeypair().publicKey.toBase58(), ipHash: ip() }, chain)).status).toBe('invalid');
  });
});

describe('wallet callback @db', () => {
  it('finishes the connect with no cookies, once', async () => {
    const code = await newCode(BATCH), w = wallet().toBase58();
    const dapp = nacl.box.keyPair();
    const id = await createConnectState('phantom', code, true, bs58.encode(dapp.publicKey), bs58.encode(dapp.secretKey));
    const url = `http://localhost:3000/cb/${id}?${walletCallback('phantom', dapp.publicKey, w)}`;
    const res = await callback(new NextRequest(url), { params: Promise.resolve({ state: id }) });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`http://localhost:3000/c/${code}`);
    const token = res.cookies.get(COOKIE)?.value;
    expect(token).toBeTruthy();
    expect(await getSession(hashToken(token!))).toEqual({ wallet: w, provider: 'phantom', adult: true });
    const second = await callback(new NextRequest(url), { params: Promise.resolve({ state: id }) });
    expect(second.headers.get('location')).toContain('wallet_error=expired');
    expect(second.cookies.get(COOKIE)).toBeUndefined();
  });
  it('sends the user back with an error when they reject in the wallet', async () => {
    const code = await newCode(BATCH);
    const dapp = nacl.box.keyPair();
    const id = await createConnectState('solflare', code, true, bs58.encode(dapp.publicKey), bs58.encode(dapp.secretKey));
    const res = await callback(new NextRequest(`http://localhost:3000/cb/${id}?errorCode=4001&errorMessage=User%20rejected`), { params: Promise.resolve({ state: id }) });
    expect(res.headers.get('location')).toBe(`http://localhost:3000/c/${code}?wallet_error=rejected`);
  });
});
