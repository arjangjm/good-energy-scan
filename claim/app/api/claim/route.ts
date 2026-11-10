import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { hashIp } from '@/lib/codes';
import { processClaim } from '@/lib/claim';
import { getChain } from '@/lib/solana/live';
import { clientIp, sameOrigin, sessionFrom } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 30;

// The only request that starts a payout. POST, same-origin, from a tap.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const session = await sessionFrom(req);
  if (!session) return NextResponse.json({ error: 'no_wallet' }, { status: 401 });
  if (!session.adult) return NextResponse.json({ error: 'adult_required' }, { status: 403 });
  const body = await req.json().catch(() => null);
  try {
    const result = await processClaim(
      { code: String(body?.code ?? ''), wallet: session.wallet, ipHash: hashIp(clientIp(req), getEnv().CODE_PEPPER) },
      getChain(),
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ status: 'failed' }, { status: 500 });
  }
}
