-- Motor app schema: households, members, turn assignments, swap requests, run log.
-- Auth model: anonymous Supabase sign-in per device; each device's auth uid maps to one member.

create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  reminder_time time not null default '10:00',
  run_minutes int not null default 10 check (run_minutes between 1 and 120),
  snooze_minutes int not null default 5 check (snooze_minutes between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  auth_uid uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  rotation_order int not null,
  active boolean not null default true,
  joined_at timestamptz not null default now()
);
create index members_household_idx on public.members(household_id);

-- Accepted swaps land here: a date assigned to a member who is not the rotation default.
create table public.assignments (
  household_id uuid not null references public.households(id) on delete cascade,
  on_date date not null,
  member_id uuid not null references public.members(id),
  note text,
  primary key (household_id, on_date)
);

create table public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  on_date date not null,
  from_member_id uuid not null references public.members(id),
  to_member_id uuid references public.members(id),  -- null = anyone can accept
  status text not null check (status in ('pending','accepted','declined','canceled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.members(id)
);
create index swaps_household_idx on public.swap_requests(household_id, status);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  on_date date not null,
  assigned_member_id uuid references public.members(id),
  status text not null check (status in ('scheduled','started','completed','missed')),
  started_at timestamptz,
  started_by uuid references public.members(id),
  stopped_at timestamptz,
  stopped_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  unique (household_id, on_date)
);

-- Membership check for RLS; security definer so policies don't recurse into members RLS.
create function public.is_member(p_household uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m
    where m.auth_uid = auth.uid() and m.household_id = p_household and m.active
  );
$$;

-- Rotation default: active members ordered by join order, day-number modulo count.
-- Day number must match the app: floor(UTC epoch of the date / 86400).
create function public.rotation_assignment(p_household uuid, p_date date)
returns uuid
language sql stable security definer set search_path = public as $$
  with m as (
    select id, row_number() over (order by rotation_order, joined_at) - 1 as idx
    from public.members
    where household_id = p_household and active
  )
  select id from m
  where idx = (extract(epoch from p_date)::bigint / 86400) % (select count(*) from m);
$$;

create function public.effective_assignment(p_household uuid, p_date date)
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select member_id from public.assignments where household_id = p_household and on_date = p_date),
    public.rotation_assignment(p_household, p_date)
  );
$$;

-- ============ row level security ============

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.assignments enable row level security;
alter table public.swap_requests enable row level security;
alter table public.runs enable row level security;

create policy households_read on public.households for select using (public.is_member(id));
create policy households_update on public.households for update using (public.is_member(id)) with check (public.is_member(id));

create policy members_read on public.members for select using (public.is_member(household_id));
create policy members_update_self on public.members for update using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());

create policy assignments_read on public.assignments for select using (public.is_member(household_id));

create policy swaps_read on public.swap_requests for select using (public.is_member(household_id));
create policy swaps_insert on public.swap_requests for insert with check (
  public.is_member(household_id)
  and from_member_id in (select id from public.members where auth_uid = auth.uid())
);

create policy runs_all on public.runs for all using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ============ RPCs ============

create or replace function public.create_household(p_name text, p_reminder time default '10:00', p_minutes int default 10)
returns table (household_id uuid, code text, member_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_code text;
  v_member uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if char_length(btrim(p_name)) not between 1 and 30 then raise exception 'invalid name'; end if;
  if exists (select 1 from public.members where auth_uid = auth.uid()) then
    raise exception 'device already belongs to a household';
  end if;

  loop
    v_code := (
      select string_agg(ch, '') from (
        select substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (random() * 31)::int, 1) as ch
        from generate_series(1, 6)
      ) s
    );
    exit when not exists (select 1 from public.households h0 where h0.code = v_code);
  end loop;

  insert into public.households (code, reminder_time, run_minutes)
    values (v_code, p_reminder, p_minutes)
    returning id into v_household;

  insert into public.members (household_id, auth_uid, name, rotation_order)
    values (v_household, auth.uid(), btrim(p_name), 0)
    returning id into v_member;

  return query select v_household, v_code, v_member;
end $$;

create or replace function public.join_household(p_code text, p_name text)
returns table (household_id uuid, code text, member_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_code text;
  v_member uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if char_length(btrim(p_name)) not between 1 and 30 then raise exception 'invalid name'; end if;
  if exists (select 1 from public.members where auth_uid = auth.uid()) then
    raise exception 'device already belongs to a household';
  end if;

  select h0.id, h0.code into v_household, v_code from public.households h0
  where h0.code = upper(btrim(p_code));
  if not found then raise exception 'household not found'; end if;

  insert into public.members (household_id, auth_uid, name, rotation_order)
    values (v_household, auth.uid(), btrim(p_name),
            coalesce((select max(m2.rotation_order) + 1 from public.members m2 where m2.household_id = v_household), 0))
    returning id into v_member;

  return query select v_household, v_code, v_member;
end $$;

-- Two-way swap: accepter covers the requester's date, requester repays by taking
-- the accepter's next upcoming date. Both land as rows in assignments.
create or replace function public.accept_swap(p_request_id uuid)
returns table (swap_date date, covered_by uuid, payback_date date, payback_by uuid)
language plpgsql security definer set search_path = public as $$
declare
  r public.swap_requests;
  v_me uuid;
  v_d2 date;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select * into r from public.swap_requests where id = p_request_id;
  if not found then raise exception 'request not found'; end if;
  if r.status <> 'pending' then raise exception 'request is not pending'; end if;
  if r.on_date < (now() at time zone 'Asia/Karachi')::date then raise exception 'request date has passed'; end if;

  select m.id into v_me from public.members m
  where m.auth_uid = auth.uid() and m.household_id = r.household_id and m.active;
  if v_me is null then raise exception 'not a member of this household'; end if;
  if v_me = r.from_member_id then raise exception 'cannot accept your own request'; end if;
  if r.to_member_id is not null and r.to_member_id <> v_me then raise exception 'request addressed to someone else'; end if;

  select d::date into v_d2
  from generate_series(r.on_date::timestamp, (r.on_date + 60)::timestamp, interval '1 day') d
  where d <> r.on_date
    and public.effective_assignment(r.household_id, d::date) = v_me
  order by d
  limit 1;

  if v_d2 is null then raise exception 'no upcoming date found to repay the swap'; end if;

  insert into public.assignments (household_id, on_date, member_id, note)
  values (r.household_id, r.on_date, v_me, 'swap cover'),
         (r.household_id, v_d2, r.from_member_id, 'swap payback')
  on conflict (household_id, on_date) do update
    set member_id = excluded.member_id, note = excluded.note;

  update public.swap_requests
    set status = 'accepted', resolved_at = now(), resolved_by = v_me
    where id = p_request_id;

  return query select r.on_date, v_me, v_d2, r.from_member_id;
end $$;

create or replace function public.cancel_swap(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select m.id into v_me from public.members m where m.auth_uid = auth.uid();
  update public.swap_requests
    set status = 'canceled', resolved_at = now(), resolved_by = v_me
    where id = p_request_id and from_member_id = v_me and status = 'pending';
  if not found then raise exception 'cannot cancel this request'; end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.households;
  alter publication supabase_realtime add table public.members;
  alter publication supabase_realtime add table public.assignments;
  alter publication supabase_realtime add table public.swap_requests;
  alter publication supabase_realtime add table public.runs;
exception
  when duplicate_object then null;  -- already in publication
end $$;
