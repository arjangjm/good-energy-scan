import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { getEnv } from '@/lib/env';
import { generateCode, hashCode } from '@/lib/codes';
import { insertCodes, sql } from '@/lib/db';
import type { Provider } from '@/lib/wallets/deeplink';

// What the wallet app does: encrypt {public_key, session} for the dapp's key and append it to redirect_link.
export function walletCallback(p: Provider, dappPublicKey: Uint8Array, address: string) {
  const wallet = nacl.box.keyPair();
  const nonce = nacl.randomBytes(24);
  const shared = nacl.box.before(dappPublicKey, wallet.secretKey);
  const data = nacl.box.after(new TextEncoder().encode(JSON.stringify({ public_key: address, session: 'opaque' })), nonce, shared);
  return new URLSearchParams({ [`${p}_encryption_public_key`]: bs58.encode(wallet.publicKey), nonce: bs58.encode(nonce), data: bs58.encode(data) });
}

export async function newCode(batch: string, amount = 990000n): Promise<string> {
  const code = generateCode();
  await insertCodes([{ codeHash: hashCode(code, getEnv().CODE_PEPPER), batch, amount }]);
  return code;
}

// Test rows stop counting toward the live limits. (The API role cannot delete.)
export async function retireBatch(batch: string) {
  await sql()`update claims set status = 'failed', signature = null, error = 'test' where code_id in (select id from codes where batch = ${batch})`;
  await sql()`update codes set status = 'void' where batch = ${batch}`;
}
