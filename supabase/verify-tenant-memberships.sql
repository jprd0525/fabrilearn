-- ForensiLearn — P3b verification: membership management is properly gated (GREEN GRID). Self-cleaning.
-- Tests the SECURITY gates (the happy-path "add a real person" is best confirmed manually with a real account).
-- Expect 3 rows, all PASS.

insert into public.tenants (id,name) values
  ('11111111-1111-1111-1111-111111111111','TEST Lab A'),
  ('22222222-2222-2222-2222-222222222222','TEST Lab B') on conflict (id) do nothing;
insert into public.memberships (user_id,tenant_id,role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','11111111-1111-1111-1111-111111111111','admin') on conflict do nothing;
insert into public.platform_admins (user_id) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1') on conflict do nothing;

drop table if exists _mb_results;
create temp table _mb_results(ord int, test text, result int, expected int);

do $$
declare t11 boolean; t12 text; t13 boolean;
begin
  set local role authenticated;

  -- T11: a random user (no admin role anywhere) is rejected
  perform set_config('app.user_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', true);
  begin perform public.add_membership('x@y.com','22222222-2222-2222-2222-222222222222','staff'); t11 := false;
  exception when insufficient_privilege then t11 := true; when others then t11 := false; end;

  -- T12: a platform admin PASSES the permission gate (then correctly hits "no such account")
  perform set_config('app.user_id','cccccccc-cccc-cccc-cccc-ccccccccccc1', true);
  begin perform public.add_membership('nobody@example.com','22222222-2222-2222-2222-222222222222','staff'); t12 := 'no-raise';
  exception when insufficient_privilege then t12 := 'blocked'; when others then t12 := 'notfound'; end;

  -- T13: an admin of Lab A cannot add people to Lab B (not their lab)
  perform set_config('app.user_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);
  begin perform public.add_membership('x@y.com','22222222-2222-2222-2222-222222222222','staff'); t13 := false;
  exception when insufficient_privilege then t13 := true; when others then t13 := false; end;

  reset role;

  insert into _mb_results values
    (11,'T11 random user rejected',                         case when t11 then 1 else 0 end, 1),
    (12,'T12 platform admin passes gate (hits not-found)',  case when t12 = 'notfound' then 1 else 0 end, 1),
    (13,'T13 Lab-A admin rejected from Lab B',              case when t13 then 1 else 0 end, 1);
end $$;

delete from public.memberships     where tenant_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from public.platform_admins where user_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
delete from public.tenants          where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');

select test, result, expected, case when result=expected then 'PASS' else 'FAIL' end as status
from _mb_results order by ord;
