-- ForensiLearn — P2a: active-tenant + validated switch (hard-reload model).
-- Run order: schema.sql -> policies.sql -> policies-p1-multitenant.sql -> THIS FILE.
-- Idempotent. NOTE: re-running schema.sql later reverts current_tenant_id(); re-run this file after.

-- 1) The user's currently-selected lab (one row per user; survives a page reload).
create table if not exists public.active_tenant (
  user_id    uuid primary key,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.active_tenant enable row level security;
drop policy if exists active_tenant_self on public.active_tenant;
create policy active_tenant_self on public.active_tenant
  for select using (user_id = app.current_user_id());
-- (No write policy on purpose: the ONLY writer is set_active_tenant() below.)

-- 2) Resolution order now: explicit override  ->  chosen active tenant  ->  first membership.
--    Regular users never set the first two, so they still resolve to their own lab.
create or replace function app.current_tenant_id() returns uuid
  language sql stable as $$
  select coalesce(
    nullif(current_setting('app.tenant_id', true), '')::uuid,
    (select tenant_id from public.active_tenant where user_id = app.current_user_id()),
    (select m.tenant_id from public.memberships m
       where m.user_id = app.current_user_id()
       order by m.created_at limit 1)
  );
$$;

-- 3) The ONLY way to change your active lab. Validates membership-or-platform-admin, then upserts.
--    Lives in public so supabase.rpc('set_active_tenant', { target }) can reach it.
create or replace function public.set_active_tenant(target uuid) returns void
  language plpgsql security definer set search_path = public, app as $$
begin
  if not (app.is_platform_admin() or exists (
      select 1 from public.memberships m
      where m.user_id = app.current_user_id() and m.tenant_id = target)) then
    raise exception 'not permitted to act in tenant %', target using errcode = '42501';
  end if;
  insert into public.active_tenant (user_id, tenant_id)
    values (app.current_user_id(), target)
    on conflict (user_id) do update set tenant_id = excluded.tenant_id, updated_at = now();
end; $$;

-- 4) Convenience read for the front-end: the effective tenant id after resolution.
create or replace function public.current_tenant() returns uuid
  language sql stable as $$
  select app.current_tenant_id();
$$;

-- 5) Grants
grant select on public.active_tenant to authenticated;
grant execute on function public.set_active_tenant(uuid) to authenticated;
grant execute on function public.current_tenant() to authenticated;
