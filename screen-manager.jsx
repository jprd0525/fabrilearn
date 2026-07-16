// FabriLearn — Manager / supervisor dashboard (Step D).
//
// The supervisor experience. Reads the staff_* tables via the supervisor's
// session — RLS grants tenant-wide read to supervisors/admins (proven in Step D
// tests), so a manager sees the whole team, while staff still see only themselves.
// Supervisors witness practical competence via staff_signoffs (insert-only).
// Not an engine file.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase-adapter";
import { SEED_MODULES, daysUntil, todayISO } from "./fab-model";
import StaffApp from "./screen-staff.jsx";
import { HardHat, LogOut, ChevronLeft, PenLine, CheckCircle2, AlertTriangle, Users, FileText, Plus } from "lucide-react";

const MODULE_BY_CODE = Object.fromEntries(SEED_MODULES.map((m) => [m.code, m]));

export default function ManagerApp({ identity, switchSlot, onGoToMyTraining }) {
  const [roster, setRoster] = useState(null);     // [{employee_id, full_name, role, active}]
  const [assignments, setAssignments] = useState([]);
  const [attestations, setAttestations] = useState([]);
  const [signoffs, setSignoffs] = useState([]);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(null); // employee_id being viewed
  const [signMod, setSignMod] = useState(null);   // {employee_id, ...}
  const [tab, setTab] = useState("team");         // team | documents

  async function load() {
    setErr("");
    try {
      const [ident, prov, asg, att, so] = await Promise.all([
        supabase.from("staff_identities").select("employee_id, full_name, role, active"),
        supabase.from("staff_provisioning").select("employee_id, full_name, role, bound_user_id, active"),
        supabase.from("staff_assignments").select("*"),
        supabase.from("staff_attestations").select("employee_id, module_code, signed_name, signed_at"),
        supabase.from("staff_signoffs").select("*"),
      ]);
      if (ident.error) throw ident.error;
      // Merge active identities + provisioned (some may not have logged in yet).
      const byId = {};
      (prov.data || []).forEach((p) => { if (p.active !== false) byId[p.employee_id] = { employee_id: p.employee_id, full_name: p.full_name, role: p.role, active: !!p.bound_user_id }; });
      (ident.data || []).forEach((i) => { if (i.active !== false) byId[i.employee_id] = { employee_id: i.employee_id, full_name: i.full_name, role: i.role, active: true }; });
      // Team = everyone who takes training (staff + supervisors), EXCEPT yourself.
      // You don't manage or sign off your own record here; your own training is
      // under "My training", and another supervisor/admin signs off your competence.
      setRoster(Object.values(byId).filter((r) =>
        (r.role === "staff" || r.role === "supervisor") && r.employee_id !== identity?.employee_id
      ));
      setAssignments(asg.data || []);
      setAttestations(att.data || []);
      setSignoffs(so.data || []);
    } catch (e) {
      setErr(e?.message || "Couldn't load your team.");
      setRoster([]);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // progress + overdue per employee
  const progressFor = (empId) => {
    const list = assignments.filter((a) => a.employee_id === empId);
    const done = list.filter((a) => a.completed_on).length;
    const overdue = list.filter((a) => !a.completed_on && a.due_on && daysUntil(a.due_on.slice(0, 10)) < 0).length;
    return { done, total: list.length, overdue };
  };

  if (roster === null) return <Splash label="Loading your team…" />;

  const selectedEmp = selected ? roster.find((r) => r.employee_id === selected) : null;

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-white"><HardHat style={{ height: 18, width: 18 }} /></span>
          <div>
            <div className="text-sm font-semibold text-stone-800">Team Training</div>
            <div className="text-[0.7rem] text-stone-400">{identity?.full_name || identity?.employee_id} · supervisor</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {switchSlot}
          <button onClick={() => supabase.auth.signOut()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {err ? <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</p> : null}

        {!selectedEmp && (
          <div className="mb-5 flex gap-1 text-sm">
            <button onClick={() => setTab("team")} className={`rounded-lg px-3 py-1.5 font-medium ${tab === "team" ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-100"}`}>Team</button>
            <button onClick={() => setTab("documents")} className={`rounded-lg px-3 py-1.5 font-medium ${tab === "documents" ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-100"}`}>Documents</button>
          </div>
        )}

        {!selectedEmp && tab === "documents" ? (
          <DocumentsManager identity={identity} roster={roster} />
        ) : !selectedEmp ? (
          <>
            <MyTrainingBox assignments={assignments} identity={identity} onOpen={onGoToMyTraining} />
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-stone-600"><Users className="h-4 w-4" /> Your team <span className="text-stone-400">({roster.length})</span></div>
            {roster.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">No staff yet. Add employees and their mobile numbers to get started.</div>
            ) : (
              <div className="space-y-2">
                {roster.map((r) => {
                  const p = progressFor(r.employee_id);
                  return (
                    <button key={r.employee_id} onClick={() => setSelected(r.employee_id)}
                      className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 text-left hover:border-amber-300">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-stone-800">{r.full_name || r.employee_id}</span>
                          {r.role === "supervisor" && <span className="shrink-0 rounded-full bg-sky-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-sky-600">supervisor</span>}
                        </div>
                        <div className="text-[0.7rem] text-stone-400">{r.active ? "active" : "not logged in yet"} · {r.employee_id}</div>
                      </div>
                      <div className="ml-3 flex shrink-0 items-center gap-3 text-xs">
                        {p.overdue > 0 && <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle className="h-3.5 w-3.5" /> {p.overdue} overdue</span>}
                        <span className="text-stone-500">{p.done}/{p.total} done</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <PersonView
            emp={selectedEmp}
            assignments={assignments.filter((a) => a.employee_id === selectedEmp.employee_id)}
            attestations={attestations.filter((a) => a.employee_id === selectedEmp.employee_id)}
            signoffs={signoffs.filter((s) => s.employee_id === selectedEmp.employee_id)}
            onBack={() => setSelected(null)}
            onSignOff={(moduleCode) => setSignMod({ employee_id: selectedEmp.employee_id, full_name: selectedEmp.full_name, module_code: moduleCode })}
          />
        )}
      </div>

      {signMod && <SignOffModal identity={identity} target={signMod}
        onClose={() => setSignMod(null)} onSigned={() => { setSignMod(null); load(); }} />}
    </div>
  );
}

// ── One person's records (manager view) ──────────────────────────────────────
function PersonView({ emp, assignments, attestations, signoffs, onBack, onSignOff }) {
  const hasAttest = (code) => attestations.some((a) => a.module_code === code);
  const hasSignoff = (code) => signoffs.some((s) => s.module_code === code && s.result === "competent");
  const enriched = assignments.map((a) => ({ ...a, module: MODULE_BY_CODE[a.module_code] || { title: a.title } }));

  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600"><ChevronLeft className="h-3.5 w-3.5" /> Back to team</button>
      <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-5">
        <div className="text-sm font-semibold text-stone-800">{emp.full_name || emp.employee_id}</div>
        <div className="text-[0.7rem] text-stone-400">{emp.active ? "active" : "not logged in yet"} · {emp.employee_id}</div>
      </div>

      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Training</div>
      <div className="space-y-2">
        {enriched.length === 0 && <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-400">No training assigned.</div>}
        {enriched.map((a) => {
          const needsSignoff = MODULE_BY_CODE[a.module_code] && ["B", "C", "D", "E"].includes((MODULE_BY_CODE[a.module_code].area || a.module_code[0]));
          return (
            <div key={a.id} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-stone-800">{a.module?.title || a.module_code}</div>
                  <div className="text-[0.7rem] text-stone-400">{a.module_code}</div>
                </div>
                <div className="ml-3 shrink-0 text-xs">
                  {a.completed_on
                    ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {a.score != null ? `${a.score}%` : "done"}</span>
                    : <span className="text-stone-400">not started</span>}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.68rem]">
                <Tag ok={hasAttest(a.module_code)} label={hasAttest(a.module_code) ? "attested" : "no attestation"} />
                {needsSignoff && <Tag ok={hasSignoff(a.module_code)} label={hasSignoff(a.module_code) ? "signed off" : "needs sign-off"} />}
                {needsSignoff && !hasSignoff(a.module_code) && a.completed_on && (
                  <button onClick={() => onSignOff(a.module_code)} className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700"><PenLine className="h-3 w-3" /> Sign off competence</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tag({ ok, label }) {
  return <span className={`rounded-full px-2 py-0.5 ${ok ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-400"}`}>{label}</span>;
}

// ── Supervisor sign-off (writes staff_signoffs; insert-only) ─────────────────
function SignOffModal({ identity, target, onClose, onSigned }) {
  const [name, setName] = useState(identity?.full_name || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mod = MODULE_BY_CODE[target.module_code];

  const sign = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setErr("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("staff_signoffs").insert({
      tenant_id: identity.tenant_id, employee_id: target.employee_id, module_code: target.module_code,
      area: mod?.area || target.module_code[0], result: "competent",
      signed_by_user: user?.id, signed_by_name: name.trim(), note: note.trim() || null,
    });
    if (error) { setErr(error.message || "Couldn't save the sign-off."); setBusy(false); return; }
    onSigned();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="text-sm font-semibold text-stone-800">Sign off practical competence</div>
        <p className="mt-2 text-xs text-stone-500">
          Confirming <span className="font-medium text-stone-700">{target.full_name || target.employee_id}</span> is competent on <span className="font-medium text-stone-700">{mod?.title || target.module_code}</span>.
        </p>
        <label className="mt-4 block text-xs font-medium text-stone-500">Your name (supervisor)</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
        <label className="mt-3 block text-xs font-medium text-stone-500">Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. witnessed table saw operation" className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
        {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-500 hover:bg-stone-50">Cancel</button>
          <button onClick={sign} disabled={busy || !name.trim()} className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{busy ? "Signing…" : "Sign off"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Documents manager (supervisor/admin): create, publish versions, assign ───
function DocumentsManager({ identity, roster }) {
  const [documents, setDocuments] = useState(null);
  const [versions, setVersions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [publishFor, setPublishFor] = useState(null); // document to publish a new version for
  const [assignFor, setAssignFor] = useState(null);   // document to assign to a person

  async function load() {
    setErr("");
    try {
      const [d, v, r] = await Promise.all([
        supabase.from("staff_documents").select("*").order("title"),
        supabase.from("staff_document_versions").select("*"),
        supabase.from("staff_document_reviews").select("*"),
      ]);
      if (d.error) throw d.error;
      setDocuments(d.data || []); setVersions(v.data || []); setReviews(r.data || []);
    } catch (e) { setErr(e?.message || "Couldn't load documents."); setDocuments([]); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const staffCount = roster.filter((r) => r.role === "staff").length;
  // acknowledgement stats for a doc's CURRENT version
  const statsFor = (doc) => {
    const cur = doc.current_version;
    const rs = reviews.filter((x) => x.document_id === doc.id && x.version === cur);
    const acked = rs.filter((x) => x.acknowledged_on).length;
    return { acked, total: rs.length };
  };

  if (documents === null) return <div className="py-10 text-center text-sm text-stone-400">Loading documents…</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-600"><FileText className="h-4 w-4" /> Policy documents <span className="text-stone-400">({documents.length})</span></div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"><Plus className="h-4 w-4" /> New document</button>
      </div>

      {err ? <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</p> : null}

      {documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">
          No documents yet. Create one (a policy, SOP, or plan), publish a version, and every active staff member is asked to review it.
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((d) => {
            const s = statsFor(d);
            return (
              <div key={d.id} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-stone-800">{d.title}</span>
                      <span className="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 text-[0.6rem] text-stone-500">v{d.current_version}</span>
                    </div>
                    <div className="text-[0.7rem] text-stone-400">{d.category ? `${d.category} · ` : ""}{s.acked}/{s.total || staffCount} acknowledged current version</div>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <button onClick={() => setAssignFor(d)} className="rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-stone-100">Assign…</button>
                    <button onClick={() => setPublishFor(d)} className="rounded-md bg-stone-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-stone-700">Publish new version</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && <NewDocumentModal identity={identity} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {publishFor && <PublishVersionModal document={publishFor} onClose={() => setPublishFor(null)} onPublished={() => { setPublishFor(null); load(); }} />}
      {assignFor && <AssignDocModal document={assignFor} roster={roster} onClose={() => setAssignFor(null)} onAssigned={() => { setAssignFor(null); load(); }} />}
    </div>
  );
}

function NewDocumentModal({ identity, onClose, onCreated }) {
  const [title, setTitle] = useState(""); const [category, setCategory] = useState("");
  const [body, setBody] = useState(""); const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy(true); setErr("");
    // 1) create the document, 2) publish v1 (fans out to all active staff)
    const { data, error } = await supabase.from("staff_documents")
      .insert({ tenant_id: identity.tenant_id, title: title.trim(), category: category.trim() || null })
      .select().single();
    if (error) { setErr(error.message); setBusy(false); return; }
    const { error: pErr } = await supabase.rpc("publish_document_version", {
      p_document_id: data.id, p_body: body.trim() || null, p_url: url.trim() || null, p_note: "Initial release", p_due: null,
    });
    if (pErr) { setErr(pErr.message); setBusy(false); return; }
    onCreated();
  };

  return (
    <ModalShell title="New document" onClose={onClose}>
      <label className="block text-xs font-medium text-stone-500">Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Silica Exposure Control Plan" className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
      <label className="mt-3 block text-xs font-medium text-stone-500">Category (optional)</label>
      <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Silica, PPE, Emergency" className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
      <label className="mt-3 block text-xs font-medium text-stone-500">Link to document (optional)</label>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
      <label className="mt-3 block text-xs font-medium text-stone-500">Or paste the text</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Document text staff will read…" className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
      <p className="mt-2 text-[0.7rem] text-stone-400">Publishing asks every active staff member to review &amp; acknowledge this document.</p>
      {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
      <ModalButtons busy={busy} onClose={onClose} onConfirm={create} confirmLabel="Create &amp; publish" disabled={!title.trim()} />
    </ModalShell>
  );
}

function PublishVersionModal({ document, onClose, onPublished }) {
  const [body, setBody] = useState(""); const [url, setUrl] = useState(""); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const publish = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("publish_document_version", {
      p_document_id: document.id, p_body: body.trim() || null, p_url: url.trim() || null, p_note: note.trim() || null, p_due: null,
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    onPublished();
  };
  return (
    <ModalShell title={`Publish new version — ${document.title}`} onClose={onClose}>
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">This becomes v{document.current_version + 1}. Every active staff member will be asked to re-acknowledge. Prior acknowledgements are kept.</div>
      <label className="mt-3 block text-xs font-medium text-stone-500">What changed (shown to staff)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added HEPA vacuum requirement" className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
      <label className="mt-3 block text-xs font-medium text-stone-500">Link (optional)</label>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
      <label className="mt-3 block text-xs font-medium text-stone-500">Or paste the text</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
      {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
      <ModalButtons busy={busy} onClose={onClose} onConfirm={publish} confirmLabel="Publish &amp; notify" />
    </ModalShell>
  );
}

function AssignDocModal({ document, roster, onClose, onAssigned }) {
  const staff = roster.filter((r) => r.role === "staff");
  const [empId, setEmpId] = useState(staff[0]?.employee_id || "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const assign = async () => {
    if (!empId || busy) return;
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("assign_document_review", { p_document_id: document.id, p_employee_id: empId, p_due: null });
    if (error) { setErr(error.message); setBusy(false); return; }
    onAssigned();
  };
  return (
    <ModalShell title={`Assign — ${document.title}`} onClose={onClose}>
      <p className="text-xs text-stone-500">Ask one person to review the current version (v{document.current_version}).</p>
      <label className="mt-3 block text-xs font-medium text-stone-500">Staff member</label>
      <select value={empId} onChange={(e) => setEmpId(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none">
        {staff.map((r) => <option key={r.employee_id} value={r.employee_id}>{r.full_name || r.employee_id}</option>)}
      </select>
      {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
      <ModalButtons busy={busy} onClose={onClose} onConfirm={assign} confirmLabel="Assign" disabled={!empId} />
    </ModalShell>
  );
}

// small modal scaffolding
function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 text-sm font-semibold text-stone-800">{title}</div>
        {children}
      </div>
    </div>
  );
}
function ModalButtons({ busy, onClose, onConfirm, confirmLabel, disabled }) {
  return (
    <div className="mt-5 flex gap-2">
      <button onClick={onClose} className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-500 hover:bg-stone-50">Cancel</button>
      <button onClick={onConfirm} disabled={busy || disabled} className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{busy ? "…" : confirmLabel}</button>
    </div>
  );
}

// ── Supervisor's own training summary (links into their learner view) ────────
function MyTrainingBox({ assignments, identity, onOpen }) {
  const mine = (assignments || []).filter((a) => a.employee_id === identity?.employee_id);
  const outstanding = mine.filter((a) => !a.completed_on).length;
  const total = mine.length;
  if (total === 0) return null;   // nothing assigned to this supervisor
  const allDone = outstanding === 0;
  return (
    <button onClick={onOpen}
      className={`mb-5 flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors ${allDone ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100" : "border-amber-200 bg-amber-50 hover:bg-amber-100"}`}>
      <div>
        <div className={`text-sm font-semibold ${allDone ? "text-emerald-800" : "text-amber-800"}`}>
          {allDone ? "Your training is up to date" : `You have ${outstanding} training ${outstanding === 1 ? "item" : "items"} to complete`}
        </div>
        <div className={`text-xs ${allDone ? "text-emerald-600" : "text-amber-600"}`}>
          {total - outstanding} of {total} complete · tap to open your training
        </div>
      </div>
      <span className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-white ${allDone ? "bg-emerald-600" : "bg-amber-600"}`}>My training →</span>
    </button>
  );
}

function Splash({ label }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100">
      <div className="flex items-center gap-2 text-sm text-stone-400"><span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-amber-500" /> {label || "Loading…"}</div>
    </div>
  );
}

// ── Supervisor shell: toggle between overseeing the team and taking own training ─
// Supervisors are workers too. This gives them both hats behind one login: the
// team view (manage/sign off others) and their own learner dashboard. Their own
// practical competence is signed off by another supervisor or the admin — never
// themselves (enforced in the DB).
export function SupervisorShell({ identity }) {
  const [view, setView] = useState("team");   // team | mine
  const pill = (to, label) => (
    <button onClick={() => setView(to)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50">
      {label}
    </button>
  );
  if (view === "mine") return <StaffApp identity={identity} switchSlot={pill("team", "My team")} />;
  return <ManagerApp identity={identity} switchSlot={pill("mine", "My training")} onGoToMyTraining={() => setView("mine")} />;
}
