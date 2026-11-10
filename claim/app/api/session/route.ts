import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { createSession, deleteSession } from '@/lib/db';
import { isValidRecipient } from '@/lib/solana/payout';
import { treasuryAddress } from '@/lib/treasury';
import { COOKIE, cookieOptions, hashToken, newToken } from '@/lib/session';
import { sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';
const PROVIDERS = ['manual', 'phantom-injected', 'solflare-injected'];

// For a pasted address, or a wallet's built-in browser. Deeplink connects go through /cb instead.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const wallet = String(body?.wallet ?? '').trim();
  if (body?.adult !== true || !PROVIDERS.includes(body?.provider) || !isValidRecipient(wallet, treasuryAddress())) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const { token, hash } = newToken();
  await createSession(hash, wallet, body.provider, true);
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(COOKIE, token, cookieOptions(getEnv().PUBLIC_BASE_URL));
  return res;
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const token = req.cookies.get(COOKIE)?.value;
  if (token) await deleteSession(hashToken(token));
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(COOKIE, '', { ...cookieOptions(getEnv().PUBLIC_BASE_URL), maxAge: 0 });
  return res;
}
