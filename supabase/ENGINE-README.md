# ForensiLearn — Connect to Supabase (self-host-portable)

Three files, run/wired in order. The design keeps **all auth coupling inside two SQL functions** so the same schema, policies, and adapter run unchanged on Supabase Cloud, self-hosted Supabase, or plain Postgres (RDS / Azure DB) later — which is what keeps the GC Protected-B hosting decision open.

## Files
- **`schema.sql`** — `tenants`, `memberships`, `entitlements`, and the generic `app_state` store (one JSON doc per tenant+key, covering all ~55 stores plus the four list entities). Plus the two portability functions.
- **`policies.sql`** — RLS. Tenant isolation on `app_state` is the security boundary; an optional, ready-to-swap entitlement gate refuses add-on stores when a tenant's feature is off.
- **`supabase-adapter.js`** — drop-in replacement for the artifact's `chainApi`. The whole seam rides on `getState`/`saveState` against `app_state`; the four typed entities and Storage uploads map onto the same layer.

## Steps
1. Create a Supabase project — **pick the Central Canada region** for data residency.
2. SQL editor → run `schema.sql`, then `policies.sql`.
3. Create an auth user; run the seed block at the bottom of `schema.sql` to link them to a tenant and enable add-ons.
4. `npm i @supabase/supabase-js`; set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
5. Wire the adapter into the artifact per the comment block in `supabase-adapter.js` (set `CHAIN_API` truthy, import `chainApi`, ensure a session before hydrate).

## Verify
Sign in, change one thing in any store, reload — it should persist instead of reseeding. Because everything flows through `getState`/`saveState`, that single round-trip proves ~all stores at once. Saves already fail soft, so you can bring things up incrementally.

## The portability guarantee
The only Supabase-specific lines are: the `createClient` call, Storage in `uploadFile`, and the JWT branch of `app.current_user_id()`. To move to plain Postgres, swap the client for one that runs `SET LOCAL app.user_id = '<uuid>'` per request and point Storage elsewhere — **tables, policies, and the app are untouched.** No Supabase-proprietary feature sits in the data path (no Realtime, no PostgREST-only RPC, no Edge-Function dependency for core CRUD).

## Not yet wired (by design, matches the seam doc)
- **Email / SCORM** stay on the in-memory mocks until you add Supabase Edge Functions (`sendEmail`, `ingestScorm` stubs are commented in the adapter).
- **Server-authoritative IDs, the progress-key reschema, cert-key reconciliation** — backend-phase items tracked in `pre-backend-part2-store-seam-inventory.md`.
- **Protected B / CCCS** is a hosting decision, not a code change: this same kit deploys to self-hosted Supabase or managed Postgres inside a CCCS-assessed Canadian region when a lab requires it.

## Multi-tenant P1 (added session 2bn)
Run order now: 1) schema.sql  2) policies.sql  3) **policies-p1-multitenant.sql**
Then run **verify-tenant-isolation.sql** to prove the boundary (self-cleaning; expected
results are commented per test). Make yourself a platform admin with:
`insert into public.platform_admins (user_id) values ('<your-auth-user-uuid>');`
If a test errors with "permission denied", grant the `authenticated` role select/insert
on public.app_state / public.tenants (Supabase usually grants these by default).

## Multi-tenant P2a (added session 2bo) — validated switch
Run order now: schema.sql -> policies.sql -> policies-p1-multitenant.sql -> **policies-p2-tenant-switch.sql**
Then run **verify-tenant-switch.sql** (expect 3 rows, all PASS). Adds: `active_tenant` table, an
`active_tenant`-aware `current_tenant_id()`, and `public.set_active_tenant(target)` (validated:
member-or-platform-admin) + `public.current_tenant()`. Re-running schema.sql reverts current_tenant_id()
— re-run the P2 file after if you ever do.

## Multi-tenant P3a (added session 2bq) — lab provisioning
Run order: ... -> policies-p2-tenant-switch.sql -> **policies-p3-provisioning.sql**
Then **verify-tenant-provisioning.sql** (expect 2 rows, both PASS). Adds `tenants.archived` + RPCs
`create_tenant(name,features[])`, `rename_tenant`, `set_tenant_feature`, `archive_tenant` (all
platform-admin-gated). Create a real 2nd lab to test switching: `select public.create_tenant('Demo Lab 2', null);`
