// ForensiLearn — Supabase data adapter
// Drop-in replacement for the in-artifact `chainApi` (and the storage path of `chainServices`).
//
// PORTABLE BY DESIGN: every read/write goes through app.app_state via standard SQL + RLS.
// Nothing here is Supabase-proprietary except the client object and Storage. To self-host on
// plain Postgres later, replace `supabase` with any client that (a) authenticates the user and
// (b) runs `SET LOCAL app.user_id = '<uuid>'` (and optionally app.tenant_id) per request — the
// table/policy layer and the rest of the app are untouched.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;       // https://xxxx.supabase.co
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Current user's display name — a LIVE BINDING the app imports as `ME`.
// Set from the session at sign-in. (ES module live bindings mean the app sees
// the updated value at read time, with no extra plumbing.)
export let ME = "A. Rossi";
export function chainSetUserFromSession(session) {
  const u = session && session.user;
  if (!u) return;
  const m = u.user_metadata || {};
  ME = m.display_name || m.full_name || m.name || u.email || "User";
}

// ── Generic state store (the whole seam rides on these two) ──────────────────
async function getState(key) {
  const { data, error } = await supabase
    .from("app_state").select("doc").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.doc : null;        // null -> app keeps its seed for that store
}

async function saveState(key, doc) {
  // tenant_id is filled by the column default app.current_tenant_id(); RLS enforces it.
  const { error } = await supabase
    .from("app_state").upsert({ key, doc }, { onConflict: "tenant_id,key" });
  if (error) throw error;
}

// ── chainApi: same shape the artifact already calls (just swap the object in) ─
export const chainApi = {
  getAuthorizations:  ()     => getState("authorizations"),
  saveAuthorizations: (list) => saveState("authorizations", list),
  getCourses:         ()     => getState("courses"),
  saveCourses:        (list) => saveState("courses", list),
  getEnrollments:     ()     => getState("enrollments"),
  saveEnrollments:    (list) => saveState("enrollments", list),
  getCompletions:     ()     => getState("completions"),
  saveCompletions:    (list) => saveState("completions", list),
  getState,
  saveState,

  //  Multi-tenant (P2): list labs (RLS-scoped), read effective lab, switch labs (validated RPC)
  listTenants:     async ()       => { let q = await supabase.from("tenants").select("id,name,archived").order("name"); if (q.error) q = await supabase.from("tenants").select("id,name").order("name"); if (q.error) return null; return (q.data || []).filter((t) => !t.archived); },
  currentTenant:   async ()       => { const { data, error } = await supabase.rpc("current_tenant"); return error ? null : data; },
  setActiveTenant: async (target)  => { const { error } = await supabase.rpc("set_active_tenant", { target }); if (error) throw error; },
  listEntitlements: async (tenantId) => { const { data, error } = await supabase.from("entitlements").select("feature_key,enabled").eq("tenant_id", tenantId); return error ? null : data; },
  createTenant:    async (name)      => { const { data, error } = await supabase.rpc("create_tenant", { p_name: name }); if (error) throw error; return data; },
  renameTenant:    async (id, name)  => { const { error } = await supabase.rpc("rename_tenant", { p_tenant: id, p_name: name }); if (error) throw error; },
  archiveTenant:   async (id, arch)  => { const { error } = await supabase.rpc("archive_tenant", { p_tenant: id, p_archived: arch }); if (error) throw error; },
  listMemberships: async (tenantId)       => { const { data, error } = await supabase.rpc("list_memberships", { p_tenant: tenantId }); return error ? null : data; },
  addMembership:   async (email, tid, role) => { const { error } = await supabase.rpc("add_membership", { p_email: email, p_tenant: tid, p_role: role || "staff" }); if (error) throw error; },
  removeMembership: async (uid, tid)      => { const { error } = await supabase.rpc("remove_membership", { p_user: uid, p_tenant: tid }); if (error) throw error; },
  amPlatformAdmin: async ()               => { const { data, error } = await supabase.from("platform_admins").select("user_id"); return !error && Array.isArray(data) && data.length > 0; },
  inviteUser:      async (email, tid, role) => { const { data, error } = await supabase.functions.invoke("invite-user", { body: { email, tenant_id: tid, role: role || "staff" } }); if (error) throw error; if (data && data.error) throw new Error(data.error); return data; },

  // ── Services (Phase 5) — chainServices already falls back to mocks until these exist ──
  uploadFile: async (file) => {
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("uploads").upload(path, file);
    if (error) throw error;
    return supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl;
  },
  // sendEmail:   (payload) => supabase.functions.invoke("send-email",   { body: payload }),
  // ingestScorm: (file)    => supabase.functions.invoke("ingest-scorm", { body: file }),
};

// ── Auth bootstrap — RLS needs a session BEFORE the app's hydrate effect runs ─
export async function chainSignIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function chainCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;                  // null until signed in
}

/* ───────────────────────────────────────────────────────────────────────────
   WIRING INTO THE ARTIFACT (single-file React app)

   1) npm i @supabase/supabase-js
   2) Add env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
   3) In the artifact, near the top where `const CHAIN_API`, `chainReq`, and
      `const chainApi = {...}` are defined:
        - set the guard truthy:           const CHAIN_API = "supabase";
        - delete the inline `chainApi` object and `import { chainApi } from "./supabase-adapter"`
          (the chainReq fetch wrapper is then unused — leave or remove).
      The existing hydrate effect, chainFlush savers, and chainServices fallbacks
      all keep working unchanged because they only call chainApi.* / getState / saveState.
   4) Gate the hydrate on auth: ensure `await chainCurrentSession()` (or a sign-in)
      resolves before the first hydrate, so RLS has a user. A minimal sign-in screen
      that calls chainSignIn() then proceeds is enough to start.

   MULTI-TENANT NOTE: a user with one membership resolves their tenant automatically.
   For users in multiple tenants, set the active one via a JWT custom claim
   (Supabase: app_metadata) or by issuing `SET app.tenant_id` — current_tenant_id()
   already prefers an explicit override.
   ─────────────────────────────────────────────────────────────────────────── */
