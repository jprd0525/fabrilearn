-- ForensiLearn — P3b: membership management (add/remove/list people on a lab).
-- Run after policies-p3-provisioning.sql. Idempotent. All gated: platform admin OR that lab's own admin.
-- add/list read auth.users (for email <-> user_id), so they are SECURITY DEFINER.

create or replace function public.add_membership(p_email text, p_tenant uuid, p_role text default 'staff')
  returns void language plpgsql security definer set search_path = public, auth, app as $$
declare uid uuid;
begin
  if not (app.is_platform_admin() or exists (
      select 1 from public.memberships m
      where m.user_id = app.current_user_id() and m.tenant_id = p_tenant and m.role = 'admin')) then
    raise exception 'not permitted to manage this lab' using errcode = '42501';
  end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    raise exception 'no account exists with email %', p_email using errcode = 'P0002';
  end if;
  delete from public.memberships where user_id = uid and tenant_id = p_tenant;   -- idempotent upsert
  insert into public.memberships (user_id, tenant_id, role) values (uid, p_tenant, coalesce(nullif(p_role,''),'staff'));
end; $$;

create or replace function public.remove_membership(p_user uuid, p_tenant uuid)
  returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not (app.is_platform_admin() or exists (
      select 1 from public.memberships m
      where m.user_id = app.current_user_id() and m.tenant_id = p_tenant and m.role = 'admin')) then
    raise exception 'not permitted to manage this lab' using errcode = '42501';
  end if;
  delete from public.memberships where user_id = p_user and tenant_id = p_tenant;
end; $$;

create or replace function public.list_memberships(p_tenant uuid)
  returns table(user_id uuid, email text, role text)
  language plpgsql security definer set search_path = public, auth, app as $$
begin
  if not (app.is_platform_admin() or exists (
      select 1 from public.memberships m
      where m.user_id = app.current_user_id() and m.tenant_id = p_tenant)) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role
    from public.memberships m join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant order by u.email;
end; $$;

grant execute on function public.add_membership(text, uuid, text) to authenticated;
grant execute on function public.remove_membership(uuid, uuid)     to authenticated;
grant execute on function public.list_memberships(uuid)            to authenticated;
