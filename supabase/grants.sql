-- FabriLearn — schema grants (Stage 1 fix, captured)
-- Run AFTER schema.sql + policies.sql, BEFORE (or after) the seed.
-- New run order: schema.sql -> policies.sql -> grants.sql -> seed.
--
-- WHY: schema.sql puts the auth-coupled helper functions in a schema called `app`
-- (app.current_user_id(), app.current_tenant_id(), ...). A fresh Supabase project
-- does NOT automatically let the signed-in roles enter that schema, so the very
-- first call fails with: "permission denied for schema app". These two grants
-- open the door (usage) and allow the calls (execute). They change permissions
-- only — no tables, data, or RLS policies are touched; row-level security still
-- governs what is actually readable.
--
-- Kept as a SEPARATE file (not folded into the verbatim engine SQL) so the engine
-- files stay byte-identical to the ForensiLearn handoff for COI diff-verification.

grant usage on schema app to authenticated, anon;
grant execute on all functions in schema app to authenticated, anon;

-- Make future functions in `app` inherit the same execute grant, so later stages
-- that add helpers don't reintroduce the permission error.
alter default privileges in schema app
  grant execute on functions to authenticated, anon;
