-- ForensiLearn — P1 multi-tenant hardening.
-- Run order: 1) schema.sql  2) policies.sql  3) THIS FILE.
-- Idempotent (drop-if-exists throughout). Safe to re-run.

-- =====================================================================
-- 1. Platform-admin designation (cross-tenant operators — "both hats")
-- =====================================================================
create table if not exists public.platform_admins (
  user_id    uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_self on public.platform_admins;
create policy platform_admins_self on public.platform_admins
  for select using (user_id = app.current_user_id());

-- SECURITY DEFINER so the check can read platform_admins regardless of RLS,
-- which also avoids policy recursion. Pinned search_path per SECDEF best practice.
create or replace function app.is_platform_admin() returns boolean
  language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.platform_admins where user_id = app.current_user_id());
$$;

-- =====================================================================
-- 2. Hardened security boundary on app_state
--    Old policy trusted app.current_tenant_id() alone — so anything that could
--    set app.tenant_id could target another tenant. Now a caller may touch a
--    tenant's rows ONLY IF they are a MEMBER of that tenant, OR a platform admin.
--    Still one-tenant-at-a-time (tenant_id = current_tenant_id) so a platform
--    admin operates inside the tenant they've switched into ("acting in: X").
-- =====================================================================
drop policy if exists app_state_rw on public.app_state;
create policy app_state_rw on public.app_state
  for all
  using (
    tenant_id = app.current_tenant_id()
    and ( app.is_platform_admin()
          or exists (select 1 from public.memberships m
                       where m.user_id = app.current_user_id()
                         and m.tenant_id = app_state.tenant_id) )
  )
  with check (
    tenant_id = app.current_tenant_id()
    and ( app.is_platform_admin()
          or exists (select 1 from public.memberships m
                       where m.user_id = app.current_user_id()
                         and m.tenant_id = app_state.tenant_id) )
  );

-- =====================================================================
-- 3. Platform admins can see & manage the control-plane tables (list all
--    tenants to switch into them; provision memberships/entitlements — enables
--    P2/P3). Members keep their existing read-only per-tenant policies.
-- =====================================================================
drop policy if exists tenants_platform on public.tenants;
create policy tenants_platform on public.tenants
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

drop policy if exists memberships_platform on public.memberships;
create policy memberships_platform on public.memberships
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

drop policy if exists entitlements_platform on public.entitlements;
create policy entitlements_platform on public.entitlements
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- =====================================================================
-- 4. Grants (usually already present via Supabase defaults; safe to re-run)
-- =====================================================================
grant usage on schema app to authenticated;
grant execute on function app.is_platform_admin() to authenticated;
grant select on public.platform_admins to authenticated;

-- =====================================================================
-- 5. Make yourself a platform admin (run once, with your auth user id):
--   insert into public.platform_admins (user_id) values ('<your-auth-user-uuid>');
-- =====================================================================
