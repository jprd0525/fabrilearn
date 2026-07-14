-- ForensiLearn — MASTER tenant-isolation suite (P5).
-- One paste, one run, one grid. Re-proves the entire tenant boundary after any change.
-- Run AFTER all policies files (schema -> policies -> p1 -> p2 -> p3 -> p3b -> p3c).
-- Self-cleaning. Every row should read PASS. This is your regression check AND SOC 2 evidence.
--
-- Mechanism: switches to the `authenticated` role (so RLS applies) and sets app.user_id,
-- exercising the exact functions the live JWT path uses.

-- ============ throwaway fixtures ============
insert into public.tenants (id,name) values
  ('11111111-1111-1111-1111-111111111111','SUITE Lab A'),
  ('22222222-2222-2222-2222-222222222222','SUITE Lab B') on conflict (id) do nothing;
insert into public.memberships (user_id,tenant_id,role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','11111111-1111-1111-1111-111111111111','admin') on conflict do nothing;
insert into public.platform_admins (user_id) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1') on conflict do nothing;
insert into public.app_state (tenant_id,key,doc) values
  ('11111111-1111-1111-1111-111111111111','courses','{"lab":"A"}'),
  ('22222222-2222-2222-2222-222222222222','courses','{"lab":"B"}')
  on conflict (tenant_id,key) do update set doc = excluded.doc;

drop table if exists _suite;
create temp table _suite(ord int, area text, test text, result int, expected int);
grant insert on _suite to authenticated;   -- the tests run AS authenticated, so let them write results

do $$
declare
  A constant uuid := '11111111-1111-1111-1111-111111111111';
  B constant uuid := '22222222-2222-2222-2222-222222222222';
  uA constant text := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';   -- Lab A admin
  uB constant text := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';   -- random user, no roles
  uC constant text := 'cccccccc-cccc-cccc-cccc-ccccccccccc1';   -- platform admin
  n int; ok boolean; tag text; nid uuid;
begin
  set local role authenticated;

  -- ---- ISOLATION (P1) ----
  perform set_config('app.user_id', uA, true); perform set_config('app.tenant_id','', true);
  select count(*) into n from public.app_state;
  insert into _suite values (1,'Isolation','Lab A sees only its own data', n, 1);

  perform set_config('app.tenant_id', B::text, true);
  select count(*) into n from public.app_state;
  insert into _suite values (2,'Isolation','Lab A cannot read Lab B (spoof blocked)', n, 0);

  -- ---- SWITCH (P2) ----
  perform set_config('app.user_id', uC, true); perform set_config('app.tenant_id','', true);
  perform public.set_active_tenant(B);
  select count(*) into n from public.app_state;
  insert into _suite values (3,'Switch','Platform admin switches into Lab B', n, 1);

  perform set_config('app.user_id', uA, true);
  begin perform public.set_active_tenant(B); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; end;
  insert into _suite values (4,'Switch','Regular user rejected from switching to Lab B', case when ok then 1 else 0 end, 1);

  -- ---- PROVISIONING (P3a) ----
  perform set_config('app.user_id', uC, true);
  nid := public.create_tenant('SUITE Temp Lab'::text, null::text[]);
  select count(*) into n from public.entitlements where tenant_id = nid;
  insert into _suite values (5,'Provisioning','Platform admin creates lab + 4 features', n, 4);
  delete from public.tenants where id = nid;   -- clean the temp lab (cascades)

  perform set_config('app.user_id', uB, true);
  begin perform public.create_tenant('SHOULD FAIL'::text, null::text[]); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; end;
  insert into _suite values (6,'Provisioning','Regular user rejected from creating a lab', case when ok then 1 else 0 end, 1);

  -- ---- MEMBERSHIPS (P3b) ----
  perform set_config('app.user_id', uB, true);
  begin perform public.add_membership('x@y.com', B, 'staff'); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; end;
  insert into _suite values (7,'Memberships','Random user rejected from adding people', case when ok then 1 else 0 end, 1);

  perform set_config('app.user_id', uC, true);
  begin perform public.add_membership('nobody@example.com', B, 'staff'); tag := 'noraise';
  exception when insufficient_privilege then tag := 'blocked'; when others then tag := 'notfound'; end;
  insert into _suite values (8,'Memberships','Platform admin passes gate (email not found)', case when tag='notfound' then 1 else 0 end, 1);

  perform set_config('app.user_id', uA, true);
  begin perform public.add_membership('x@y.com', B, 'staff'); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; end;
  insert into _suite values (9,'Memberships','Lab A admin rejected from managing Lab B', case when ok then 1 else 0 end, 1);

  reset role;
end $$;

-- ============ cleanup ============
delete from public.active_tenant   where user_id in ('cccccccc-cccc-cccc-cccc-ccccccccccc1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
delete from public.app_state       where tenant_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from public.memberships     where tenant_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from public.platform_admins where user_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
delete from public.tenants         where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');

-- ============ THE GRID ============
select area, test, result, expected,
       case when result = expected then 'PASS' else 'FAIL' end as status
from _suite order by ord;
