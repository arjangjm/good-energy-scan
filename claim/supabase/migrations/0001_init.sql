-- Good Energy scan to earn. Applied to project good-energy-scan on Nov 10, 2026.
create table public.settings (key text primary key, value jsonb not null);
insert into public.settings (key, value) values
  ('payouts_enabled', 'true'::jsonb),
  ('limits', '{"wallet_per_day":10,"ip_per_hour":20,"global_per_hour":20,"global_base_units_per_day":10000000}'::jsonb);

-- One row per can. Only a keyed hash of the code is stored.
create table public.codes (
  id bigserial primary key,
  code_hash text unique not null,
  batch text not null,
  amount_base_units bigint not null check (amount_base_units > 0),
  status text not null default 'available' check (status in ('available','reserved','paid','void')),
  created_at timestamptz not null default now(),
  reserved_at timestamptz,
  paid_at timestamptz
);

-- One row per payout attempt. The signed transaction is saved here before it is sent.
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  code_id bigint not null references public.codes(id),
  wallet text not null,
  amount_base_units bigint not null,
  status text not null default 'reserved' check (status in ('reserved','signed','confirmed','failed')),
  attempts int not null default 0,
  signature text unique,
  prev_signatures text[] not null default '{}',
  raw_tx text,
  last_valid_block_height bigint,
  ip_hash text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);
-- A code can have only one live claim.
create unique index claims_one_live_per_code on public.claims(code_id) where status in ('reserved','signed','confirmed');
create index claims_wallet_created on public.claims(wallet, created_at);
create index claims_ip_created on public.claims(ip_hash, created_at);

-- Wallet connect in progress. Rows work once, for 15 minutes.
create table public.connect_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('phantom','solflare')),
  code text,
  adult boolean not null default false,
  dapp_public_key text not null,
  dapp_secret_key text,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table public.wallet_sessions (
  token_hash text primary key,
  wallet text not null,
  provider text not null,
  adult_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.events (
  id bigserial primary key,
  kind text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

alter table public.settings enable row level security;
alter table public.codes enable row level security;
alter table public.claims enable row level security;
alter table public.connect_states enable row level security;
alter table public.wallet_sessions enable row level security;
alter table public.events enable row level security;

-- Reserves a code for a wallet. The row lock makes racing claims wait in line, so one wins.
create or replace function public.reserve_code(p_code_hash text, p_wallet text, p_ip_hash text)
returns table (result text, claim_id uuid, amount bigint, signature text)
language plpgsql security definer set search_path = public as $$
declare v_code codes%rowtype; v_claim claims%rowtype; v_lim jsonb;
begin
  if not coalesce((select (value #>> '{}')::boolean from settings where key = 'payouts_enabled'), false) then
    return query select 'paused', null::uuid, null::bigint, null::text; return;
  end if;
  select * into v_code from codes where code_hash = p_code_hash for update;
  if not found or v_code.status = 'void' then
    return query select 'invalid', null::uuid, null::bigint, null::text; return;
  end if;
  if v_code.status <> 'available' then
    select * into v_claim from claims c where c.code_id = v_code.id and c.status in ('reserved','signed','confirmed') limit 1;
    return query select case when v_claim.wallet = p_wallet and v_claim.status <> 'confirmed' then 'pending' else 'claimed' end,
                        v_claim.id, v_claim.amount_base_units, v_claim.signature;
    return;
  end if;
  select value into v_lim from settings where key = 'limits';
  if (select count(*) from claims c where c.wallet = p_wallet and c.status <> 'failed' and c.created_at > now() - interval '1 day') >= (v_lim->>'wallet_per_day')::int
     or (select count(*) from claims c where c.ip_hash = p_ip_hash and c.status <> 'failed' and c.created_at > now() - interval '1 hour') >= (v_lim->>'ip_per_hour')::int
     or (select count(*) from claims c where c.status <> 'failed' and c.created_at > now() - interval '1 hour') >= (v_lim->>'global_per_hour')::int
     or (select coalesce(sum(c.amount_base_units), 0) from claims c where c.status <> 'failed' and c.created_at > now() - interval '1 day')
        + v_code.amount_base_units > (v_lim->>'global_base_units_per_day')::bigint then
    return query select 'limited', null::uuid, null::bigint, null::text; return;
  end if;
  update codes set status = 'reserved', reserved_at = now() where id = v_code.id and status = 'available';
  insert into claims (code_id, wallet, amount_base_units, ip_hash)
    values (v_code.id, p_wallet, v_code.amount_base_units, p_ip_hash) returning * into v_claim;
  return query select 'reserved', v_claim.id, v_claim.amount_base_units, null::text;
end $$;
revoke all on function public.reserve_code(text, text, text) from public, anon, authenticated;

-- The app's database role. It can read and write these tables, and nothing else. Set the password by hand:
--   create role ge_api with login password '<40 random characters>';
grant usage on schema public to ge_api;
grant execute on function public.reserve_code(text, text, text) to ge_api;
grant select, insert, update on public.settings, public.codes, public.claims, public.connect_states, public.wallet_sessions, public.events to ge_api;
grant delete on public.wallet_sessions to ge_api;
grant usage, select on all sequences in schema public to ge_api;
create policy ge_api_all on public.settings for all to ge_api using (true) with check (true);
create policy ge_api_all on public.codes for all to ge_api using (true) with check (true);
create policy ge_api_all on public.claims for all to ge_api using (true) with check (true);
create policy ge_api_all on public.connect_states for all to ge_api using (true) with check (true);
create policy ge_api_all on public.wallet_sessions for all to ge_api using (true) with check (true);
create policy ge_api_all on public.events for all to ge_api using (true) with check (true);
