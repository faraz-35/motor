-- Device account pool: the app can't use anonymous sign-ins (disabled on this
-- project) or email signup (requires confirmation), so devices claim one of a
-- fixed pool of pre-confirmed auth users and sign in with its password.
-- Users themselves are seeded by scripts/seed-pool.mjs via GoTrue's admin API
-- so password hashes are exactly what the auth service produces.

create table if not exists public.device_accounts (
  email text primary key,
  password text not null,
  claimed boolean not null default false,
  claimed_at timestamptz
);

alter table public.device_accounts enable row level security;
-- no policies: unreachable via REST; only the claim RPC touches it.

-- Atomically hand out one unclaimed account. Returns no rows when exhausted.
create or replace function public.claim_device_account()
returns table (email text, password text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.device_accounts da
  set claimed = true, claimed_at = now()
  where da.email = (
    select d.email from public.device_accounts d
    where not d.claimed
    order by d.email
    for update skip locked
    limit 1
  )
  returning da.email, da.password;
end $$;

-- Dev helper: release all claims.
create or replace function public.release_device_pool()
returns void
language sql security definer set search_path = public as $$
  update public.device_accounts set claimed = false, claimed_at = null;
$$;
