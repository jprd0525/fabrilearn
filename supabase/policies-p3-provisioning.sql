-- ForensiLearn — P3a: lab provisioning (create tenant + features).
-- Run order: schema.sql -> policies.sql -> policies-p1-multitenant.sql -> policies-p2-tenant-switch.sql -> THIS.
-- Idempotent. All writers are platform-admin-gated SECURITY DEFINER functions.

-- Soft-delete flag (prefer archive over destructive delete — 17025 instinct).
alter table public.tenants add column if not exists archived boolean not null default false;

-- Create a lab: inserts the tenant + its default entitlements atomically, returns the new id.
create or replace function public.create_tenant(p_name text, p_features text[] default null)
  returns uuid language plpgsql security definer set search_path = public, app as $$
declare new_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'only a platform admin may create a tenant' using errcode = '42501';
  end if;
  insert into public.tenants (name) values (p_name) returning id into new_id;
  insert into public.entitlements (tenant_id, feature_key, enabled)
    select new_id, f, true
    from unnest(coalesce(p_features, array['community','eventplanner','contests','improve'])) as f
    on conflict (tenant_id, feature_key) do nothing;
  return new_id;
end; $$;

create or replace function public.rename_tenant(p_tenant uuid, p_name text)
  returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_platform_admin() then raise exception 'not permitted' using errcode='42501'; end if;
  update public.tenants set name = p_name where id = p_tenant;
end; $$;

create or replace function public.set_tenant_feature(p_tenant uuid, p_feature text, p_enabled boolean)
  returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_platform_admin() then raise exception 'not permitted' using errcode='42501'; end if;
  insert into public.entitlements (tenant_id, feature_key, enabled)
    values (p_tenant, p_feature, p_enabled)
    on conflict (tenant_id, feature_key) do update set enabled = excluded.enabled;
end; $$;

create or replace function public.archive_tenant(p_tenant uuid, p_archived boolean default true)
  returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_platform_admin() then raise exception 'not permitted' using errcode='42501'; end if;
  update public.tenants set archived = p_archived where id = p_tenant;
end; $$;

grant execute on function public.create_tenant(text, text[])              to authenticated;
grant execute on function public.rename_tenant(uuid, text)                to authenticated;
grant execute on function public.set_tenant_feature(uuid, text, boolean)  to authenticated;
grant execute on function public.archive_tenant(uuid, boolean)            to authenticated;

-- To create a real second lab for testing the switch (run once, as yourself = a platform admin):
--   select public.create_tenant('Demo Lab 2', null);
