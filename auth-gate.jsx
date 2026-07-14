// FabriLearn — Auth gate (engine file; logic identical to ForensiLearn original) (sign-in before hydrate)
//
// WHY THIS EXISTS: RLS needs a signed-in user before the first DB read. The app's
// hydrate effect runs when <AppShell/> mounts — so the fix is simply to not mount
// <AppShell/> until a session exists. The hydrate code is untouched; it just runs
// later, post-auth, with the JWT attached.
//
// WIRING (single-file artifact):
//   1) Paste these components into the artifact (or import from this file).
//   2) Make sure the seam is on:           const CHAIN_API = "supabase";
//      and that `chainApi` is the Supabase adapter (see supabase-adapter.js).
//   3) Wrap the root so AppShell mounts behind the gate, e.g. at the bottom:
//
//        export default function RootApp() {
//          return (
//            <AuthGate>
//              <AppShell />
//            </AuthGate>
//          );
//        }
//
//   4) (optional) add a sign-out control somewhere in the top bar:
//        <button onClick={chainSignOut}>Sign out</button>

import { useEffect, useState } from "react";
import { supabase, chainSignIn, chainSetUserFromSession } from "./supabase-adapter";

export async function chainSignOut() {
  await supabase.auth.signOut();   // onAuthStateChange flips the gate back to the sign-in screen
}

// ── The gate ─────────────────────────────────────────────────────────────────
export function AuthGate({ children }) {
  const [status, setStatus] = useState("loading"); // loading | out | in

  useEffect(() => {
    let active = true;
    // Restores a persisted session on reload (no re-login needed).
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      chainSetUserFromSession(data.session);
      setStatus(data.session ? "in" : "out");
    });
    // Reacts to sign-in / sign-out / token refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      chainSetUserFromSession(session);
      setStatus(session ? "in" : "out");
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  if (status === "loading") return <Splash />;
  if (status === "out") return <SignIn />;
  return children;   // session present -> AppShell mounts -> its hydrate effect runs now
}

// ── Sign-in screen ───────────────────────────────────────────────────────────
function SignIn() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !pw || busy) return;
    setBusy(true); setErr("");
    try {
      await chainSignIn(email.trim(), pw);   // success -> onAuthStateChange flips the gate to "in"
    } catch (e) {
      setErr(e?.message || "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">FabriLearn</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
        <div className="mt-5 space-y-3">
          <input
            type="email" value={email} autoComplete="username" placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-amber-500 focus:outline-none"
          />
          <input
            type="password" value={pw} autoComplete="current-password" placeholder="Password"
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-amber-500 focus:outline-none"
          />
          {err ? <p className="text-xs text-rose-600">{err}</p> : null}
          <button
            onClick={submit} disabled={busy || !email || !pw}
            className="w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Loading splash (while the session check resolves) ────────────────────────
function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-amber-500" />
        Loading...
      </div>
    </div>
  );
}
