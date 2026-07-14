-- ForensiLearn — P1 tenant-isolation verification (results in the GREEN GRID).
-- Run AFTER schema.sql + policies.sql + policies-p1-multitenant.sql. One paste, one run.
-- The results grid will show 4 rows with a PASS/FAIL column. Self-cleaning.
--
-- HOW IT TESTS: switches to the `authenticated` role (so RLS actually applies) and
-- sets app.user_id — the same functions the real signed-in JWT path runs through.

-- ---------- setup (superuser; RLS bypassed) ----------
insert into public.tenants (id, name) values
  ('11111111-1111-1111-1111-111111111111','TEST Lab A'),
  ('22222222-2222-2222-2222-222222222222','TEST Lab B')
on conflict (id) do nothing;

insert into public.memberships (user_id, tenant_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','11111111-1111-1111-1111-111111111111','admin'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','22222222-2222-2222-2222-222222222222','admin')
on conflict do nothing;

insert into public.platform_admins (user_id) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1')
on conflict do nothing;

insert into public.app_state (tenant_id, key, doc) values
  ('11111111-1111-1111-1111-111111111111','courses','{"lab":"A"}'),
  ('22222222-2222-2222-2222-222222222222','courses','{"lab":"B"}')
on conflict (tenant_id, key) do update set doc = excluded.doc;

-- ---------- run the four tests, capture the counts ----------
drop table if exists _iso_results;
create temp table _iso_results(ord int, test text, result int, expected int);

do $$
declare n1 int; n2 int; n4 int; n5 int;
begin
  set local role authenticated;                       -- RLS now applies

  -- T1: Lab A user sees only Lab A
  perform set_config('app.user_id',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);
  perform set_config('app.tenant_id','', true);
  select count(*) into n1 from public.app_state;

  -- T2: Lab A user tries to spoof into Lab B -> blocked
  perform set_config('app.tenant_id','22222222-2222-2222-2222-222222222222', true);
  select count(*) into n2 from public.app_state;

  -- T4: platform admin switches into Lab B -> allowed
  perform set_config('app.user_id',  'cccccccc-cccc-cccc-cccc-ccccccccccc1', true);
  perform set_config('app.tenant_id','22222222-2222-2222-2222-222222222222', true);
  select count(*) into n4 from public.app_state;

  -- T5: platform admin can list all tenants
  perform set_config('app.tenant_id','', true);
  select count(*) into n5 from public.tenants where name like 'TEST Lab%';

  reset role;                                          -- back to superuser to record results

  insert into _iso_results values
    (1,'T1  own-tenant read only',        n1, 1),
    (2,'T2  spoof into Lab B blocked',     n2, 0),
    (3,'T4  platform admin -> Lab B',      n4, 1),
    (4,'T5  platform admin sees all labs', n5, 2);
end $$;

-- ---------- clean up the throwaway test data ----------
delete from public.app_state       where tenant_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from public.memberships     where tenant_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from public.platform_admins where user_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
delete from public.tenants         where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');

-- ---------- READ THIS (the grid result) ----------
select test, result, expected,
       case when result = expected then 'PASS' else 'FAIL' end as status
from _iso_results order by ord;
