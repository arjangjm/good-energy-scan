import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { getEnv } from '@/lib/env';
import { claimUrl, generateCode, hashCode } from '@/lib/codes';
import { claimStats, getPayoutsEnabled, insertCodes, logEvent, setPayoutsEnabled } from '@/lib/db';
import { getChain } from '@/lib/solana/live';
import { isValidRecipient } from '@/lib/solana/payout';
import { treasuryAddress, treasuryKeypair } from '@/lib/treasury';
import { isAdmin } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

// A wrong token gets the same 404 as a page that does not exist.
const notFound = () => new NextResponse('Not found', { status: 404 });
const noStore = { headers: { 'Cache-Control': 'no-store' } };
type Ctx = { params: Promise<{ action: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!isAdmin(req)) return notFound();
  if ((await ctx.params).action !== 'health') return notFound();
  const env = getEnv();
  const bal = await getChain().balances(treasuryKeypair().publicKey, new PublicKey(env.USDC_MINT));
  return NextResponse.json({
    treasury: treasuryAddress(), lamports: Number(bal.lamports), usdcUnits: Number(bal.units),
    payoutsEnabled: await getPayoutsEnabled(), ...(await claimStats()),
  }, noStore);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!isAdmin(req)) return notFound();
  const { action } = await ctx.params;
  const env = getEnv();
  const body = await req.json().catch(() => ({}));

  if (action === 'pause' || action === 'resume') {
    await setPayoutsEnabled(action === 'resume');
    await logEvent(action, {});
    return NextResponse.json({ payoutsEnabled: action === 'resume' }, noStore);
  }

  if (action === 'mint') {
    const count = Number(body.count), amount = Number(body.amountBaseUnits), batch = String(body.batch ?? '');
    if (!Number.isInteger(count) || count < 1 || count > 500 || !Number.isInteger(amount) || amount < 1 || amount > 5_000_000 || !/^[\w-]{1,40}$/.test(batch)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const codes = Array.from({ length: count }, generateCode);
    await insertCodes(codes.map((c) => ({ codeHash: hashCode(c, env.CODE_PEPPER), batch, amount: BigInt(amount) })));
    await logEvent('mint', { count, batch, amount });
    // The only time the plain codes exist outside a QR. The database keeps hashes.
    return NextResponse.json({ batch, amountBaseUnits: amount, codes: codes.map((c) => ({ code: c, url: claimUrl(env.PUBLIC_BASE_URL, c) })) }, noStore);
  }

  if (action === 'sweep') {
    const to = String(body.toWallet ?? '');
    if (body.confirm !== 'SWEEP' || !isValidRecipient(to, treasuryAddress())) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    await setPayoutsEnabled(false);
    const conn = new Connection(env.RPC_URL, 'confirmed');
    const treasury = treasuryKeypair(), mint = new PublicKey(env.USDC_MINT), dest = new PublicKey(to);
    const from = getAssociatedTokenAddressSync(mint, treasury.publicKey), toAta = getAssociatedTokenAddressSync(mint, dest);
    const sigs: string[] = [];
    const bal = await getChain().balances(treasury.publicKey, mint);
    if (await conn.getAccountInfo(from)) {
      const tx = new Transaction();
      if (bal.units > 0n) tx.add(
        createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, toAta, dest, mint),
        createTransferCheckedInstruction(from, mint, toAta, treasury.publicKey, bal.units, 6),
      );
      tx.add(createCloseAccountInstruction(from, treasury.publicKey, treasury.publicKey)); // gets the account rent back
      sigs.push(await sendAndConfirmTransaction(conn, tx, [treasury], { commitment: 'confirmed' }));
    }
    const lamports = await conn.getBalance(treasury.publicKey, 'confirmed');
    if (lamports > 5000) {
      const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: dest, lamports: lamports - 5000 }));
      sigs.push(await sendAndConfirmTransaction(conn, tx, [treasury], { commitment: 'confirmed' }));
    }
    await logEvent('sweep', { to, sigs });
    return NextResponse.json({ swept: true, signatures: sigs }, noStore);
  }
  return notFound();
}
