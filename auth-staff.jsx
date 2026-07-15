// FabriLearn — Staff phone-OTP auth + identity binding + role router (Step B).
//
// NOT an engine file. Sits at the composition root (main.jsx) ALONGSIDE the
// untouched engine auth-gate.jsx. Adds a phone-OTP path for staff while keeping
// the existing email/password path for admins.
//
// Flow:
//   Chooser ──► Staff (phone): enter phone → OTP code → verify → bind identity
//           └─► Admin (email): existing email/password sign-in (engine)
//
// After any sign-in, RootGate resolves WHO this is:
//   • a phone user with a staff_identities binding → StaffApp (role-scoped)
//   • otherwise (email admin)                      → the existing AppShell
//
// The staff experience here is minimal (identity confirmation) — the full staff
// dashboard is Step C. This step proves the auth+binding chain end to end.

import { useEffect, useState } from "react";
import { supabase } from "./supabase-adapter";
import { AuthGate } from "./auth-gate";   // engine file (untouched) — email sign-in + gate
import AppShell from "./App.jsx";
import StaffApp from "./screen-staff.jsx";   // the real staff dashboard (Step C)

// ── Root gate: session → identity resolution → route ─────────────────────────
export function RootGate() {
  const [phase, setPhase] = useState("loading");   // loading | signin | resolving | staff | admin
  const [identity, setIdentity] = useState(null);
  const [mode, setMode] = useState("chooser");      // chooser | staff | admin  (pre-auth UI)

  // Resolve the current session into a route.
  async function resolve(session) {
    if (!session) { setPhase("signin"); setIdentity(null); return; }
    // Email users are admins/managers on the existing app; skip staff binding.
    const isPhone = !!session.user?.phone && !session.user?.email;
    if (!isPhone) { setPhase("admin"); return; }
    setPhase("resolving");
    try {
      const { data, error } = await supabase.rpc("bind_staff_identity");
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        // Phone verified, but no provisioning match — not a known employee.
        setPhase("unknown");
        return;
      }
      setIdentity(row);
      setPhase("staff");
    } catch {
      setPhase("unknown");
    }
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) resolve(data.session); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) resolve(session);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  if (phase === "loading" || phase === "resolving") return <Splash label={phase === "resolving" ? "Signing you in…" : "Loading…"} />;
  if (phase === "admin") return <AppShell />;
  if (phase === "staff") return <StaffApp identity={identity} />;
  if (phase === "unknown") return <UnknownStaff />;

  // Not signed in → show the chooser / the selected sign-in path.
  // Admin path delegates to the engine's AuthGate (email sign-in → AppShell),
  // with a small bar to return to the chooser.
  if (mode === "admin") return (
    <div>
      <BackBar onBack={() => setMode("chooser")} />
      <AuthGate><AppShell /></AuthGate>
    </div>
  );
  if (mode === "staff") return <StaffSignIn onBack={() => setMode("chooser")} />;
  return <Chooser onPick={setMode} />;
}

// ── Pre-auth chooser ─────────────────────────────────────────────────────────
function Chooser({ onPick }) {
  return (
    <Screen>
      <Brand />
      <p className="mt-1 text-sm text-stone-500">How do you want to sign in?</p>
      <div className="mt-6 space-y-3">
        <button onClick={() => onPick("staff")}
          className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700">
          I'm an employee — sign in with my phone
        </button>
        <button onClick={() => onPick("admin")}
          className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50">
          Manager / admin sign-in
        </button>
      </div>
    </Screen>
  );
}

// ── Staff phone-OTP sign-in ──────────────────────────────────────────────────
function StaffSignIn({ onBack }) {
  const [step, setStep] = useState("phone");   // phone | code
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Normalize to E.164-ish for Supabase: digits, ensure country code, add '+'.
  function e164(raw) {
    let d = (raw || "").replace(/\D/g, "");
    if (d.length === 10) d = "1" + d;      // North-American default
    return "+" + d;
  }

  const sendCode = async () => {
    if (busy) return;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setErr("Enter your full mobile number."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithOtp({ phone: e164(phone) });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't send the code."); return; }
    setStep("code");
  };

  const verify = async () => {
    if (busy) return;
    if (code.replace(/\D/g, "").length < 6) { setErr("Enter the 6-digit code."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.auth.verifyOtp({ phone: e164(phone), token: code.trim(), type: "sms" });
    // On success, onAuthStateChange fires and RootGate takes over. No further nav here.
    if (error) { setErr(error.message || "That code didn't work."); setBusy(false); }
  };

  return (
    <Screen>
      <BackLink onBack={step === "code" ? () => { setStep("phone"); setErr(""); } : onBack} />
      <Brand />
      {step === "phone" ? (
        <>
          <p className="mt-1 text-sm text-stone-500">Enter your mobile number and we'll text you a code.</p>
          <div className="mt-5 space-y-3">
            <input
              type="tel" inputMode="tel" value={phone} placeholder="(705) 555-1234"
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendCode(); }}
              className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
            />
            {err ? <p className="text-xs text-rose-600">{err}</p> : null}
            <button onClick={sendCode} disabled={busy}
              className="w-full rounded-lg bg-amber-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? "Sending…" : "Text me a code"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-stone-500">Enter the 6-digit code we sent to {phone}.</p>
          <div className="mt-5 space-y-3">
            <input
              type="text" inputMode="numeric" value={code} placeholder="123456" maxLength={6}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
              className="w-full rounded-lg border border-stone-200 px-3 py-2.5 text-center text-lg tracking-[0.3em] focus:border-amber-500 focus:outline-none"
            />
            {err ? <p className="text-xs text-rose-600">{err}</p> : null}
            <button onClick={verify} disabled={busy}
              className="w-full rounded-lg bg-amber-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button onClick={sendCode} disabled={busy} className="w-full text-xs text-stone-400 hover:text-stone-600">
              Didn't get it? Send again
            </button>
          </div>
        </>
      )}
    </Screen>
  );
}

// ── Phone verified but no matching employee record ───────────────────────────
function UnknownStaff() {
  return (
    <Screen>
      <Brand />
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
        <div className="text-sm font-medium text-amber-800">We couldn't find your employee record.</div>
        <div className="mt-1 text-xs text-amber-600">Ask your manager to add your mobile number, then try again.</div>
      </div>
      <button onClick={() => supabase.auth.signOut()}
        className="mt-5 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-500 hover:bg-stone-50">
        Back to sign-in
      </button>
    </Screen>
  );
}

// ── Small shared UI bits ─────────────────────────────────────────────────────
function Screen({ children, wide }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
      <div className={`w-full ${wide ? "max-w-md" : "max-w-sm"} rounded-2xl border border-stone-200 bg-white p-6 shadow-sm`}>
        {children}
      </div>
    </div>
  );
}
function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-white text-sm font-bold">F</span>
      <span className="text-lg font-semibold text-stone-800">FabriLearn</span>
    </div>
  );
}
function BackLink({ onBack }) {
  return <button onClick={onBack} className="mb-3 text-xs text-stone-400 hover:text-stone-600">← Back</button>;
}
function BackBar({ onBack }) {
  return (
    <div className="bg-stone-100 px-4 pt-4">
      <button onClick={onBack} className="text-xs text-stone-400 hover:text-stone-600">← Back to sign-in options</button>
    </div>
  );
}
function Splash({ label }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100">
      <div className="flex items-center gap-2 text-sm text-stone-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-amber-500" />
        {label || "Loading…"}
      </div>
    </div>
  );
}
