import { NextRequest, NextResponse } from 'next/server';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { getEnv } from '@/lib/env';
import { normalizeCode } from '@/lib/codes';
import { createConnectState, Provider } from '@/lib/db';
import { connectUrl } from '@/lib/wallets/deeplink';
import { sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';

// Makes one connect link per wallet. The encryption key pair stays on the server, so the
// wallet can send the user back to any tab or browser and the connect still finishes.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const code = normalizeCode(String(body?.code ?? ''));
  if (!code || body?.adult !== true) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const base = getEnv().PUBLIC_BASE_URL;
  const out: Record<string, string> = {};
  for (const provider of ['phantom', 'solflare'] as Provider[]) {
    const kp = nacl.box.keyPair();
    const dappPublicKey = bs58.encode(kp.publicKey);
    const id = await createConnectState(provider, code, true, dappPublicKey, bs58.encode(kp.secretKey));
    out[provider] = connectUrl(provider, { appUrl: base, redirectLink: `${base}/cb/${id}`, dappPublicKey, cluster: 'mainnet-beta' });
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
