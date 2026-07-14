-- ForensiLearn — P3a verification: provisioning is platform-admin-only (results in the GREEN GRID).
-- Run AFTER policies-p3-provisioning.sql. One paste, one run. Self-cleaning. Expect 2 rows, both PASS.

-- ---------- setup ----------
insert into public.platform_admins (user_id) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1') on conflict do nothing;
-- user A (aaaa...a1) is intentionally NOT a platform admin.

drop table if exists _p3_results;
create temp table _p3_results(ord int, test text, result int, expected int);

do $$
declare new_id uuid; ent_count int; t10_ok boolean;
begin
  set local role authenticated;

  -- T9: a platform admin creates a lab -> tenant + its 4 default features exist
  perform set_config('app.user_id','cccccccc-cccc-cccc-cccc-ccccccccccc1', true);
  new_id := public.create_tenant('TEST Provisioned Lab', null);
  select count(*) into ent_count from public.entitlements where tenant_id = new_id;

  -- T10: a regular (non-platform-admin) user is rejected
  perform set_config('app.user_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);
  begin
    perform public.create_tenant('SHOULD FAIL', null);
    t10_ok := false;                       -- got here = NOT rejected = fail
  exception when insufficient_privilege then
    t10_ok := true;                        -- correctly rejected = pass
  end;

  reset role;

  insert into _p3_results values
    (9, 'T9  platform admin created lab + 4 features', ent_count, 4),
    (10,'T10 regular user rejected from create_tenant', case when t10_ok then 1 else 0 end, 1);

  -- remove the throwaway lab (cascades its entitlements)
  delete from public.tenants where id = new_id;
end $$;

-- ---------- cleanup ----------
delete from public.platform_admins where user_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';

-- ---------- READ THIS (the grid) ----------
select test, result, expected, case when result=expected then 'PASS' else 'FAIL' end as status
from _p3_results order by ord;
