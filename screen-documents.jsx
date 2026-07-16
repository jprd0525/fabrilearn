// FabriLearn — Documents (Stage 5).
// A register of shop documents (policies, SOPs, plans) with versioning and links.
// Acknowledging a document is itself an attestation on the same tamper-evident
// chain (subjectType "document"), so §13's "same record shape" holds exactly.
// Binary upload is deferred to Stage 6 storage; documents carry a link for now.

import { useMemo, useState, useEffect } from "react";
import { useShop } from "./shop-context";
import { ME, supabase } from "./supabase-adapter";
import { Button, Card, Field, TextInput, Select, Modal, EmptyState, Pill, SectionTitle } from "./ui";
import { DOCUMENT_CATEGORIES } from "./fab-model";
import {
  FileText, FileCheck, Plus, Pencil, Trash2, ExternalLink, Users, History,
  Check, PenLine, AlertCircle, Send,
} from "lucide-react";

export default function DocumentsScreen() {
  const [tab, setTab] = useState("review");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-800">Documents</h1>
        <p className="text-sm text-stone-400">Policies, SOPs and plans — versioned, and acknowledged by staff.</p>
      </div>
      <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
        <Tab on={tab === "review"} onClick={() => setTab("review")} icon={FileCheck}>Staff review</Tab>
        <Tab on={tab === "register"} onClick={() => setTab("register")} icon={FileText}>Register (legacy)</Tab>
        <Tab on={tab === "ack"} onClick={() => setTab("ack")} icon={Users}>Acknowledgements (legacy)</Tab>
      </div>
      {tab === "review" ? <StaffReview /> : tab === "register" ? <Register /> : <Acknowledgements />}
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

// ── Staff Review (secure documents — the real staff-facing workflow) ─────────
// Desktop twin of the phone manager's Documents tab. Manages the secure
// staff_documents tables so the admin can create/publish/assign policy reviews
// and see who's acknowledged. Ensures an admin identity first (gated on the
// engine's memberships) so the admin can operate on the secure layer.
function StaffReview() {
  const [ready, setReady] = useState(false);
  const [documents, setDocuments] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [roster, setRoster] = useState([]);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [publishFor, setPublishFor] = useState(null);
  const [detailFor, setDetailFor] = useState(null);

  async function load() {
    setErr("");
    try {
      // Ensure this admin has a secure-layer identity (idempotent).
      await supabase.rpc("ensure_admin_identity");
      const [d, r, prov, ident] = await Promise.all([
        supabase.from("staff_documents").select("*").order("title"),
        supabase.from("staff_document_reviews").select("*"),
        supabase.from("staff_provisioning").select("employee_id, full_name, role, active"),
        supabase.from("staff_identities").select("employee_id, full_name, role, active"),
      ]);
      if (d.error) throw d.error;
      setDocuments(d.data || []);
      setReviews(r.data || []);
      // roster of active staff (for assign + counts)
      const byId = {};
      (prov.data || []).forEach((p) => { if (p.active !== false && p.role === "staff") byId[p.employee_id] = { employee_id: p.employee_id, full_name: p.full_name }; });
      (ident.data || []).forEach((i) => { if (i.active !== false && i.role === "staff") byId[i.employee_id] = { employee_id: i.employee_id, full_name: i.full_name }; });
      setRoster(Object.values(byId));
      setReady(true);
    } catch (e) { setErr(e?.message || "Couldn't load documents."); setDocuments([]); setReady(true); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const statsFor = (doc) => {
    const rs = reviews.filter((x) => x.document_id === doc.id && x.version === doc.current_version);
    return { acked: rs.filter((x) => x.acknowledged_on).length, total: rs.length };
  };

  if (!ready) return <div className="py-10 text-center text-sm text-stone-400">Loading…</div>;

  return (
    <div className="space-y-3">
      {err ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</p> : null}
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">Documents staff read and acknowledge. Publishing a new version asks everyone to re-acknowledge.</p>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New document</Button>
      </div>

      {documents.length === 0 ? (
        <EmptyState icon={FileCheck} title="No staff-review documents yet">
          Create a policy, SOP, or plan. Every active staff member is asked to review and acknowledge it, and re-acknowledge when you publish a new version.
        </EmptyState>
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-100 text-[0.68rem] uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Document</th>
                <th className="px-4 py-2.5 font-medium">Version</th>
                <th className="px-4 py-2.5 font-medium">Acknowledged</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {documents.map((d) => {
                const s = statsFor(d);
                const pending = (s.total || roster.length) - s.acked;
                return (
                  <tr key={d.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <button onClick={() => setDetailFor(d)} className="font-medium text-stone-700 hover:text-amber-700">{d.title}</button>
                      {d.category ? <span className="ml-2 text-xs text-stone-400">{d.category}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-stone-500">v{d.current_version}</td>
                    <td className="px-4 py-3">
                      {s.total === 0 ? <span className="text-xs text-stone-300">not yet assigned</span> : (
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className="text-emerald-700">{s.acked} done</span>
                          {pending > 0 && <Pill tone="amber">{pending} pending</Pill>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setPublishFor(d)} className="rounded-md bg-stone-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-stone-700">Publish new version</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {creating && <NewSecureDocModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
      {publishFor && <PublishSecureModal document={publishFor} onClose={() => setPublishFor(null)} onDone={() => { setPublishFor(null); load(); }} />}
      {detailFor && <DocDetailModal document={detailFor} reviews={reviews.filter((r) => r.document_id === detailFor.id)} roster={roster} onClose={() => setDetailFor(null)} />}
    </div>
  );
}

function NewSecureDocModal({ onClose, onDone }) {
  const [f, setF] = useState({ title: "", category: "", url: "", body: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const create = async () => {
    if (!f.title.trim() || busy) return;
    setBusy(true); setErr("");
    const { data, error } = await supabase.from("staff_documents")
      .insert({ tenant_id: (await currentTenant()), title: f.title.trim(), category: f.category.trim() || null })
      .select().single();
    if (error) { setErr(error.message); setBusy(false); return; }
    const { error: pErr } = await supabase.rpc("publish_document_version", {
      p_document_id: data.id, p_body: f.body.trim() || null, p_url: f.url.trim() || null, p_note: "Initial release", p_due: null });
    if (pErr) { setErr(pErr.message); setBusy(false); return; }
    onDone();
  };
  return (
    <Modal title="New document" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title"><TextInput value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Silica Exposure Control Plan" /></Field>
        <Field label="Category (optional)"><TextInput value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Silica, PPE, Emergency" /></Field>
        <Field label="Link to document (optional)"><TextInput value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" /></Field>
        <Field label="Or paste the text"><textarea value={f.body} onChange={(e) => set("body", e.target.value)} rows={4} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-500" placeholder="Document text staff will read…" /></Field>
        <p className="text-xs text-stone-400">Publishing asks every active staff member to review &amp; acknowledge this document.</p>
        {err ? <p className="text-xs text-rose-600">{err}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={create} disabled={busy || !f.title.trim()}>{busy ? "…" : "Create & publish"}</Button></div>
      </div>
    </Modal>
  );
}

function PublishSecureModal({ document, onClose, onDone }) {
  const [f, setF] = useState({ note: "", url: "", body: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const publish = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("publish_document_version", {
      p_document_id: document.id, p_body: f.body.trim() || null, p_url: f.url.trim() || null, p_note: f.note.trim() || null, p_due: null });
    if (error) { setErr(error.message); setBusy(false); return; }
    onDone();
  };
  return (
    <Modal title={`Publish new version — ${document.title}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">This becomes v{document.current_version + 1}. Every active staff member will be asked to re-acknowledge; prior acknowledgements are kept.</div>
        <Field label="What changed (shown to staff)"><TextInput value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. Added HEPA vacuum requirement" /></Field>
        <Field label="Link (optional)"><TextInput value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" /></Field>
        <Field label="Or paste the text"><textarea value={f.body} onChange={(e) => set("body", e.target.value)} rows={4} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-500" /></Field>
        {err ? <p className="text-xs text-rose-600">{err}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={publish} disabled={busy}>{busy ? "…" : "Publish & notify"}</Button></div>
      </div>
    </Modal>
  );
}

function DocDetailModal({ document, reviews, roster, onClose }) {
  const cur = reviews.filter((r) => r.version === document.current_version);
  const ackedIds = new Set(cur.filter((r) => r.acknowledged_on).map((r) => r.employee_id));
  const nameFor = (id) => roster.find((r) => r.employee_id === id)?.full_name || id;
  return (
    <Modal title={document.title} onClose={onClose}>
      <div className="space-y-3">
        <div className="text-xs text-stone-500">Current version v{document.current_version}{document.category ? ` · ${document.category}` : ""}</div>
        <SectionTitle>Acknowledgement status</SectionTitle>
        {cur.length === 0 ? (
          <p className="text-sm text-stone-400">Not yet assigned to anyone. Publishing a new version assigns it to all active staff.</p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {cur.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-stone-100 px-3 py-2 text-sm">
                <span className="text-stone-700">{nameFor(r.employee_id)}</span>
                {r.acknowledged_on
                  ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" /> {r.signed_name} · {new Date(r.acknowledged_on).toLocaleDateString()}</span>
                  : <Pill tone="amber">pending</Pill>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

async function currentTenant() {
  // Resolve the admin's tenant via their (just-ensured) identity.
  const { data } = await supabase.from("staff_identities").select("tenant_id").limit(1).maybeSingle();
  return data?.tenant_id || "00000000-0000-0000-0000-0000000000f1";
}

// ── Register ─────────────────────────────────────────────────────────────────
function Register() {
  const { shop, api } = useShop();
  const [editing, setEditing] = useState(null); // doc | {new:true}

  const remove = async (id) => { await api.saveDocuments(shop.documents.filter((d) => d.id !== id)); };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-400">Documents marked “onboarding” appear in every employee's acknowledgement list.</p>
        <Button size="sm" onClick={() => setEditing({ new: true })}><Plus className="h-3.5 w-3.5" /> Add document</Button>
      </div>

      {shop.documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet"
          action={<Button size="sm" onClick={() => setEditing({ new: true })}>Add a document</Button>}>
          Register your policies, SOPs, and safety plans. Link each to where the file lives, and collect acknowledgements.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-100 text-[0.68rem] uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Document</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Version</th>
                <th className="px-4 py-2.5 font-medium">Onboarding</th>
                <th className="px-4 py-2.5 font-medium">Link</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {shop.documents.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2.5">
                    <div className="text-stone-700">{d.title}</div>
                    {d.notes && <div className="text-xs text-stone-400">{d.notes}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-stone-500">{d.category}</td>
                  <td className="px-4 py-2.5 text-stone-500">v{d.version}</td>
                  <td className="px-4 py-2.5">{d.onboardingRequired ? <Pill tone="amber">required</Pill> : <span className="text-xs text-stone-300">optional</span>}</td>
                  <td className="px-4 py-2.5">
                    {d.link
                      ? <a href={d.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800">open <ExternalLink className="h-3 w-3" /></a>
                      : <span className="text-xs text-stone-300">no link</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setEditing(d)} className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => remove(d.id)} className="rounded-md p-1.5 text-stone-300 hover:bg-rose-50 hover:text-rose-500" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && <DocModal doc={editing.new ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DocModal({ doc, onClose }) {
  const { shop, api } = useShop();
  const editing = !!doc;
  const [f, setF] = useState(() => ({
    title: doc?.title || "", category: doc?.category || DOCUMENT_CATEGORIES[0],
    version: doc?.version || "1.0", link: doc?.link || "", notes: doc?.notes || "",
    onboardingRequired: doc?.onboardingRequired ?? true,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (!f.title.trim() || busy) return;
    setBusy(true);
    try {
      let documents;
      if (editing) documents = shop.documents.map((d) => (d.id === doc.id ? { ...d, ...f, title: f.title.trim() } : d));
      else documents = [...shop.documents, { id: "doc-" + Math.random().toString(36).slice(2, 8), ...f, title: f.title.trim() }];
      await api.saveDocuments(documents);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={editing ? "Edit document" : "Add document"}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={!f.title.trim() || busy}>{busy ? "Saving…" : editing ? "Save" : "Add document"}</Button>
      </>}>
      <div className="space-y-3">
        <Field label="Title"><TextInput value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Silica Exposure Control Plan" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={f.category} onChange={(e) => set("category", e.target.value)}>
              {DOCUMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Version" hint="Bumping this asks everyone to re-acknowledge.">
            <TextInput value={f.version} onChange={(e) => set("version", e.target.value)} placeholder="1.0" />
          </Field>
        </div>
        <Field label="Link" hint="Where the file lives (Drive, SharePoint, intranet). Upload comes in Stage 6.">
          <TextInput value={f.link} onChange={(e) => set("link", e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Notes"><TextInput value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" /></Field>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={f.onboardingRequired} onChange={(e) => set("onboardingRequired", e.target.checked)} />
          Required at onboarding (everyone acknowledges)
        </label>
      </div>
    </Modal>
  );
}

// ── Acknowledgements ─────────────────────────────────────────────────────────
function Acknowledgements() {
  const { shop, attestationFor } = useShop();
  const [selectedId, setSelectedId] = useState(shop.employees[0]?.id || null);
  const [signing, setSigning] = useState(null);

  const required = useMemo(() => shop.documents.filter((d) => d.onboardingRequired), [shop.documents]);

  if (shop.employees.length === 0) return <EmptyState icon={Users} title="No employees yet">Add employees to track document acknowledgements.</EmptyState>;
  if (required.length === 0) return <EmptyState icon={FileText} title="No onboarding documents">Mark documents “required at onboarding” in the Register to track their acknowledgement here.</EmptyState>;

  const employee = shop.employees.find((e) => e.id === selectedId);

  const statusOf = (doc) => {
    const att = attestationFor(employee.id, doc.id, "document");
    if (!att) return { state: "none" };
    if (att.contentVersion !== doc.version) return { state: "outdated", att };
    return { state: "current", att };
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
      <Card className="h-fit overflow-hidden">
        <div className="border-b border-stone-100 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-wide text-stone-400">Employees</div>
        <div className="max-h-[32rem] divide-y divide-stone-100 overflow-y-auto">
          {shop.employees.map((e) => {
            const acked = required.filter((d) => { const a = attestationFor(e.id, d.id, "document"); return a && a.contentVersion === d.version; }).length;
            const on = e.id === selectedId;
            return (
              <button key={e.id} onClick={() => setSelectedId(e.id)}
                className={"flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-stone-50 " + (on ? "bg-amber-50" : "")}>
                <span className="min-w-0 flex-1">
                  <span className={"block truncate " + (on ? "font-medium text-amber-800" : "text-stone-700")}>{e.name}</span>
                  <span className="block truncate text-xs text-stone-400">{acked}/{required.length} acknowledged</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-stone-100 px-5 py-3.5">
          <h2 className="text-base font-semibold text-stone-800">{employee?.name}</h2>
          <p className="text-sm text-stone-400">Onboarding document acknowledgements</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-100 text-[0.68rem] uppercase tracking-wide text-stone-400">
            <tr><th className="px-4 py-2.5 font-medium">Document</th><th className="px-4 py-2.5 font-medium">Version</th><th className="px-4 py-2.5 font-medium">Acknowledgement</th><th className="px-4 py-2.5"></th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {required.map((d) => {
              const st = statusOf(d);
              return (
                <tr key={d.id}>
                  <td className="px-4 py-2.5 text-stone-700">{d.title}<span className="ml-1.5 text-xs text-stone-400">{d.category}</span></td>
                  <td className="px-4 py-2.5 text-stone-500">v{d.version}</td>
                  <td className="px-4 py-2.5">
                    {st.state === "current" && <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" /> acknowledged {st.att.timestamp.slice(0, 10)}</span>}
                    {st.state === "outdated" && <span className="inline-flex items-center gap-1.5 text-xs text-amber-700"><AlertCircle className="h-3.5 w-3.5" /> outdated — acknowledged v{st.att.contentVersion}</span>}
                    {st.state === "none" && <span className="text-xs text-stone-400">not acknowledged</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {st.state === "current"
                      ? <Button size="sm" variant="ghost" onClick={() => setSigning({ doc: d, existing: st.att })}><Pencil className="h-3.5 w-3.5" /> Re-sign</Button>
                      : <Button size="sm" onClick={() => setSigning({ doc: d, existing: st.att })}><PenLine className="h-3.5 w-3.5" /> Acknowledge</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {signing && <AckModal employee={employee} doc={signing.doc} existing={signing.existing} onClose={() => setSigning(null)} />}
    </div>
  );
}

function AckModal({ employee, doc, existing, onClose }) {
  const { api } = useShop();
  const correcting = existing && existing.contentVersion === doc.version; // re-sign same version = correction
  const [signature, setSignature] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ackText = `I confirm I have read and understood "${doc.title}" (version ${doc.version}), and I will follow it in my work.`;
  const canSign = signature.trim().length >= 2 && (!correcting || reason.trim().length >= 3) && !busy;

  const submit = async () => {
    if (!canSign) return;
    setBusy(true);
    try {
      await api.recordAttestation({
        employeeId: employee.id,
        subjectType: "document",
        subjectId: doc.id,
        subjectTitle: doc.title,
        ackText,
        contentVersion: doc.version,
        signature: signature.trim(),
        signedBy: ME,
        device: typeof navigator !== "undefined" ? navigator.userAgent : "",
        timestamp: new Date().toISOString(),
        supersedesId: correcting ? existing.id : null,
        reason: correcting ? reason.trim() : null,
      });
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={correcting ? "Correct acknowledgement" : "Acknowledge document"}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={!canSign}>{busy ? "Recording…" : correcting ? "Record correction" : "Sign & acknowledge"}</Button>
      </>}>
      <div className="space-y-3">
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <div className="text-stone-700">{doc.title}</div>
          <div className="mt-0.5 text-xs text-stone-400">{doc.category} · version {doc.version} · for {employee.name}</div>
          {doc.link && <a href={doc.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800">open document <ExternalLink className="h-3 w-3" /></a>}
        </div>
        {existing && existing.contentVersion !== doc.version && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
            A newer version (v{doc.version}) is being acknowledged. The prior acknowledgement of v{existing.contentVersion} stays in the audit log.
          </div>
        )}
        <div className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-600 italic">{ackText}</div>
        <Field label="Signature — type full name to sign">
          <TextInput value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={employee.name} autoFocus />
        </Field>
        {correcting && (
          <Field label="Reason for correction" hint="Required — recorded on the superseding entry.">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. corrected signature" />
          </Field>
        )}
        <p className="text-[0.68rem] text-stone-400">Recorded by {ME} · {new Date().toLocaleString()} · appended to the tamper-evident attestation log.</p>
      </div>
    </Modal>
  );
}
