import { NextRequest, NextResponse } from 'next/server';
import bs58 from 'bs58';
import { getEnv } from '@/lib/env';
import { consumeConnectState, createSession } from '@/lib/db';
import { decryptConnect, WalletRejected } from '@/lib/wallets/deeplink';
import { isValidRecipient } from '@/lib/solana/payout';
import { treasuryAddress } from '@/lib/treasury';
import { COOKIE, cookieOptions, newToken } from '@/lib/session';

export const runtime = 'nodejs';

// The wallet app sends the user here. iOS may open it in a new tab or another browser,
// so this works from the saved state alone, with no cookies.
export async function GET(req: NextRequest, ctx: { params: Promise<{ state: string }> }) {
  const { state } = await ctx.params;
  const base = getEnv().PUBLIC_BASE_URL;
  const go = (path: string) => NextResponse.redirect(`${base}${path}`, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  const st = await consumeConnectState(state);
  if (!st) return go('/?wallet_error=expired');
  const back = `/c/${st.code}`;
  try {
    const { publicKey } = decryptConnect(st.provider, req.nextUrl.searchParams, bs58.decode(st.dappSecretKey));
    if (!isValidRecipient(publicKey, treasuryAddress())) return go(`${back}?wallet_error=bad`);
    const { token, hash } = newToken();
    await createSession(hash, publicKey, st.provider, st.adult);
    const res = go(back);
    res.cookies.set(COOKIE, token, cookieOptions(base));
    return res;
  } catch (e) {
    return go(`${back}?wallet_error=${e instanceof WalletRejected ? 'rejected' : 'bad'}`);
  }
}
