# FabriLearn — SCORM Content & Review Pipeline (Spec, for later build)

Status: **specified, not built.** Stage 6 builds only the runtime **player** + **bank**.
This document captures the authoring/review workflow so the player is built without
foreclosing it.

## 1. Why this matters
FabriLearn is evolving from a single-shop pilot into a **multi-client content platform**.
Content (SCORM modules) is customized per client, reviewed and signed off by the client,
then published. The review pipeline is a core back-end workflow, not an add-on.

## 2. Roles introduced
- **Platform Admin** (you / Onofrio's internal): uploads drafts, assigns for review,
  reads comments, publishes.
- **Client Reviewer**: sees modules awaiting their review, reviews page-by-page,
  approves or requests edits, submits.
- (Existing shop roles — owner/supervisor/employee — are unaffected.)

## 3. Content lifecycle (state machine)
A module version moves through:

`draft → in_review → changes_requested → (revise) → in_review → approved → published → (update) → …`

- **draft** — Platform Admin uploaded a SCORM package; not visible to shops.
- **in_review** — assigned to a client reviewer; appears in their review queue.
- **changes_requested** — reviewer submitted page-level edits; back to Admin.
- **approved** — reviewer signed off all pages; ready to publish.
- **published (live)** — available in the shop's player and assignable.
- **superseded** — a newer published version replaced it (keep history; never delete).

Every transition is timestamped and attributed. Reuse the tamper-evident chain
(fab-chain.js) for the review sign-off record — a client "Save & Submit" is an
attestation-like, immutable event.

## 4. The page-by-page review tool (client-facing)
Reviewer opens a module in review. Layout: **SCORM page on one side, review panel on
the other (roughly half-and-half).**

Per page, the review panel shows:
- A **checkbox** — "This page is good to go."
- A **pencil (edit)** button — opens a comment/edit box; reviewer types requested change.
- A **save (disk)** button — stores that page's comment, advances to next page.
- Navigation to move through pages; a **progress indicator** (e.g. "7 / 20 pages
  reviewed") where a page counts as reviewed once it's either checked-good or has a
  saved edit.

When all pages are reviewed → **Save & Submit** enabled.
- If any edits were entered → module goes `changes_requested`.
- If all pages checked good, none edited → module goes `approved`.

Data captured per review: moduleId, version, reviewerId, per-page `{pageId, status:
good|edit, comment, timestamp}`, overall result, submit timestamp, signature.

## 5. Platform Admin back-end
- A queue of submitted reviews with their comments.
- **Export comments** — CSV/JSON/printable, page-by-page, so edits can be actioned
  (by hand, or via a **Claude Cowork routine** that ingests the comment set and
  produces a revised SCORM draft).
- Revised draft re-enters the pipeline at `in_review` (new version) for client
  re-sign-off, then `published`.

## 6. Client content-request intake
Separate, lightweight: a client can **log a request** for new content or an update to
existing content. Fields: title, type (new | update), target module (if update),
description, priority, requested-by, date. Appears in the Admin queue; when actioned,
it spawns a draft that enters the pipeline above. Keep it simple — a request list with
statuses (`open → in_progress → delivered → closed`).

## 7. The SCORM bank
A versioned library of all modules across the platform:
- Per module: all versions, their lifecycle state, which client(s) use which version,
  publish history.
- Multi-tenant aware: a base/master module can be customized per client; the bank
  tracks the lineage (master → client variant → versions).

## 8. Architecture implications for the Stage 6 player (decide now)
Building the player without foreclosing the above means settling a few things:

1. **Storage layout.** SCORM packages live in Supabase Storage. Path scheme should
   encode module + version (+ client variant), e.g.
   `scorm/{moduleId}/{version}/…` and, for customized content,
   `scorm/{clientId}/{moduleId}/{version}/…`. Decide the scheme before uploading.

2. **Module identity vs. version.** Today `fab:modules` keys a module by `code`
   (A1, D2…). The platform needs **module + version + lifecycle state + client
   variant**. Introduce a version/lifecycle field on modules now (even if the player
   ignores all but `published`), so we don't migrate later.

3. **Page addressability.** The review tool needs stable **per-page IDs** within a
   SCORM package. The player should surface page/SCO identity from the manifest
   (imsmanifest.xml) so page-level review can hang off it later.

4. **Tenancy for content.** Shop data is single-tenant today; content is inherently
   **cross-tenant** (a master module shared/customized across clients). The bank likely
   lives at the platform (multi-tenant) layer — which is exactly what the reused engine's
   dormant multi-tenant machinery is for. Keep content keys out of the per-shop `fab:*`
   namespace; use a platform-level namespace (e.g. `plat:*`).

5. **Player ↔ record wiring.** The player already has a home: on completion it calls
   the same `completeAssignment` path (score from the SCORM exam, 80% mastery). Keep
   that seam clean so published content flows into the existing status/attestation model.

## 9. What Stage 6 actually builds now
- Supabase **Storage bucket** + policies (one-time setup).
- A **SCORM 1.2 runtime**: serve a package, an iframe player exposing the
  `window.API` object (LMSInitialize/LMSGetValue/LMSSetValue/LMSCommit/LMSFinish),
  persisting progress + score into `app_state`, mapping exam ≥80% to completion.
- A minimal **SCORM bank** (upload a package, list packages, assign to the shop) —
  limited to the player's needs for now.
- Wire the **23 real modules** from the manifest.
- Version/lifecycle field on modules stubbed in (per §8.2) so the review pipeline
  can build on it without a migration.

## 10. Deferred to the review-pipeline build
Everything in §3–§7: the page-by-page review tool, Admin review queue + export,
Claude Cowork revision routine, content-request intake, and the full versioned,
multi-tenant bank.
