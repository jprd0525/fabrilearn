// ForensiLearn — invite-user edge function (P3c).
// Invites a NEW person by email (creates their login) OR links an EXISTING account,
// then attaches a membership to the given lab. Runs with the service role, so it is the
// ONLY place allowed to mint logins. Caller must be a platform admin or that lab's admin.
//
// Deploy (Supabase CLI):   supabase functions deploy invite-user
// Or paste into the dashboard: Edge Functions -> New function -> "invite-user".
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  const j = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { email, tenant_id, role } = await req.json();
    if (!email || !tenant_id) return j({ error: "email and tenant_id are required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Who is calling? (their JWT)
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return j({ error: "not signed in" }, 401);

    const admin = createClient(url, svc);

    // Authorize: platform admin OR admin-of-this-tenant.
    const pa = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    let ok = !!pa.data;
    if (!ok) {
      const m = await admin.from("memberships").select("role")
        .eq("user_id", user.id).eq("tenant_id", tenant_id).eq("role", "admin").maybeSingle();
      ok = !!m.data;
    }
    if (!ok) return j({ error: "not permitted to manage this lab" }, 403);

    const r = role || "staff";

    // Existing account?
    const ex = await admin.rpc("uid_for_email", { p_email: email });
    let uid: string | null = (ex.data as string) ?? null;
    let status = "added_existing";

    if (!uid) {
      const inv = await admin.auth.admin.inviteUserByEmail(email);
      if (inv.error) return j({ error: inv.error.message }, 400);
      uid = inv.data.user!.id;
      status = "invited";
    }

    // Idempotent attach.
    await admin.from("memberships").delete().eq("user_id", uid).eq("tenant_id", tenant_id);
    const ins = await admin.from("memberships").insert({ user_id: uid, tenant_id, role: r });
    if (ins.error) return j({ error: ins.error.message }, 400);

    return j({ status });
  } catch (e) {
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
