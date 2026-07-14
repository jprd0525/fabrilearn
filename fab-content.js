// FabriLearn — content read layer (Stage 6 real content).
//
// Browser-side client for the content-proxy Edge Function, which brokers read-only
// access to ConSRT's published fabrilearn packages. FabriLearn never holds a ConSRT
// credential; it calls this function with the user's own FabriLearn auth token.
//
// Two things:
//   listContent()        -> published fabrilearn courses (courseId, title, version, …)
//   contentBaseUrl(id)   -> the proxy "serve" base for a course; point an iframe at
//                           `${contentBaseUrl(id)}/index.html` and the package's
//                           relative assets resolve through the proxy automatically.

import { supabase } from "./supabase-adapter";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-proxy`;

// Where the iframe loads package files from. In production this is a SAME-ORIGIN
// path ("/content") that Netlify proxies to the Edge Function — same origin is
// required for the SCORM window.parent.API handshake to work. On localhost there's
// no proxy, so we fall back to the direct function URL (the iframe handshake won't
// work cross-origin locally, but the list/bank UI does — full play is tested on
// the deployed site).
const SERVE_BASE = import.meta.env.PROD ? "/content" : FN_BASE;

// The signed-in user's access token — the function is JWT-gated, so every call
// carries it. (Also sends the anon key as apikey, which Supabase Functions expect.)
async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

// List published fabrilearn courses available to play. Returns [] on any failure
// (the app treats "no content" and "couldn't reach content" the same way for the
// learner — the module simply isn't playable yet).
export async function listContent() {
  try {
    const res = await fetch(FN_BASE, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ action: "list" }),
    });
    if (!res.ok) return { ok: false, status: res.status, courses: [] };
    const body = await res.json();
    return { ok: true, courses: body.courses || [] };
  } catch (e) {
    return { ok: false, error: String(e), courses: [] };
  }
}

// Base URL the iframe uses to load a course's package through the proxy.
// The proxy serves index.html at the root and every relative asset beneath it.
export function contentBaseUrl(courseId) {
  return `${SERVE_BASE}/serve/${encodeURIComponent(courseId)}`;
}

// Convenience: the launch URL for a course.
export function launchUrl(courseId) {
  return `${contentBaseUrl(courseId)}/index.html`;
}

// Fetch the launch HTML and INLINE its CSS/JS so the whole module is one
// self-contained document injected via iframe srcdoc. We inline (rather than
// rewrite to proxy URLs) because Supabase's function gateway coerces every served
// file's Content-Type to text/plain — and browsers refuse to apply a text/plain
// stylesheet or execute a text/plain script. Inlining removes all external asset
// requests, so Content-Type is irrelevant. The srcdoc document runs same-origin
// with the parent, so the SCORM window.parent.API handshake works naturally.
// Returns { ok, html } or { ok:false, error }.
export async function fetchLaunchDoc(courseId) {
  try {
    const base = contentBaseUrl(courseId);
    const headers = await authHeaders();
    const getText = async (path) => {
      const r = await fetch(`${base}/${path.replace(/^\.?\//, "")}`, { headers });
      return r.ok ? await r.text() : null;
    };

    const res = await fetch(`${base}/index.html`, { headers });
    if (!res.ok) return { ok: false, error: `launch fetch ${res.status}` };
    let html = await res.text();

    // Inline <link rel="stylesheet" href="...">  -> <style>...</style>
    const linkRe = /<link\b[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["'][^>]*>/gi;
    const linkMatches = [...html.matchAll(linkRe)];
    for (const m of linkMatches) {
      const href = m[1];
      if (/^https?:|^\/\//.test(href)) continue; // leave external CDNs alone
      const css = await getText(href);
      if (css != null) html = html.replace(m[0], `<style>\n${css}\n</style>`);
    }

    // Inline <script src="..."></script>  -> <script>...</script>
    const scriptRe = /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
    const scriptMatches = [...html.matchAll(scriptRe)];
    for (const m of scriptMatches) {
      const src = m[1];
      if (/^https?:|^\/\//.test(src)) continue;
      const js = await getText(src);
      if (js != null) html = html.replace(m[0], `<script>\n${js}\n</script>`);
    }

    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
