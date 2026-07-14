// FabriLearn — content-serving proxy Edge Function (deploy on FabriLearn's project).
//
// Serves ConSRT's private SCORM packages to FabriLearn's frontend WITHOUT exposing
// any ConSRT credential to the browser. It authenticates to ConSRT with a
// SERVICE-ROLE key held only in this function's secrets, and rigorously restricts
// access to library='fabrilearn', published (approved) content.
//
// Two jobs:
//   1) list  — POST { action:"list" } -> published fabrilearn courses (+ version/pages)
//   2) serve — GET  /content-proxy/serve/{courseId}/{path...}
//              streams a file from the course's package with the correct Content-Type,
//              so a multi-file SCORM package's relative assets (css/js/images) resolve
//              naturally against the proxy URL. index.html at the root serves the launch.
//
// Security posture:
//   - Every request re-checks the DB: the courseId must be library='fabrilearn',
//     not archived, with an approved current version. The URL is never trusted alone.
//   - Path traversal is blocked (no "..").
//   - Only files under that version's pkg_base are reachable. Nothing else in the
//     `packages` bucket (e.g. ForensiLearn content) is accessible through this proxy.
//
// Secrets required (set via dashboard/CLI, NOT in code):
//   CONSRT_URL           https://<consrt-ref>.supabase.co
//   CONSRT_SERVICE_KEY   ConSRT service_role key

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CONSRT_URL = Deno.env.get("CONSRT_URL")!;
const CONSRT_SERVICE_KEY = Deno.env.get("CONSRT_SERVICE_KEY")!;
const LIBRARY = "fabrilearn";
const PACKAGES_BUCKET = "packages";

const consrt = createClient(CONSRT_URL, CONSRT_SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Minimal extension -> Content-Type map (files were stored as octet-stream).
const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", webp: "image/webp", ico: "image/x-icon",
  mp3: "audio/mpeg", mp4: "video/mp4", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", otf: "font/otf",
};
const mimeFor = (path: string) => MIME[path.split(".").pop()?.toLowerCase() || ""] || "application/octet-stream";

// Resolve a fabrilearn courseId -> its approved version's pkg_base (or null).
async function approvedBase(courseId: string): Promise<string | null> {
  const { data: course } = await consrt
    .from("courses")
    .select("current_version_id, library, archived")
    .eq("course_id", courseId).eq("library", LIBRARY).maybeSingle();
  if (!course || course.archived || !course.current_version_id) return null;
  const { data: version } = await consrt
    .from("versions")
    .select("pkg_base, state")
    .eq("version_id", course.current_version_id).eq("state", "approved").maybeSingle();
  if (!version || !version.pkg_base) return null;
  return version.pkg_base.replace(/\/$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  // ── list (POST) ────────────────────────────────────────────────────────────
  if (req.method === "POST") {
    let payload: { action?: string }; try { payload = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
    if (payload.action !== "list") return json({ error: "unknown action" }, 400);

    const { data: courses, error } = await consrt
      .from("courses")
      .select("course_id, title, series, current_version_id")
      .eq("library", LIBRARY).eq("archived", false).not("current_version_id", "is", null);
    if (error) return json({ error: error.message }, 500);

    const versionIds = courses.map((c) => c.current_version_id);
    const { data: versions } = await consrt
      .from("versions")
      .select("version_id, version, state, page_count, approved_on")
      .in("version_id", versionIds).eq("state", "approved");
    const vById = Object.fromEntries((versions || []).map((v) => [v.version_id, v]));

    const out = courses.map((c) => {
      const v = vById[c.current_version_id]; if (!v) return null;
      return { courseId: c.course_id, title: c.title, series: c.series,
               version: v.version, pageCount: v.page_count, approvedOn: v.approved_on };
    }).filter(Boolean);
    return json({ courses: out });
  }

  // ── serve (GET) ────────────────────────────────────────────────────────────
  // Path shape: /content-proxy/serve/{courseId}/{assetPath...}
  if (req.method === "GET") {
    const parts = url.pathname.split("/").filter(Boolean); // [..., "serve", courseId, ...asset]
    const i = parts.indexOf("serve");
    if (i === -1 || parts.length < i + 2) return json({ error: "bad path" }, 400);

    const courseId = decodeURIComponent(parts[i + 1]);
    let assetPath = parts.slice(i + 2).map(decodeURIComponent).join("/");
    if (!assetPath) assetPath = "index.html"; // root -> launch

    if (assetPath.includes("..")) return json({ error: "forbidden" }, 403); // no traversal

    const base = await approvedBase(courseId);
    if (!base) return json({ error: "not found" }, 404);

    const objectPath = `${base}/${assetPath}`;
    const { data, error } = await consrt.storage.from(PACKAGES_BUCKET).download(objectPath);
    if (error || !data) return json({ error: "asset not found" }, 404);

    return new Response(data.stream(), {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": mimeFor(assetPath),
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  return json({ error: "method not allowed" }, 405);
});
