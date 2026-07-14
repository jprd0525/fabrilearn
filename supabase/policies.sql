-- ForensiLearn — Row Level Security (PORTABLE) — v2. Run after schema.sql.
-- Tables are in `public`; policies reference only app.current_user_id() /
-- app.current_tenant_id(), so they are identical on Supabase and self-host.
-- RLS was already enabled in schema.sql; re-asserting here is idempotent.

alter table public.tenants      enable row level security;
alter table public.memberships  enable row level security;
alter table public.entitlements enable row level security;
alter table public.app_state    enable row level security;

-- A user sees only their own memberships.
drop policy if exists memberships_self on public.memberships;
create policy memberships_self on public.memberships
  for select using (user_id = app.current_user_id());

-- A tenant is visible to its members.
drop policy if exists tenants_member on public.tenants;
create policy tenants_member on public.tenants
  for select using (
    id in (select tenant_id from public.memberships where user_id = app.current_user_id())
  );

-- Entitlements are readable by members of the tenant.
drop policy if exists entitlements_member on public.entitlements;
create policy entitlements_member on public.entitlements
  for select using (tenant_id = app.current_tenant_id());

-- ── THE security boundary: all app_state CRUD confined to the caller's tenant ─
drop policy if exists app_state_rw on public.app_state;
create policy app_state_rw on public.app_state
  for all
  using      (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- NOTE: tenants / memberships / entitlements intentionally have SELECT-only policies.
-- They are managed by an admin/service role (or the SQL editor), not by app clients.


-- ════════════════════════════════════════════════════════════════════════════
-- OPTIONAL: server-side entitlement enforcement (Phase 1 hardening).
-- Makes the DB refuse add-on stores when the tenant's feature is off.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.feature_on(p_feature text) returns boolean
  language sql stable as $$
  select coalesce(
    (select enabled from public.entitlements
       where tenant_id = app.current_tenant_id() and feature_key = p_feature),
    false);
$$;

create or replace function app.key_enabled(p_key text) returns boolean
  language sql stable as $$
  select case p_key
    when 'postboard'    then app.feature_on('community')
    when 'events'       then app.feature_on('eventplanner')
    when 'contests'     then app.feature_on('contests')
    when 'improvements' then app.feature_on('improve')
    else true
  end;
$$;

-- To activate the gate, swap the app_state policy:
--   drop policy if exists app_state_rw on public.app_state;
--   create policy app_state_rw on public.app_state
--     for all
--     using      (tenant_id = app.current_tenant_id() and app.key_enabled(key))
--     with check (tenant_id = app.current_tenant_id() and app.key_enabled(key));
