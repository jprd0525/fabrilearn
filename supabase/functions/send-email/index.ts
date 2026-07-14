// ForensiLearn — `send-email` Supabase Edge Function (Deno)
// Invoked by chainServices.sendEmail(payload):  supabase.functions.invoke("send-email", { body: payload })
//
// Design goals:
//   • PROVIDER-AGNOSTIC — pick EMAIL_PROVIDER (resend | ses | smtp); add the GC relay the same way.
//   • SERVER-AUTHORITATIVE — recipients, titles, and copy are resolved here from the DB, never
//     trusted from the client. The client only sends {channel, kind, <id>}.
//   • SCOPED — DB reads use the caller's forwarded JWT, so RLS confines them to the caller's tenant;
//     only managers/admins may trigger a send.
//
// Secrets to set (supabase secrets set ...):
//   EMAIL_PROVIDER   = resend            (default)
//   RESEND_API_KEY   = re_...            (if provider = resend)
//   EMAIL_FROM       = ForensiLearn <no-reply@yourlab.ca>
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ── types ───────────────────────────────────────────────────────────────────
interface Payload {
  channel: string;          // "event-invite" | "contest-update" | ...
  kind?: string;            // savedate|reminder | launch|update|closing|winners
  eventId?: string;
  contestId?: string;
}
interface Recipient { email: string; name?: string }
interface Rendered { subject: string; html: string; text: string }
interface Provider { send(to: Recipient[], msg: Rendered, from: string): Promise<{ sent: number; failed: number }> }

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ── providers (add SES / SMTP / GC relay alongside Resend) ───────────────────
function getProvider(): Provider {
  const which = (Deno.env.get("EMAIL_PROVIDER") || "resend").toLowerCase();
  if (which === "resend") return resendProvider();
  // if (which === "ses")  return sesProvider();
  // if (which === "smtp") return smtpProvider();   // a lab's mandated relay drops in here
  throw new Error(`Unknown EMAIL_PROVIDER: ${which}`);
}

function resendProvider(): Provider {
  const key = Deno.env.get("RESEND_API_KEY");
  return {
    async send(to, msg, from) {
      if (!key) throw new Error("RESEND_API_KEY not set");
      let sent = 0, failed = 0;
      // One message per recipient keeps addresses private (no shared To/CC).
      for (const r of to) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [r.email], subject: msg.subject, html: msg.html, text: msg.text }),
        });
        res.ok ? sent++ : failed++;
      }
      return { sent, failed };
    },
  };
}

// ── templates (mirror the app's channel/kind intent) ─────────────────────────
function render(payload: Payload, title: string): Rendered {
  const k = payload.kind || "";
  if (payload.channel === "event-invite") {
    const subject = k === "reminder" ? `Reminder: ${title}` : `You're invited: ${title}`;
    const lead = k === "reminder" ? `A quick reminder about ${title}.` : `You're invited to ${title}.`;
    return wrap(subject, lead);
  }
  if (payload.channel === "contest-update") {
    const subject =
      k === "launch"  ? `New photo contest: ${title}` :
      k === "closing" ? `Closing soon: ${title}` :
      k === "winners" ? `Winners announced: ${title}` :
                        `Update: ${title}`;
    return wrap(subject, `${subject}.`);
  }
  return wrap(title || "ForensiLearn", title || "");
}
function wrap(subject: string, body: string): Rendered {
  const html =
    `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;color:#0f172a;line-height:1.5">` +
    `<p>${body}</p>` +
    `<p style="color:#64748b;font-size:13px;margin-top:24px">Sent from ForensiLearn.</p></div>`;
  return { subject, html, text: `${body}\n\nSent from ForensiLearn.` };
}

// ── recipient resolution (RLS-scoped to caller's tenant) ─────────────────────
// Reads the relevant store doc for the title, then maps audience -> emails.
// PLUG POINT: in the demo, roster emails are mocked (pEmail(name)). In production
// the email source is your identity table — adjust lookupEmails() to read from
// auth.users / a profiles table joined to your people ids.
async function resolve(db: SupabaseClient, payload: Payload): Promise<{ title: string; recipients: Recipient[] }> {
  if (payload.channel === "event-invite" && payload.eventId) {
    const ev = (await stateDoc(db, "events"))?.events?.find((e: any) => e.id === payload.eventId);
    const ids = audienceIds(ev?.audience);
    return { title: ev?.name || "an event", recipients: await lookupEmails(db, ids) };
  }
  if (payload.channel === "contest-update" && payload.contestId) {
    const c = (await stateDoc(db, "contests"))?.contests?.find((x: any) => x.id === payload.contestId);
    return { title: c?.title || "a contest", recipients: await lookupEmails(db, null) }; // null = all staff
  }
  return { title: "", recipients: [] };
}

async function stateDoc(db: SupabaseClient, key: string): Promise<any | null> {
  const { data, error } = await db.from("app_state").select("doc").eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.doc ?? null;
}

// audience: { mode: all|cohorts|people, cohortIds[], personIds[] }
function audienceIds(audience: any): string[] | null {
  if (!audience || audience.mode === "all") return null;          // null => everyone
  if (audience.mode === "people") return audience.personIds || [];
  // cohorts -> expand via your cohorts store if you target by cohort
  return audience.personIds || [];
}

// PLUG POINT — replace with your real identity/email source.
// Default: read a `profiles` doc shaped { people: [{ id, email, name }] }.
async function lookupEmails(db: SupabaseClient, personIds: string[] | null): Promise<Recipient[]> {
  const profiles = await stateDoc(db, "profiles");
  const people: any[] = profiles?.people || [];
  const pick = personIds === null ? people : people.filter((p) => personIds.includes(p.id));
  return pick
    .filter((p) => p.email)
    .map((p) => ({ email: p.email as string, name: p.name as string }));
}

// ── handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }, // forward caller's JWT -> RLS applies
  );

  // who is calling?
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  // role gate: only managers/admins may trigger a send (RLS returns the caller's own membership rows)
  const { data: mems } = await db.from("memberships").select("role");
  const privileged = (mems || []).some((m: any) => m.role === "manager" || m.role === "admin");
  if (!privileged) return json({ error: "forbidden" }, 403);

  let payload: Payload;
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  if (!payload?.channel) return json({ error: "missing channel" }, 400);

  const { title, recipients } = await resolve(db, payload);
  if (!recipients.length) return json({ ok: true, sent: 0, failed: 0, note: "no recipients resolved" });

  const msg = render(payload, title);
  const from = Deno.env.get("EMAIL_FROM") || "ForensiLearn <no-reply@example.com>";
  const result = await getProvider().send(recipients, msg, from);

  return json({ ok: true, channel: payload.channel, kind: payload.kind ?? null, ...result });
});
