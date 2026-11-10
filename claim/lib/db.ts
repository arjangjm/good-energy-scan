import postgres from 'postgres';
import { getEnv } from './env';

let _sql: postgres.Sql | undefined;
export function sql(): postgres.Sql {
  // prepare:false because the Supabase transaction pooler does not keep prepared statements.
  return (_sql ??= postgres(getEnv().DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 }));
}
export async function closeDb() { if (_sql) { await _sql.end({ timeout: 2 }); _sql = undefined; } }

export type ClaimStatus = 'reserved' | 'signed' | 'confirmed' | 'failed';
export type Claim = {
  id: string; seq: number; codeId: number; wallet: string; amount: bigint; status: ClaimStatus;
  attempts: number; signature: string | null; prevSignatures: string[]; rawTx: string | null;
  lastValidBlockHeight: number | null; error: string | null; confirmedAt: Date | null;
};
export type ReserveResult = {
  result: 'reserved' | 'pending' | 'claimed' | 'invalid' | 'paused' | 'limited';
  claimId: string | null; amount: bigint | null; signature: string | null;
};

function toClaim(r: any): Claim {
  return {
    id: r.id, seq: Number(r.seq), codeId: Number(r.code_id), wallet: r.wallet, amount: BigInt(r.amount_base_units),
    status: r.status, attempts: r.attempts, signature: r.signature, prevSignatures: r.prev_signatures ?? [],
    rawTx: r.raw_tx, lastValidBlockHeight: r.last_valid_block_height == null ? null : Number(r.last_valid_block_height),
    error: r.error, confirmedAt: r.confirmed_at,
  };
}

export async function reserveCode(codeHash: string, wallet: string, ipHash: string): Promise<ReserveResult> {
  const [r] = await sql()`select * from reserve_code(${codeHash}, ${wallet}, ${ipHash})`;
  return { result: r.result, claimId: r.claim_id, amount: r.amount == null ? null : BigInt(r.amount), signature: r.signature };
}

export async function getClaim(id: string): Promise<Claim | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await sql()`select * from claims where id = ${id}`;
  return r ? toClaim(r) : null;
}

// reserved -> signed. Only one caller can win for a given attempt number.
export async function markSigned(id: string, expectedAttempts: number, sig: string, rawBase64: string, lastValidBlockHeight: number): Promise<boolean> {
  const rows = await sql()`
    update claims set status = 'signed', attempts = attempts + 1, signature = ${sig}, raw_tx = ${rawBase64},
      last_valid_block_height = ${lastValidBlockHeight}, updated_at = now()
    where id = ${id} and status = 'reserved' and attempts = ${expectedAttempts} returning id`;
  return rows.length === 1;
}

// signed -> confirmed, and the code becomes paid, in one statement.
export async function markConfirmed(id: string, sig: string): Promise<boolean> {
  const rows = await sql()`
    with c as (
      update claims set status = 'confirmed', confirmed_at = now(), updated_at = now(), raw_tx = null
      where id = ${id} and status = 'signed' and signature = ${sig} returning code_id
    )
    update codes set status = 'paid', paid_at = now() from c where codes.id = c.code_id returning codes.id`;
  return rows.length === 1;
}

// signed -> reserved when the transaction can no longer land. The old signature is kept for the record.
export async function markExpired(id: string, sig: string): Promise<boolean> {
  const rows = await sql()`
    update claims set status = 'reserved', signature = null, raw_tx = null, last_valid_block_height = null,
      prev_signatures = array_append(prev_signatures, ${sig}), updated_at = now()
    where id = ${id} and status = 'signed' and signature = ${sig} returning id`;
  return rows.length === 1;
}

export async function markFailed(id: string, error: string, releaseCode: boolean, from: ClaimStatus[] = ['reserved', 'signed']): Promise<boolean> {
  const rows = await sql()`
    with c as (
      update claims set status = 'failed', error = ${error.slice(0, 300)}, updated_at = now()
      where id = ${id} and status in ${sql()(from)} returning code_id
    )
    update codes set status = case when ${releaseCode}::boolean then 'available' else 'void' end, reserved_at = null
    from c where codes.id = c.code_id returning codes.id`;
  return rows.length === 1;
}

export async function setPayoutsEnabled(on: boolean): Promise<void> {
  await sql()`update settings set value = to_jsonb(${on}::boolean) where key = 'payouts_enabled'`;
}
export async function getPayoutsEnabled(): Promise<boolean> {
  const [r] = await sql()`select value from settings where key = 'payouts_enabled'`;
  return r?.value === true;
}

export async function insertCodes(rows: { codeHash: string; batch: string; amount: bigint }[]): Promise<number> {
  if (!rows.length) return 0;
  const values = rows.map((r) => ({ code_hash: r.codeHash, batch: r.batch, amount_base_units: r.amount.toString() }));
  const out = await sql()`insert into codes ${sql()(values, 'code_hash', 'batch', 'amount_base_units')} returning id`;
  return out.length;
}

export type CodeLookup = {
  status: 'available' | 'reserved' | 'paid' | 'void'; amount: bigint;
  claim: { id: string; wallet: string; status: ClaimStatus; signature: string | null; confirmedAt: Date | null } | null;
};
// Read-only. Safe for GET requests and link previews.
export async function lookupCode(codeHash: string): Promise<CodeLookup | null> {
  const [r] = await sql()`
    select c.status, c.amount_base_units, cl.id as claim_id, cl.wallet, cl.status as claim_status, cl.signature, cl.confirmed_at
    from codes c left join claims cl on cl.code_id = c.id and cl.status in ('reserved','signed','confirmed')
    where c.code_hash = ${codeHash}`;
  if (!r) return null;
  return {
    status: r.status, amount: BigInt(r.amount_base_units),
    claim: r.claim_id ? { id: r.claim_id, wallet: r.wallet, status: r.claim_status, signature: r.signature, confirmedAt: r.confirmed_at } : null,
  };
}

export async function recentPayouts(limit: number): Promise<{ seq: number; wallet: string; amount: bigint; signature: string; confirmedAt: Date }[]> {
  const rows = await sql()`
    select seq, wallet, amount_base_units, signature, confirmed_at from claims
    where status = 'confirmed' order by confirmed_at desc limit ${limit}`;
  return rows.map((r) => ({ seq: Number(r.seq), wallet: r.wallet, amount: BigInt(r.amount_base_units), signature: r.signature, confirmedAt: r.confirmed_at }));
}

export async function claimStats(): Promise<{ claimsLastHour: number; pending: number }> {
  const [r] = await sql()`
    select (select count(*) from claims where status <> 'failed' and created_at > now() - interval '1 hour')::int as last_hour,
           (select count(*) from claims where status in ('reserved','signed'))::int as pending`;
  return { claimsLastHour: r.last_hour, pending: r.pending };
}

export type Provider = 'phantom' | 'solflare';
export async function createConnectState(provider: Provider, code: string, adult: boolean, dappPublicKey: string, dappSecretKey: string): Promise<string> {
  const [r] = await sql()`
    insert into connect_states (provider, code, adult, dapp_public_key, dapp_secret_key)
    values (${provider}, ${code}, ${adult}, ${dappPublicKey}, ${dappSecretKey}) returning id`;
  return r.id;
}
// One use, 15 minutes. The code and the secret key are blanked as they are read.
export async function consumeConnectState(id: string): Promise<{ provider: Provider; code: string; adult: boolean; dappSecretKey: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await sql()`
    with old as (select id, code, dapp_secret_key from connect_states
                 where id = ${id} and used_at is null and created_at > now() - interval '15 minutes' for update)
    update connect_states s set used_at = now(), code = null, dapp_secret_key = null
    from old where s.id = old.id
    returning s.provider, s.adult, old.code as code, old.dapp_secret_key as secret`;
  return r ? { provider: r.provider, code: r.code, adult: r.adult, dappSecretKey: r.secret } : null;
}

export async function createSession(tokenHash: string, wallet: string, provider: string, adult: boolean): Promise<void> {
  await sql()`insert into wallet_sessions (token_hash, wallet, provider, adult_confirmed_at)
              values (${tokenHash}, ${wallet}, ${provider}, ${adult ? sql()`now()` : null})`;
}
export async function getSession(tokenHash: string): Promise<{ wallet: string; provider: string; adult: boolean } | null> {
  const [r] = await sql()`select wallet, provider, adult_confirmed_at from wallet_sessions where token_hash = ${tokenHash}`;
  return r ? { wallet: r.wallet, provider: r.provider, adult: r.adult_confirmed_at != null } : null;
}
export async function deleteSession(tokenHash: string): Promise<void> {
  await sql()`delete from wallet_sessions where token_hash = ${tokenHash}`;
}

export async function logEvent(kind: string, data: Record<string, unknown>): Promise<void> {
  try { await sql()`insert into events (kind, data) values (${kind}, ${JSON.stringify(data)}::jsonb)`; } catch { /* audit only */ }
}
