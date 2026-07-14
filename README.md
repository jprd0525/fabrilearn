# FabriLearn

Lean competency-management frontend for a granite/fabrication shop, built on the reused
ForensiLearn **engine** (Supabase schema + RLS + `app_state` key-value store + adapter).
The engine is domain-agnostic and copied verbatim; the frontend is new.

**Architecture note (COI):** this is *a new app on a generic engine* — no forensic frontend
code is carried over. Engine files under `supabase/` and `supabase-adapter.js` are unmodified
from the handoff. Use a **separate Supabase project** from ForensiLearn.

## Stage 1 — engine confirmation (this build)

The app currently mounts a single verification screen behind the auth gate. It proves the
full seam every later feature rides on: **sign-in → hydrate (`getState`) → persist
(`saveState`) → survive reload**, under RLS, scoped to the shop tenant.

### Setup

1. Create a new Supabase project (Central Canada region for data residency).
2. SQL editor → run, in order:
   1. `supabase/schema.sql`
   2. `supabase/policies.sql`
   3. `supabase/seed-fabrilearn-single-tenant.sql` — first create an auth user
      (Authentication → Add user), then paste its UUID into the seed before running.
   - Do **not** run the `policies-p1/p2/p3*` multi-tenant files yet. Single-tenant
     mode needs only the base schema + policies; the P-files wait for shop #2.
3. `cp .env.example .env.local` and fill in the project URL + anon key.
4. `npm install && npm run dev`
5. Sign in, press **Run round-trip**, reload the page. If the write count survives
   the reload, Stage 1 is done.

`npm run build` produces the deployable bundle (Netlify config included).

## Conventions

- All FabriLearn `app_state` keys are namespaced **`fab:*`** (e.g. `fab:employees`,
  `fab:assignments`) so they can never collide with forensic keys.
- Terminology is fabrication-only: Shop, Employee, Ready to Work, Onboarding Plan,
  Training Area. No forensic term ships in this codebase.

## Build stages

1. ✅ Engine confirm (this)
2. Data model + recurrence (`fab:*` stores, seven-status model incl. Refresher Due)
3. App shell + the ten screens
4. Attestations + supervisor sign-offs with immutability (supersede, never edit)
5. Reports + documents
6. SCORM 1.2 player layer + wire the 23 modules
