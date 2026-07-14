-- FabriLearn — single-tenant seed (Stage 1)
-- Run AFTER schema.sql + policies.sql, in the Supabase SQL editor (service role, bypasses RLS).
--
-- Single-tenant mode: exactly one tenant row. app.current_tenant_id() resolves it
-- automatically from the user's first membership — no tenant-switching machinery
-- needed. The multi-tenant P1–P3 files stay unrun until there is a shop #2.
--
-- STEP 0 (manual, in the Dashboard): Authentication -> Add user
--   e.g. owner@shop.example with a password. Copy the user's UUID, paste below.

-- 1) The one shop.
insert into public.tenants (id, name)
values ('00000000-0000-0000-0000-0000000000f1', 'Onofrio''s Top Shop')
on conflict (id) do nothing;

-- 2) Link the owner/supervisor login to the shop as admin.
--    REPLACE the placeholder with the real auth user UUID from Step 0.
insert into public.memberships (user_id, tenant_id, role)
values ('REPLACE-WITH-AUTH-USER-UUID', '00000000-0000-0000-0000-0000000000f1', 'admin')
on conflict (user_id, tenant_id) do nothing;

-- 3) No entitlements needed: FabriLearn's ten screens are core, not add-ons.
--    (The entitlement gate in policies.sql only fires for add-on feature keys.)

-- Verify (should return 1 row each):
--   select * from public.tenants;
--   select * from public.memberships;
