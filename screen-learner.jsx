// FabriLearn — Learner Preview (staff view).
//
// The demo/preview tier: what an employee would see and do, rendered inside the
// existing app so the client can verify the staff experience — WITHOUT per-employee
// logins or data isolation (that's the later production tier). Since there's no
// learner login yet, a "viewing as" selector stands in for identity.
//
// The learner's own actions are real: start a module, complete it (SCORM lands in
// Stage 6 — for now a clearly-labelled preview completion), sign their own
// attestation, and acknowledge documents. Supervisor sign-off is shown read-only
// (only a supervisor does that).

import { useMemo, useState, useEffect, useRef } from "react";
import { useShop } from "./shop-context";
import { Button, Pill, StatusPill } from "./ui";
import { defaultAckText } from "./fab-attest";
import { STATUS } from "./fab-model";
import { createScormRuntime, persistableCmi, isPassingStatus, TEST_SCO_HTML } from "./fab-scorm";
import { contentBaseUrl, fetchLaunchDoc } from "./fab-content";
import {
  HardHat, LogOut, ChevronDown, ChevronLeft, PlayCircle, CheckCircle2, PenLine, FileText,
  Clock, ShieldCheck, Sparkles, BookOpen, ExternalLink,
} from "lucide-react";

export default function LearnerPreview() {
  const { shop, goTo } = useShop();
  const [empId, setEmpId] = useState(shop.employees[0]?.id || null);
  const employee = shop.employees.find((e) => e.id === empId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/40 to-stone-50">
      {/* Preview top bar */}
      <div className="border-b border-amber-200 bg-amber-100/70">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
          <Sparkles className="h-4 w-4 text-amber-700" />
          <span className="text-xs font-medium text-amber-800">Staff view — preview</span>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-amber-800">Viewing as</label>
            <div className="relative">
              <select value={empId || ""} onChange={(e) => setEmpId(e.target.value)}
                className="appearance-none rounded-lg border border-amber-300 bg-white py-1 pl-2.5 pr-7 text-xs font-medium text-stone-700 outline-none">
                {shop.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1.5 h-3.5 w-3.5 text-stone-400" />
            </div>
            <button onClick={() => goTo("dashboard")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-50">
              <LogOut className="h-3.5 w-3.5" /> Exit preview
            </button>
          </div>
        </div>
      </div>

      {employee ? <LearnerHome employee={employee} /> : (
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-stone-400">Add an employee to preview the staff view.</div>
      )}
    </div>
  );
}

function LearnerHome({ employee }) {
  const { shop, assignmentsByEmployee, readinessFor, attestationFor } = useShop();
  const [openMod, setOpenMod] = useState(null);
  const [attestMod, setAttestMod] = useState(null);
  const [ackDoc, setAckDoc] = useState(null);

  const active = (assignmentsByEmployee[employee.id] || []).filter((a) => !a.proposed);
  const r = readinessFor(employee.id);
  const docs = shop.documents.filter((d) => d.onboardingRequired);

  // Bucket each assignment into the learner's sequence.
  const buckets = useMemo(() => {
    const todo = [], attest = [], waiting = [], done = [];
    for (const a of active) {
      const att = attestationFor(employee.id, a.moduleCode);
      if (a.status === STATUS.REFRESHER_DUE || !a.completedOn) todo.push(a);
      else if (!att) attest.push(a);
      else if (a.status === STATUS.AWAITING) waiting.push(a);
      else done.push(a);
    }
    return { todo, attest, waiting, done };
  }, [active, employee.id, attestationFor]);

  const docsToSign = docs.filter((d) => {
    const a = attestationFor(employee.id, d.id, "document");
    return !a || a.contentVersion !== d.version;
  });

  const total = active.length;
  const complete = active.filter((a) => a.completedOn && a.status !== STATUS.REFRESHER_DUE).length;
  const pct = total ? Math.round((complete / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      {/* Hero */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-600 text-white"><HardHat style={{ height: 22, width: 22 }} /></span>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-stone-800">Hi {employee.name.split(" ")[0]} 👋</h1>
            <p className="text-sm text-stone-500">Welcome to {shop.settings.shopName} training.</p>
          </div>
          <ReadinessBadge r={r} />
        </div>
        {total > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-stone-400">
              <span>Your progress</span><span>{complete} of {total} complete</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {total === 0 && docsToSign.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-10 text-center">
          <BookOpen className="mx-auto mb-2 h-7 w-7 text-stone-300" />
          <p className="text-sm text-stone-500">No training assigned yet. Your supervisor will assign your onboarding soon.</p>
        </div>
      )}

      {/* To do */}
      {buckets.todo.length > 0 && (
        <Section title="Start your training" icon={PlayCircle} count={buckets.todo.length}>
          {buckets.todo.map((a) => (
            <LearnerRow key={a.id} a={a}
              right={<Button size="sm" onClick={() => setOpenMod(a)}>
                {a.status === STATUS.REFRESHER_DUE ? "Refresh" : a.startedOn ? "Continue" : "Start"}
              </Button>} />
          ))}
        </Section>
      )}

      {/* Documents to acknowledge */}
      {docsToSign.length > 0 && (
        <Section title="Read & sign documents" icon={FileText} count={docsToSign.length}>
          {docsToSign.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="h-4 w-4 shrink-0 text-stone-300" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-stone-700">{d.title}</div>
                <div className="text-xs text-stone-400">{d.category} · v{d.version}</div>
              </div>
              <Button size="sm" onClick={() => setAckDoc(d)}><PenLine className="h-3.5 w-3.5" /> Read & sign</Button>
            </div>
          ))}
        </Section>
      )}

      {/* Attestation needed */}
      {buckets.attest.length > 0 && (
        <Section title="Confirm your training" icon={PenLine} count={buckets.attest.length}>
          {buckets.attest.map((a) => (
            <LearnerRow key={a.id} a={a}
              right={<Button size="sm" onClick={() => setAttestMod(a)}><PenLine className="h-3.5 w-3.5" /> Sign</Button>} />
          ))}
        </Section>
      )}

      {/* Waiting on supervisor */}
      {buckets.waiting.length > 0 && (
        <Section title="Waiting on your supervisor" icon={Clock} count={buckets.waiting.length}>
          {buckets.waiting.map((a) => (
            <LearnerRow key={a.id} a={a}
              right={<span className="inline-flex items-center gap-1.5 text-xs text-amber-700"><Clock className="h-3.5 w-3.5" /> practical sign-off</span>} />
          ))}
        </Section>
      )}

      {/* Done */}
      {buckets.done.length > 0 && (
        <Section title="Completed" icon={ShieldCheck} count={buckets.done.length} muted>
          {buckets.done.map((a) => (
            <LearnerRow key={a.id} a={a}
              right={<span className="inline-flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {a.status}</span>} />
          ))}
        </Section>
      )}

      {openMod && <ModuleModal employee={employee} assignment={openMod} onClose={() => setOpenMod(null)} onCompleted={(a) => { setOpenMod(null); if (!attestationFor(employee.id, a.moduleCode)) setAttestMod(a); }} />}
      {attestMod && <AttestModal employee={employee} assignment={attestMod} onClose={() => setAttestMod(null)} />}
      {ackDoc && <DocAckModal employee={employee} doc={ackDoc} onClose={() => setAckDoc(null)} />}
    </div>
  );
}

function ReadinessBadge({ r }) {
  const tones = { emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200", amber: "bg-amber-50 text-amber-700 ring-amber-200", rose: "bg-rose-50 text-rose-700 ring-rose-200", sky: "bg-sky-50 text-sky-700 ring-sky-200" };
  return <span className={"inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset " + (tones[r.tone] || tones.sky)}>{r.tone === "emerald" && <ShieldCheck className="h-4 w-4" />}{r.label}</span>;
}

function Section({ title, icon: Icon, count, muted, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 px-1">
        <Icon className={"h-4 w-4 " + (muted ? "text-stone-300" : "text-amber-600")} />
        <h2 className={"text-sm font-semibold " + (muted ? "text-stone-400" : "text-stone-700")}>{title}</h2>
        <span className="text-xs text-stone-400">({count})</span>
      </div>
      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">{children}</div>
    </div>
  );
}

function LearnerRow({ a, right }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-stone-700">{a.module?.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-400">
          <span className="font-mono">{a.moduleCode}</span>
          <StatusPill status={a.status} />
          {a.nextDue && a.status === STATUS.REFRESHER_DUE && <span>· was due {a.nextDue}</span>}
        </div>
      </div>
      {right}
    </div>
  );
}

// Module viewer — mounts the SCORM runtime and plays the module in an iframe.
// For the pilot this plays a bundled test module (proving the runtime end-to-end);
// real packages swap in once Storage + the 23 packages are wired. Completion comes
// from the module calling LMSFinish with a passing score, not a manual button.
function ModuleModal({ employee, assignment, onClose, onCompleted }) {
  const { api, scormRunFor } = useShop();
  const runtimeRef = useRef(null);
  const [done, setDone] = useState(false);

  // Build the runtime once and expose it as window.API before the iframe loads.
  if (!runtimeRef.current) {
    const initialCmi = scormRunFor(employee.id, assignment.moduleCode) || {};
    runtimeRef.current = createScormRuntime({
      studentId: employee.id,
      studentName: employee.name,
      initialCmi,
      onCommit: (cmi) => api.saveScormRun(employee.id, assignment.moduleCode, persistableCmi(cmi)),
      onFinish: ({ cmi, status, score }) => {
        api.saveScormRun(employee.id, assignment.moduleCode, persistableCmi(cmi));
        if (isPassingStatus(status)) {
          api.complete(assignment.id, score);
          setDone(true);
        }
      },
    });
    if (typeof window !== "undefined") window.API = runtimeRef.current.api;
  }

  useEffect(() => {
    if (!assignment.startedOn && !assignment.completedOn) api.start(assignment.id);
    return () => { if (typeof window !== "undefined" && window.API === runtimeRef.current?.api) delete window.API; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the module reports a passing finish, close and hand off to attestation.
  useEffect(() => {
    if (done) { const a = assignment; onClose(); onCompleted(a); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // Real content when the module is mapped to a ConSRT course; otherwise the
  // bundled test module (proves the runtime with no content dependency).
  const courseId = assignment.module?.contentCourseId || null;
  const [realHtml, setRealHtml] = useState(null);   // inlined launch doc
  const [loadState, setLoadState] = useState(courseId ? "loading" : "test");

  useEffect(() => {
    if (!courseId) return;
    let alive = true;
    (async () => {
      const r = await fetchLaunchDoc(courseId);
      if (!alive) return;
      if (r.ok) { setRealHtml(r.html); setLoadState("live"); }
      else { setLoadState("error"); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-900/95">
      {/* Header bar: title + clear exit back to the training list */}
      <div className="flex items-center justify-between border-b border-stone-700 bg-stone-800 px-4 py-2.5 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{assignment.module?.title}</div>
          <div className="text-xs text-stone-400">{assignment.moduleCode} · SCORM 1.2 · 80% to pass</div>
        </div>
        <button onClick={onClose}
          className="ml-4 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-stone-700 px-3 py-1.5 text-sm font-medium hover:bg-stone-600">
          <ChevronLeft className="h-4 w-4" /> Back to my training
        </button>
      </div>

      {/* Content area fills the rest of the screen */}
      <div className="relative flex-1 bg-white">
        {loadState === "loading" && (
          <div className="flex h-full items-center justify-center text-sm text-stone-400">Loading module…</div>
        )}
        {loadState === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <div className="text-sm font-medium text-stone-600">Couldn't load this module's content</div>
            <div className="text-xs text-stone-400">The training package for {courseId} couldn't be reached. Showing the preview module instead.</div>
            <iframe title="fallback" srcDoc={TEST_SCO_HTML} className="mt-2 h-[70%] w-full max-w-3xl border border-stone-200" />
          </div>
        )}
        {loadState === "live" && (
          <iframe
            title={assignment.module?.title || "module"}
            srcDoc={realHtml}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            className="h-full w-full border-0"
          />
        )}
        {loadState === "test" && (
          <iframe
            title={assignment.module?.title || "module"}
            srcDoc={TEST_SCO_HTML}
            className="mx-auto h-full w-full max-w-3xl border-0"
          />
        )}
      </div>

      {/* Footer status strip */}
      <div className="border-t border-stone-700 bg-stone-800 px-4 py-1.5 text-center text-[0.68rem] text-stone-400">
        {loadState === "live" ? <>Live content · {courseId} · your progress is saved as you go</>
          : loadState === "test" ? <>Preview module · real content for {assignment.moduleCode} loads here once its package is approved</>
          : loadState === "error" ? <>Content unavailable · showing preview</>
          : <>Loading…</>}
      </div>
    </div>
  );
}

function AttestModal({ employee, assignment, onClose }) {
  const { api } = useShop();
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const ackText = defaultAckText(assignment.module?.title || assignment.moduleCode);
  const version = assignment.module?.version || "1.0";

  const submit = async () => {
    if (signature.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      await api.recordAttestation({
        employeeId: employee.id, subjectType: "module", subjectId: assignment.moduleCode,
        subjectTitle: assignment.module?.title || assignment.moduleCode, ackText, contentVersion: version,
        signature: signature.trim(), signedBy: employee.name,
        device: typeof navigator !== "undefined" ? navigator.userAgent : "", timestamp: new Date().toISOString(),
        supersedesId: null, reason: null,
      });
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <Panel title="Confirm your training" onClose={onClose}
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={signature.trim().length < 2 || busy}>{busy ? "Signing…" : "Sign"}</Button></>}>
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">{assignment.module?.title}</div>
        <p className="text-sm italic text-stone-600">"{ackText}"</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-600">Type your full name to sign</span>
          <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={employee.name} autoFocus
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-500" />
        </label>
      </Panel>
    </Overlay>
  );
}

function DocAckModal({ employee, doc, onClose }) {
  const { api } = useShop();
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const ackText = `I confirm I have read and understood "${doc.title}" (version ${doc.version}), and I will follow it in my work.`;

  const submit = async () => {
    if (signature.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      await api.recordAttestation({
        employeeId: employee.id, subjectType: "document", subjectId: doc.id, subjectTitle: doc.title,
        ackText, contentVersion: doc.version, signature: signature.trim(), signedBy: employee.name,
        device: typeof navigator !== "undefined" ? navigator.userAgent : "", timestamp: new Date().toISOString(),
        supersedesId: null, reason: null,
      });
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <Panel title="Read & sign document" onClose={onClose}
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={signature.trim().length < 2 || busy}>{busy ? "Signing…" : "Sign"}</Button></>}>
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <div className="text-stone-700">{doc.title}</div>
          <div className="text-xs text-stone-400">{doc.category} · v{doc.version}</div>
          {doc.link && <a href={doc.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700">open document <ExternalLink className="h-3 w-3" /></a>}
        </div>
        <p className="text-sm italic text-stone-600">"{ackText}"</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-600">Type your full name to sign</span>
          <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={employee.name} autoFocus
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-500" />
        </label>
      </Panel>
    </Overlay>
  );
}

function Overlay({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-900/30" onClick={onClose} />
      <div className="relative">{children}</div>
    </div>
  );
}

function Panel({ title, onClose, children, footer }) {
  return (
    <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
        <h3 className="text-sm font-semibold text-stone-800">{title}</h3>
        <button onClick={onClose} className="rounded-md p-1 text-stone-400 hover:bg-stone-100">✕</button>
      </div>
      <div className="space-y-3 px-5 py-4">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-3.5">{footer}</div>}
    </div>
  );
}
