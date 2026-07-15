// FabriLearn — Staff dashboard (Step C).
//
// The real, data-backed staff experience for a logged-in (phone-OTP) worker.
// Reads/writes the staff_* tables DIRECTLY via the supabase client — RLS scopes
// every query to this employee, so a worker only ever sees/touches their own
// records (proven in Step A). Reuses the SCORM runtime (fab-scorm) and content
// inliner (fab-content); module metadata comes from the static catalogue
// (fab-model SEED_MODULES). Not an engine file.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase-adapter";
import { SEED_MODULES, daysUntil } from "./fab-model";
import { createScormRuntime, persistableCmi, isPassingStatus, TEST_SCO_HTML } from "./fab-scorm";
import { fetchLaunchDoc } from "./fab-content";
import {
  HardHat, LogOut, PlayCircle, CheckCircle2, PenLine, ChevronLeft, Check, BookOpen,
} from "lucide-react";

// module_code -> catalogue metadata (title, area, contentCourseId, recurrence)
const MODULE_BY_CODE = Object.fromEntries(SEED_MODULES.map((m) => [m.code, m]));

// ── Root staff app ───────────────────────────────────────────────────────────
export default function StaffApp({ identity }) {
  const [assignments, setAssignments] = useState(null);   // null = loading
  const [attestations, setAttestations] = useState([]);
  const [runs, setRuns] = useState({});                   // module_code -> cmi
  const [err, setErr] = useState("");

  const empId = identity?.employee_id;

  async function load() {
    setErr("");
    try {
      const [a, at, r] = await Promise.all([
        supabase.from("staff_assignments").select("*").order("module_code"),
        supabase.from("staff_attestations").select("*"),
        supabase.from("staff_scorm_runs").select("module_code, cmi"),
      ]);
      if (a.error) throw a.error;
      setAssignments(a.data || []);
      setAttestations(at.data || []);
      setRuns(Object.fromEntries((r.data || []).map((x) => [x.module_code, x.cmi])));
    } catch (e) {
      setErr(e?.message || "Couldn't load your training.");
      setAssignments([]);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [empId]);

  const hasAttestation = (code) => attestations.some((x) => x.module_code === code);

  const enriched = useMemo(() => (assignments || []).map((a) => ({
    ...a,
    module: MODULE_BY_CODE[a.module_code] || { title: a.title, code: a.module_code },
    done: !!a.completed_on,
  })), [assignments]);

  const todo = enriched.filter((a) => !a.done);
  const done = enriched.filter((a) => a.done);
  const total = enriched.length || 1;
  const completedCount = done.length;

  const [openMod, setOpenMod] = useState(null);
  const [reviewMod, setReviewMod] = useState(null);
  const [attestMod, setAttestMod] = useState(null);

  if (assignments === null) return <Splash label="Loading your training…" />;

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-white"><HardHat style={{ height: 18, width: 18 }} /></span>
          <div>
            <div className="text-sm font-semibold text-stone-800">My Training</div>
            <div className="text-[0.7rem] text-stone-400">{identity?.full_name || empId}</div>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-stone-700">Your progress</span>
            <span className="text-stone-500">{completedCount} of {enriched.length} complete</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.round((completedCount / total) * 100)}%` }} />
          </div>
        </div>

        {err ? <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</p> : null}

        {todo.length > 0 && (
          <Section title="To do" count={todo.length}>
            {todo.map((a) => (
              <Row key={a.id} a={a}
                right={<button onClick={() => setOpenMod(a)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"><PlayCircle className="h-4 w-4" /> Start</button>} />
            ))}
          </Section>
        )}

        {done.length > 0 && (
          <Section title="Completed" count={done.length} muted>
            {done.map((a) => (
              <Row key={a.id} a={a}
                right={
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {a.score != null ? `${a.score}%` : "Done"}</span>
                    {a.module?.contentCourseId && (
                      <button onClick={() => setReviewMod(a)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-700"><BookOpen className="h-3.5 w-3.5" /> Review</button>
                    )}
                    {!hasAttestation(a.module_code) && (
                      <button onClick={() => setAttestMod(a)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"><PenLine className="h-3.5 w-3.5" /> Sign</button>
                    )}
                  </div>
                } />
            ))}
          </Section>
        )}

        {todo.length === 0 && done.length === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">
            No training assigned yet. Your manager will assign your onboarding.
          </div>
        )}
      </div>

      {openMod && <ModulePlayer identity={identity} assignment={openMod} initialCmi={runs[openMod.module_code]}
        needsAttestation={!hasAttestation(openMod.module_code)}
        onClose={() => setOpenMod(null)}
        onCompleted={(a) => { setOpenMod(null); load().then(() => { if (!hasAttestation(a.module_code)) setAttestMod(a); }); }} />}
      {reviewMod && <ModulePlayer identity={identity} assignment={reviewMod} initialCmi={runs[reviewMod.module_code]} reviewMode
        onClose={() => setReviewMod(null)} onCompleted={() => setReviewMod(null)} />}
      {attestMod && <AttestModal identity={identity} assignment={attestMod}
        onClose={() => setAttestMod(null)} onSigned={() => { setAttestMod(null); load(); }} />}
    </div>
  );
}

// ── Module player ────────────────────────────────────────────────────────────
function ModulePlayer({ identity, assignment, initialCmi, needsAttestation, reviewMode = false, onClose, onCompleted }) {
  const courseId = assignment.module?.contentCourseId || null;
  const runtimeRef = useRef(null);
  const [done, setDone] = useState(false);
  const [passScore, setPassScore] = useState(null);
  const [realHtml, setRealHtml] = useState(null);
  const [loadState, setLoadState] = useState(courseId ? "loading" : "test");

  async function saveRun(cmi) {
    if (reviewMode) return;
    await supabase.from("staff_scorm_runs").upsert(
      { tenant_id: identity.tenant_id, employee_id: identity.employee_id, module_code: assignment.module_code, cmi: persistableCmi(cmi), updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,employee_id,module_code" }
    );
  }
  async function markComplete(score) {
    await supabase.from("staff_assignments").update({
      status: "complete", completed_on: new Date().toISOString(), score, updated_at: new Date().toISOString(),
    }).eq("id", assignment.id);
  }

  if (!runtimeRef.current) {
    runtimeRef.current = createScormRuntime({
      studentId: identity.employee_id, studentName: identity.full_name || identity.employee_id,
      initialCmi: initialCmi || {},
      onCommit: reviewMode ? undefined : (cmi) => saveRun(cmi),
      onFinish: async ({ cmi, status, score }) => {
        if (reviewMode) return;
        await saveRun(cmi);
        if (isPassingStatus(status)) { await markComplete(score); setPassScore(score); setDone(true); }
      },
    });
    if (typeof window !== "undefined") window.API = runtimeRef.current.api;
  }

  useEffect(() => {
    if (!courseId) return;
    let alive = true;
    (async () => {
      const r = await fetchLaunchDoc(courseId);
      if (!alive) return;
      if (r.ok) { setRealHtml(r.html); setLoadState("live"); } else { setLoadState("error"); }
    })();
    return () => { alive = false; if (typeof window !== "undefined" && window.API === runtimeRef.current?.api) delete window.API; };
    // eslint-disable-next-line
  }, [courseId]);

  if (done) {
    return <ModuleComplete assignment={assignment} score={passScore} needsAttestation={needsAttestation}
      onContinue={() => { const a = assignment; onClose(); onCompleted(a); }} onBack={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-900/95">
      <div className="flex items-center justify-between border-b border-stone-700 bg-stone-800 px-4 py-2.5 text-white">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{assignment.module?.title}</span>
            {reviewMode && <span className="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[0.65rem] font-medium text-sky-300">Review</span>}
          </div>
          <div className="text-xs text-stone-400">{assignment.module_code} · {reviewMode ? "revisiting — your record is unchanged" : "SCORM 1.2 · 80% to pass"}</div>
        </div>
        <button onClick={onClose} className="ml-4 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-stone-700 px-3 py-1.5 text-sm font-medium hover:bg-stone-600">
          <ChevronLeft className="h-4 w-4" /> {reviewMode ? "Close" : "Back to my training"}
        </button>
      </div>
      <div className="relative flex-1 bg-white">
        {loadState === "loading" && <div className="flex h-full items-center justify-center text-sm text-stone-400">Loading module…</div>}
        {loadState === "error" && <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"><div className="text-sm font-medium text-stone-600">Couldn't load this module's content</div><iframe title="fallback" srcDoc={TEST_SCO_HTML} className="mt-2 h-[70%] w-full max-w-3xl border border-stone-200" /></div>}
        {loadState === "live" && <iframe title={assignment.module?.title} srcDoc={realHtml} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" className="h-full w-full border-0" />}
        {loadState === "test" && <iframe title={assignment.module?.title} srcDoc={TEST_SCO_HTML} className="mx-auto h-full w-full max-w-3xl border-0" />}
      </div>
      <div className="border-t border-stone-700 bg-stone-800 px-4 py-1.5 text-center text-[0.68rem] text-stone-400">
        {loadState === "live" ? <>Live content · your progress is saved as you go</> : loadState === "test" ? <>Preview module · real content loads here once approved</> : loadState === "error" ? <>Content unavailable · showing preview</> : <>Loading…</>}
      </div>
    </div>
  );
}

// ── Completion celebration ───────────────────────────────────────────────────
function ModuleComplete({ assignment, score, needsAttestation, onContinue, onBack }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShown(true), 40); return () => clearTimeout(t); }, []);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-emerald-50 to-white px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-200 transition-all duration-500" style={{ transform: shown ? "scale(1)" : "scale(0.6)", opacity: shown ? 1 : 0 }}>
          <Check className="h-14 w-14 text-white" strokeWidth={3} />
        </div>
        <h1 className="text-2xl font-bold text-stone-800">Module complete!</h1>
        <p className="mt-1 text-stone-500">You passed <span className="font-medium text-stone-700">{assignment.module?.title}</span>.</p>
        {score != null && (
          <div className="mt-5 inline-flex items-baseline gap-2 rounded-2xl bg-white px-6 py-3 shadow-sm ring-1 ring-stone-100">
            <span className="text-4xl font-bold text-emerald-600">{score}%</span>
            <span className="text-sm text-stone-400">· passed (80% needed)</span>
          </div>
        )}
        <div className="mt-8 space-y-2">
          {needsAttestation ? (
            <>
              <button onClick={onContinue} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700"><PenLine className="h-4 w-4" /> Sign your confirmation</button>
              <p className="text-xs text-stone-400">One quick step left: confirm you understood this training.</p>
            </>
          ) : (
            <button onClick={onContinue} className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700">Back to my training</button>
          )}
          <button onClick={onBack} className="w-full rounded-xl px-4 py-2 text-sm text-stone-500 hover:bg-stone-100">{needsAttestation ? "I'll do it later" : "Done"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Attestation ──────────────────────────────────────────────────────────────
function AttestModal({ identity, assignment, onClose, onSigned }) {
  const [name, setName] = useState(identity?.full_name || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const statement = `I confirm I completed and understood the training: ${assignment.module?.title}.`;

  const sign = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setErr("");
    const { error } = await supabase.from("staff_attestations").insert({
      tenant_id: identity.tenant_id, employee_id: identity.employee_id,
      module_code: assignment.module_code, statement, signed_name: name.trim(),
    });
    if (error) { setErr(error.message || "Couldn't save your confirmation."); setBusy(false); return; }
    onSigned();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="text-sm font-semibold text-stone-800">Confirm your training</div>
        <p className="mt-3 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">{statement}</p>
        <label className="mt-4 block text-xs font-medium text-stone-500">Type your full name to sign</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name"
          className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
        {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-500 hover:bg-stone-50">Cancel</button>
          <button onClick={sign} disabled={busy || !name.trim()} className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{busy ? "Signing…" : "Sign & confirm"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Small shared bits ────────────────────────────────────────────────────────
function Section({ title, count, muted, children }) {
  return (
    <div className="mb-6">
      <div className={`mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide ${muted ? "text-stone-400" : "text-stone-500"}`}>
        {title} <span className="rounded-full bg-stone-200 px-1.5 text-[0.65rem] text-stone-500">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({ a, right }) {
  const due = a.due_on ? daysUntil(a.due_on.slice(0, 10)) : null;
  return (
    <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-stone-800">{a.module?.title || a.module_code}</div>
        <div className="text-[0.7rem] text-stone-400">
          {a.module_code}
          {!a.done && due != null && (<span className={due < 0 ? "text-rose-500" : due <= 7 ? "text-amber-600" : ""}> · {due < 0 ? `overdue by ${-due}d` : `due in ${due}d`}</span>)}
        </div>
      </div>
      <div className="ml-3 shrink-0">{right}</div>
    </div>
  );
}
function Splash({ label }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100">
      <div className="flex items-center gap-2 text-sm text-stone-400"><span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-amber-500" /> {label || "Loading…"}</div>
    </div>
  );
}
