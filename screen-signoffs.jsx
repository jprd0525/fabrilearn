// FabriLearn — Supervisor Sign-offs (Stage 4).
// The hands-on competency check that gates Ready-to-Work for machine modules.
// Same tamper-evident chain and two-tab shape as Attestations:
//   • By employee — worklist of modules needing a practical sign-off; capture or
//     re-assess (supersede) with a checklist, result, notes, supervisor name.
//   • Audit log — the sign-off chain with a Verify control.

import { useMemo, useState } from "react";
import { useShop } from "./shop-context";
import { ME } from "./supabase-adapter";
import { Button, Card, Field, TextInput, Modal, EmptyState, Pill, StatusPill } from "./ui";
import { verifyChain, decorateSignoffs } from "./fab-signoff";
import { moduleNeedsSignoff, SIGNOFF_RESULTS, DEFAULT_SIGNOFF_CHECKLIST } from "./fab-model";
import {
  CheckSquare, ShieldCheck, ShieldAlert, ShieldQuestion, Pencil, Check,
  Users, History, ClipboardCheck,
} from "lucide-react";

const RESULT_TONE = Object.fromEntries(SIGNOFF_RESULTS.map((r) => [r.key, r.tone]));
const RESULT_LABEL = Object.fromEntries(SIGNOFF_RESULTS.map((r) => [r.key, r.label]));

export default function SignoffsScreen() {
  const [tab, setTab] = useState("byEmployee");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-800">Supervisor Sign-offs</h1>
        <p className="text-sm text-stone-400">Practical, hands-on competency checks — the gate to “Ready to Work”.</p>
      </div>
      <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
        <Tab on={tab === "byEmployee"} onClick={() => setTab("byEmployee")} icon={Users}>By employee</Tab>
        <Tab on={tab === "log"} onClick={() => setTab("log")} icon={History}>Audit log</Tab>
      </div>
      {tab === "byEmployee" ? <ByEmployee /> : <AuditLog />}
    </div>
  );
}

function Tab({ on, onClick, icon: Icon, children }) {
  return (
    <button onClick={onClick}
      className={"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition " +
        (on ? "bg-amber-600 text-white" : "text-stone-600 hover:bg-stone-100")}>
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

function ByEmployee() {
  const { shop, assignmentsByEmployee, signoffFor, roleById } = useShop();
  const [selectedId, setSelectedId] = useState(shop.employees[0]?.id || null);
  const [signing, setSigning] = useState(null);

  if (shop.employees.length === 0) {
    return <EmptyState icon={Users} title="No employees yet">Add employees and assign machine-module training, then record their sign-offs here.</EmptyState>;
  }

  const employee = shop.employees.find((e) => e.id === selectedId);
  // Only modules that require a practical sign-off.
  const needSignoff = (assignmentsByEmployee[selectedId] || []).filter((a) => !a.proposed && a.requiresSignoff);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
      <Card className="h-fit overflow-hidden">
        <div className="border-b border-stone-100 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-wide text-stone-400">Employees</div>
        <div className="max-h-[32rem] divide-y divide-stone-100 overflow-y-auto">
          {shop.employees.map((e) => {
            const req = (assignmentsByEmployee[e.id] || []).filter((a) => !a.proposed && a.requiresSignoff);
            const passed = req.filter((a) => signoffFor(e.id, a.moduleCode)?.result === "pass").length;
            const on = e.id === selectedId;
            return (
              <button key={e.id} onClick={() => setSelectedId(e.id)}
                className={"flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-stone-50 " + (on ? "bg-amber-50" : "")}>
                <span className="min-w-0 flex-1">
                  <span className={"block truncate " + (on ? "font-medium text-amber-800" : "text-stone-700")}>{e.name}</span>
                  <span className="block truncate text-xs text-stone-400">{req.length ? `${passed}/${req.length} signed off` : "no machine modules"}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-stone-100 px-5 py-3.5">
          <h2 className="text-base font-semibold text-stone-800">{employee?.name}</h2>
          <p className="text-sm text-stone-400">{employee?.roleId ? roleById[employee.roleId]?.name : "no role"} · machine modules requiring practical sign-off</p>
        </div>
        {needSignoff.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">
            No machine-module training assigned. Sign-offs apply to areas B–E (equipment & machines).
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-100 text-[0.68rem] uppercase tracking-wide text-stone-400">
              <tr><th className="px-4 py-2.5 font-medium">Module</th><th className="px-4 py-2.5 font-medium">Training</th><th className="px-4 py-2.5 font-medium">Sign-off</th><th className="px-4 py-2.5"></th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {needSignoff.map((a) => {
                const so = signoffFor(employee.id, a.moduleCode);
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 text-stone-700"><span className="font-mono text-xs text-stone-400">{a.moduleCode}</span> {a.module?.title}</td>
                    <td className="px-4 py-2.5"><StatusPill status={a.status} /></td>
                    <td className="px-4 py-2.5">
                      {so ? <Pill tone={RESULT_TONE[so.result]}>{RESULT_LABEL[so.result]}</Pill> : <span className="text-xs text-stone-400">not signed off</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {so
                        ? <Button size="sm" variant="ghost" onClick={() => setSigning({ assignment: a, existing: so })}><Pencil className="h-3.5 w-3.5" /> Re-assess</Button>
                        : <Button size="sm" onClick={() => setSigning({ assignment: a })}><ClipboardCheck className="h-3.5 w-3.5" /> Sign off</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {signing && <SignoffModal employee={employee} assignment={signing.assignment} existing={signing.existing} onClose={() => setSigning(null)} />}
    </div>
  );
}

function SignoffModal({ employee, assignment, existing, onClose }) {
  const { api } = useShop();
  const reassessing = !!existing;
  const [checklist, setChecklist] = useState(() =>
    DEFAULT_SIGNOFF_CHECKLIST.map((item) => ({ item, checked: false })));
  const [result, setResult] = useState("pass");
  const [notes, setNotes] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (i) => setChecklist((cl) => cl.map((c, j) => (j === i ? { ...c, checked: !c.checked } : c)));
  const canSign = supervisor.trim().length >= 2 && (!reassessing || reason.trim().length >= 3) && !busy;

  const submit = async () => {
    if (!canSign) return;
    setBusy(true);
    try {
      await api.recordSignoff({
        employeeId: employee.id,
        moduleCode: assignment.moduleCode,
        moduleTitle: assignment.module?.title || assignment.moduleCode,
        result,
        checklist,
        notes: notes.trim(),
        supervisor: supervisor.trim(),
        signedBy: ME,
        device: typeof navigator !== "undefined" ? navigator.userAgent : "",
        timestamp: new Date().toISOString(),
        supersedesId: existing?.id || null,
        reason: reassessing ? reason.trim() : null,
      });
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={reassessing ? "Re-assess sign-off" : "Supervisor sign-off"}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={!canSign}>{busy ? "Recording…" : reassessing ? "Record re-assessment" : "Record sign-off"}</Button>
      </>}>
      <div className="space-y-3">
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <div className="text-stone-700"><span className="font-mono text-xs text-stone-400">{assignment.moduleCode}</span> {assignment.module?.title}</div>
          <div className="mt-0.5 text-xs text-stone-400">Practical competency for {employee.name}</div>
        </div>

        {reassessing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
            This appends a <b>new</b> sign-off that supersedes the one from {existing.timestamp.slice(0, 10)}. The original stays in the audit log, unchanged.
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium text-stone-600">Competency checklist</p>
          <div className="space-y-1 rounded-lg border border-stone-200 p-2">
            {checklist.map((c, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-sm hover:bg-stone-50">
                <input type="checkbox" checked={c.checked} onChange={() => toggle(i)} className="mt-0.5" />
                <span className="text-stone-700">{c.item}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-stone-600">Result</p>
          <div className="flex gap-2">
            {SIGNOFF_RESULTS.map((r) => (
              <button key={r.key} onClick={() => setResult(r.key)}
                className={"flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition " +
                  (result === r.key ? resultActive(r.tone) : "border-stone-200 text-stone-500 hover:bg-stone-50")}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-500" placeholder="Observations, conditions, follow-ups…" /></Field>

        <Field label="Supervisor — type name to sign" hint="Records who made the competency determination.">
          <TextInput value={supervisor} onChange={(e) => setSupervisor(e.target.value)} placeholder="Supervisor full name" autoFocus />
        </Field>

        {reassessing && (
          <Field label="Reason for re-assessment" hint="Required — recorded on the superseding entry.">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. re-assessed after further practice" />
          </Field>
        )}

        <p className="text-[0.68rem] text-stone-400">
          Recorded by {ME} · {new Date().toLocaleString()}. Only a “Pass” authorizes Ready to Work. Once recorded, an entry can't be edited — only superseded.
        </p>
      </div>
    </Modal>
  );
}

function resultActive(tone) {
  return {
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-700",
    amber: "border-amber-300 bg-amber-50 text-amber-700",
    rose: "border-rose-300 bg-rose-50 text-rose-700",
  }[tone];
}

// ── Audit log ────────────────────────────────────────────────────────────────
function AuditLog() {
  const { signoffs, shop } = useShop();
  const empById = useMemo(() => Object.fromEntries(shop.employees.map((e) => [e.id, e])), [shop.employees]);
  const decorated = useMemo(() => decorateSignoffs(signoffs), [signoffs]);
  const [integrity, setIntegrity] = useState(null);
  const [checking, setChecking] = useState(false);

  const verify = async () => {
    setChecking(true);
    try { setIntegrity(await verifyChain(signoffs)); }
    finally { setChecking(false); }
  };

  if (signoffs.length === 0) {
    return <EmptyState icon={CheckSquare} title="No sign-offs recorded yet">Record a supervisor sign-off under “By employee” — it appears here as the first link in the audit chain.</EmptyState>;
  }

  return (
    <div className="space-y-3">
      <Card className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          {!integrity ? <ShieldQuestion className="h-6 w-6 text-stone-300" />
            : integrity.ok ? <ShieldCheck className="h-6 w-6 text-emerald-500" />
            : <ShieldAlert className="h-6 w-6 text-rose-500" />}
          <div>
            <div className="text-sm font-medium text-stone-700">
              {!integrity ? "Chain integrity not checked"
                : integrity.ok ? `Chain intact — ${integrity.count} record${integrity.count === 1 ? "" : "s"} verified`
                : `Tampering detected at record #${integrity.brokenAt}`}
            </div>
            <div className="text-xs text-stone-400">
              {!integrity ? "Recompute every fingerprint and confirm the chain links."
                : integrity.ok ? "Every record's fingerprint matches; nothing was altered or removed."
                : integrity.reason}
            </div>
          </div>
        </div>
        <Button variant="secondary" onClick={verify} disabled={checking}><ShieldCheck className="h-4 w-4" /> {checking ? "Verifying…" : "Verify chain"}</Button>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-100 text-[0.68rem] uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Employee</th>
                <th className="px-4 py-2.5 font-medium">Module</th>
                <th className="px-4 py-2.5 font-medium">Result</th>
                <th className="px-4 py-2.5 font-medium">Supervisor</th>
                <th className="px-4 py-2.5 font-medium">Fingerprint</th>
                <th className="px-4 py-2.5 font-medium">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {decorated.map((r) => (
                <tr key={r.id} className={r.superseded ? "text-stone-400" : ""}>
                  <td className="px-4 py-2.5 font-mono text-xs text-stone-400">{r.seq}</td>
                  <td className="px-4 py-2.5 text-stone-500">{r.timestamp.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-2.5 text-stone-600">{empById[r.employeeId]?.name || r.employeeId}</td>
                  <td className="px-4 py-2.5"><span className="font-mono text-xs text-stone-400">{r.moduleCode}</span></td>
                  <td className="px-4 py-2.5"><Pill tone={RESULT_TONE[r.result]}>{RESULT_LABEL[r.result]}</Pill></td>
                  <td className="px-4 py-2.5 text-stone-600">{r.supervisor}{r.supersedesId && <span className="ml-1 text-xs text-stone-400">(re-assess)</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-[0.68rem] text-stone-400" title={r.hash}>{r.hash.slice(0, 10)}…</td>
                  <td className="px-4 py-2.5">{r.superseded ? <Pill tone="stone">superseded</Pill> : <Pill tone="emerald">current</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
