// FabriLearn — Attestations (Stage 4).
// Capture and audit tamper-evident acknowledgements. Two tabs:
//   • By employee — worklist: attest each assigned module, view the current
//     signed record, or correct one (which appends a superseding record).
//   • Audit log — the full append-only hash chain with a Verify control that
//     recomputes every fingerprint and reports integrity.
// Records are immutable: corrections never edit, they supersede.

import { useMemo, useState } from "react";
import { useShop } from "./shop-context";
import { ME } from "./supabase-adapter";
import { Button, Card, Field, TextInput, Modal, EmptyState, Pill, StatusPill, SectionTitle } from "./ui";
import { verifyChain, decorateChain, defaultAckText } from "./fab-attest";
import {
  FileSignature, ShieldCheck, ShieldAlert, ShieldQuestion, Pencil, Check,
  Users, History, PenLine,
} from "lucide-react";

export default function AttestationsScreen() {
  const [tab, setTab] = useState("byEmployee");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-800">Attestations</h1>
        <p className="text-sm text-stone-400">Tamper-evident training acknowledgements, signed and audit-ready.</p>
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

// ── By employee ──────────────────────────────────────────────────────────────
function ByEmployee() {
  const { shop, assignmentsByEmployee, attestationFor, roleById } = useShop();
  const [selectedId, setSelectedId] = useState(shop.employees[0]?.id || null);
  const [signing, setSigning] = useState(null);   // {assignment, existing?} for the modal

  if (shop.employees.length === 0) {
    return <EmptyState icon={Users} title="No employees yet">Add employees and assign training, then capture their attestations here.</EmptyState>;
  }

  const employee = shop.employees.find((e) => e.id === selectedId);
  const active = (assignmentsByEmployee[selectedId] || []).filter((a) => !a.proposed);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
      <Card className="h-fit overflow-hidden">
        <div className="border-b border-stone-100 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-wide text-stone-400">Employees</div>
        <div className="max-h-[32rem] divide-y divide-stone-100 overflow-y-auto">
          {shop.employees.map((e) => {
            const act = (assignmentsByEmployee[e.id] || []).filter((a) => !a.proposed);
            const attested = act.filter((a) => attestationFor(e.id, a.moduleCode)).length;
            const on = e.id === selectedId;
            return (
              <button key={e.id} onClick={() => setSelectedId(e.id)}
                className={"flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-stone-50 " + (on ? "bg-amber-50" : "")}>
                <span className="min-w-0 flex-1">
                  <span className={"block truncate " + (on ? "font-medium text-amber-800" : "text-stone-700")}>{e.name}</span>
                  <span className="block truncate text-xs text-stone-400">{act.length ? `${attested}/${act.length} attested` : "no training"}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-stone-100 px-5 py-3.5">
          <h2 className="text-base font-semibold text-stone-800">{employee?.name}</h2>
          <p className="text-sm text-stone-400">{employee?.roleId ? roleById[employee.roleId]?.name : "no role"}</p>
        </div>
        {active.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-stone-400">No confirmed training to attest yet.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-100 text-[0.68rem] uppercase tracking-wide text-stone-400">
              <tr><th className="px-4 py-2.5 font-medium">Module</th><th className="px-4 py-2.5 font-medium">Training status</th><th className="px-4 py-2.5 font-medium">Attestation</th><th className="px-4 py-2.5"></th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {active.map((a) => {
                const att = attestationFor(employee.id, a.moduleCode);
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 text-stone-700"><span className="font-mono text-xs text-stone-400">{a.moduleCode}</span> {a.module?.title}</td>
                    <td className="px-4 py-2.5"><StatusPill status={a.status} /></td>
                    <td className="px-4 py-2.5">
                      {att
                        ? <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" /> signed {att.timestamp.slice(0, 10)} · v{att.contentVersion}</span>
                        : <span className="text-xs text-stone-400">not attested</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {att
                        ? <Button size="sm" variant="ghost" onClick={() => setSigning({ assignment: a, existing: att })}><Pencil className="h-3.5 w-3.5" /> Correct</Button>
                        : <Button size="sm" onClick={() => setSigning({ assignment: a })}><PenLine className="h-3.5 w-3.5" /> Attest</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {signing && <SignModal employee={employee} assignment={signing.assignment} existing={signing.existing} onClose={() => setSigning(null)} />}
    </div>
  );
}

function SignModal({ employee, assignment, existing, onClose }) {
  const { api } = useShop();
  const correcting = !!existing;
  const version = assignment.module?.version || "1.0";
  const [signature, setSignature] = useState("");
  const [reason, setReason] = useState("");
  const [ackText, setAckText] = useState(defaultAckText(assignment.module?.title || assignment.moduleCode));
  const [busy, setBusy] = useState(false);

  const canSign = signature.trim().length >= 2 && (!correcting || reason.trim().length >= 3) && !busy;

  const submit = async () => {
    if (!canSign) return;
    setBusy(true);
    try {
      await api.recordAttestation({
        employeeId: employee.id,
        subjectType: "module",
        subjectId: assignment.moduleCode,
        subjectTitle: assignment.module?.title || assignment.moduleCode,
        ackText,
        contentVersion: version,
        signature: signature.trim(),
        signedBy: ME,
        device: typeof navigator !== "undefined" ? navigator.userAgent : "",
        timestamp: new Date().toISOString(),
        supersedesId: existing?.id || null,
        reason: correcting ? reason.trim() : null,
      });
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={correcting ? "Correct attestation" : "Sign attestation"}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={!canSign}>{busy ? "Recording…" : correcting ? "Record correction" : "Sign & record"}</Button>
      </>}>
      <div className="space-y-3">
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <div className="text-stone-700"><span className="font-mono text-xs text-stone-400">{assignment.moduleCode}</span> {assignment.module?.title}</div>
          <div className="mt-0.5 text-xs text-stone-400">Content version {version} · for {employee.name}</div>
        </div>

        {correcting && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
            This appends a <b>new</b> record that supersedes the one signed {existing.timestamp.slice(0, 10)}. The original stays in the audit log, unchanged.
          </div>
        )}

        <Field label="Acknowledgement">
          <textarea value={ackText} onChange={(e) => setAckText(e.target.value)} rows={3}
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-500" />
        </Field>

        <Field label="Signature — type full name to sign" hint="A typed signature is an affirmative, attributable act, recorded with a timestamp.">
          <TextInput value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={employee.name} autoFocus />
        </Field>

        {correcting && (
          <Field label="Reason for correction" hint="Required — recorded on the superseding entry.">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. corrected legal name" />
          </Field>
        )}

        <p className="text-[0.68rem] text-stone-400">
          Recorded by {ME} · {new Date().toLocaleString()} · device captured. Once recorded, this entry can't be edited — only superseded.
        </p>
      </div>
    </Modal>
  );
}

// ── Audit log ────────────────────────────────────────────────────────────────
function AuditLog() {
  const { attestations, shop } = useShop();
  const empById = useMemo(() => Object.fromEntries(shop.employees.map((e) => [e.id, e])), [shop.employees]);
  const decorated = useMemo(() => decorateChain(attestations), [attestations]);
  const [integrity, setIntegrity] = useState(null); // null | {ok,...}
  const [checking, setChecking] = useState(false);

  const verify = async () => {
    setChecking(true);
    try { setIntegrity(await verifyChain(attestations)); }
    finally { setChecking(false); }
  };

  if (attestations.length === 0) {
    return <EmptyState icon={FileSignature} title="No attestations recorded yet">Sign a module attestation under “By employee” — it appears here as the first link in the audit chain.</EmptyState>;
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
        <Button variant="secondary" onClick={verify} disabled={checking}>
          <ShieldCheck className="h-4 w-4" /> {checking ? "Verifying…" : "Verify chain"}
        </Button>
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
                <th className="px-4 py-2.5 font-medium">Signature</th>
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
                  <td className="px-4 py-2.5"><span className="font-mono text-xs text-stone-400">{r.subjectId}</span> <span className="text-stone-500">v{r.contentVersion}</span></td>
                  <td className="px-4 py-2.5 text-stone-600">{r.signature}{r.supersedesId && <span className="ml-1 text-xs text-stone-400">(correction)</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-[0.68rem] text-stone-400" title={r.hash}>{r.hash.slice(0, 10)}…</td>
                  <td className="px-4 py-2.5">
                    {r.superseded ? <Pill tone="stone">superseded</Pill> : <Pill tone="emerald">current</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-stone-400">
        Each record's fingerprint covers its contents and the previous fingerprint. Corrections append a new record; originals are never edited or deleted, so the chain stays continuous and verifiable.
      </p>
    </div>
  );
}
