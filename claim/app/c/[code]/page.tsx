import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Brand, Footer } from '@/components/Chrome';
import ClaimPanel from '@/components/ClaimPanel';
import { getEnv } from '@/lib/env';
import { hashCode, normalizeCode } from '@/lib/codes';
import { getSession, lookupCode } from '@/lib/db';
import { usd } from '@/lib/claim';
import { COOKIE, hashToken } from '@/lib/session';
import { browseUrl } from '@/lib/wallets/deeplink';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Good Energy', robots: { index: false, follow: false } };

// Read-only. Opening this page, or a link preview fetching it, never changes a code.
export default async function ClaimPage({ params, searchParams }: {
  params: Promise<{ code: string }>; searchParams: Promise<{ wallet_error?: string }>;
}) {
  const [{ code: raw }, sp] = await Promise.all([params, searchParams]);
  const env = getEnv();
  const code = normalizeCode(decodeURIComponent(raw));
  const token = (await cookies()).get(COOKIE)?.value;
  const session = token ? await getSession(hashToken(token)) : null;

  let view: 'available' | 'claimed' | 'invalid' = 'invalid';
  let amountUsd = '0.99', paidOn: string | null = null, signature: string | null = null, pendingClaimId: string | null = null;
  const found = code ? await lookupCode(hashCode(code, env.CODE_PEPPER)) : null;
  if (found && found.status !== 'void') {
    amountUsd = usd(found.amount);
    const mine = !!found.claim && !!session && found.claim.wallet === session.wallet;
    if (found.status === 'available') view = 'available';
    else if (mine && found.claim!.status !== 'confirmed') { view = 'available'; pendingClaimId = found.claim!.id; }
    else {
      view = 'claimed';
      signature = found.claim?.signature ?? null;
      paidOn = found.claim?.confirmedAt
        ? new Date(found.claim.confirmedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
        : null;
    }
  }
  const here = `${env.PUBLIC_BASE_URL}/c/${code ?? ''}`;
  return (
    <main className="shell">
      <Brand />
      <ClaimPanel
        code={code ?? ''} view={view} amountUsd={amountUsd}
        wallet={session?.wallet ?? null} adult={session?.adult ?? false}
        paidOn={paidOn} signature={signature} pendingClaimId={pendingClaimId}
        walletError={sp.wallet_error ?? null}
        browse={{ phantom: browseUrl('phantom', here, env.PUBLIC_BASE_URL), solflare: browseUrl('solflare', here, env.PUBLIC_BASE_URL) }}
      />
      <Footer />
    </main>
  );
}
