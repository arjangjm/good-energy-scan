import nacl from 'tweetnacl';
import bs58 from 'bs58';

export type Provider = 'phantom' | 'solflare';
export class WalletRejected extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export class BadCallback extends Error {}

const CONNECT: Record<Provider, string> = {
  phantom: 'https://phantom.com/ul/v1/connect',
  solflare: 'https://solflare.com/ul/v1/connect',
};

export function connectUrl(p: Provider, a: { appUrl: string; redirectLink: string; dappPublicKey: string; cluster: 'mainnet-beta' | 'devnet' }): string {
  const q = new URLSearchParams({
    app_url: a.appUrl, dapp_encryption_public_key: a.dappPublicKey, redirect_link: a.redirectLink, cluster: a.cluster,
  });
  return `${CONNECT[p]}?${q.toString()}`;
}

// Opens our page inside the wallet's own browser. The fallback when the deeplink round trip fails.
export function browseUrl(p: Provider, url: string, ref: string): string {
  const base = p === 'phantom' ? 'https://phantom.com/ul/browse/' : 'https://solflare.com/ul/v1/browse/';
  return `${base}${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`;
}

export function decryptConnect(p: Provider, q: URLSearchParams, dappSecretKey: Uint8Array): { publicKey: string; session: string } {
  const errorCode = q.get('errorCode');
  if (errorCode) throw new WalletRejected(errorCode, q.get('errorMessage') ?? 'rejected');
  const walletKey = q.get(`${p}_encryption_public_key`), nonce = q.get('nonce'), data = q.get('data');
  if (!walletKey || !nonce || !data) throw new BadCallback('missing parameter');
  let opened: Uint8Array | null;
  try {
    const shared = nacl.box.before(bs58.decode(walletKey), dappSecretKey);
    opened = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), shared);
  } catch { throw new BadCallback('decode'); }
  if (!opened) throw new BadCallback('decrypt');
  try {
    const { public_key, session } = JSON.parse(new TextDecoder().decode(opened));
    if (typeof public_key !== 'string') throw new Error('no public_key');
    return { publicKey: public_key, session: String(session ?? '') };
  } catch { throw new BadCallback('payload'); }
}
