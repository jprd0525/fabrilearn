-- ForensiLearn — P2a verification: validated switch + resolution (results in the GREEN GRID).
-- Run AFTER policies-p2-tenant-switch.sql. One paste, one run. Self-cleaning.
-- Expect three rows, all PASS.

-- ---------- setup ----------
insert into public.tenants (id,name) values
  ('11111111-1111-1111-1111-111111111111','TEST Lab A'),
  ('22222222-2222-2222-2222-222222222222','TEST Lab B') on conflict (id) do nothing;
insert into public.memberships (user_id,tenant_id,role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','11111111-1111-1111-1111-111111111111','admin') on conflict do nothing;
insert into public.platform_admins (user_id) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1') on conflict do nothing;
insert into public.app_state (tenant_id,key,doc) values
  ('11111111-1111-1111-1111-111111111111','courses','{"lab":"A"}'),
  ('22222222-2222-2222-2222-222222222222','courses','{"lab":"B"}')
  on conflict (tenant_id,key) do update set doc = excluded.doc;

drop table if exists _sw_results;
create temp table _sw_results(ord int, test text, result int, expected int);

do $$
declare n6 int; t7_ok boolean; t8 int;
begin
  set local role authenticated;

  -- T6: platform admin selects Lab B, then resolves to + sees Lab B
  perform set_config('app.user_id','cccccccc-cccc-cccc-cccc-ccccccccccc1', true);
  perform set_config('app.tenant_id','', true);
  perform public.set_active_tenant('22222222-2222-2222-2222-222222222222');
  select count(*) into n6 from public.app_state;

  -- T7: regular Lab A user is REJECTED trying to select Lab B
  perform set_config('app.user_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);
  begin
    perform public.set_active_tenant('22222222-2222-2222-2222-222222222222');
    t7_ok := false;                       -- got here = NOT rejected = fail
  exception when insufficient_privilege then
    t7_ok := true;                        -- correctly rejected = pass
  end;

  -- T8: regular Lab A user still resolves to (and sees only) Lab A
  perform set_config('app.tenant_id','', true);
  select count(*) into t8 from public.app_state;

  reset role;

  insert into _sw_results values
    (6,'T6 platform admin switches into Lab B', n6, 1),
    (7,'T7 regular user rejected from Lab B',   case when t7_ok then 1 else 0 end, 1),
    (8,'T8 regular user still sees only Lab A',  t8, 1);
end $$;

-- ---------- cleanup (incl. active_tenant rows created above) ----------
delete from public.active_tenant   where user_id in ('cccccccc-cccc-cccc-cccc-ccccccccccc1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
delete from public.app_state       where tenant_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from public.memberships     where tenant_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from public.platform_admins where user_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
delete from public.tenants         where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');

-- ---------- READ THIS (the grid) ----------
select test, result, expected, case when result=expected then 'PASS' else 'FAIL' end as status
from _sw_results order by ord;
