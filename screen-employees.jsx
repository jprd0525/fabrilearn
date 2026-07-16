// FabriLearn — Employees screen (Stage 3).
// The HR record is the focus here: who the person is, their employment terms, and
// their role. Assigning a role auto-generates PROPOSED training (from the role's
// profile) that a manager confirms later in Training Assignments. Actually
// approving/assigning training is NOT done here — this screen owns the person.

import { useState } from "react";
import { useShop } from "./shop-context";
import { Button, Card, Field, TextInput, Select, Modal, EmptyState, Pill, SectionTitle } from "./ui";
import { EMPLOYMENT_TYPES, TENURE_TYPES } from "./fab-model";
import { Users, UserPlus, ChevronRight, X, Phone, Mail, MapPin, Clock3, Pencil, ClipboardList, Archive, RotateCcw } from "lucide-react";

export default function EmployeesScreen() {
  const { shop, assignmentsByEmployee, readinessFor, roleById, goTo } = useShop();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const selected = shop.employees.find((e) => e.id === selectedId) || null;

  const activeEmployees = shop.employees.filter((e) => e.active !== false);
  const archivedEmployees = shop.employees.filter((e) => e.active === false);
  const shownEmployees = showArchived ? archivedEmployees : activeEmployees;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-800">Employees</h1>
          <p className="text-sm text-stone-400">{activeEmployees.length} active {activeEmployees.length === 1 ? "person" : "people"} at {shop.settings.shopName}</p>
        </div>
        <Button onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Add employee</Button>
      </div>

      {archivedEmployees.length > 0 && (
        <div className="flex gap-1 text-sm">
          <button onClick={() => setShowArchived(false)} className={`rounded-lg px-3 py-1.5 font-medium ${!showArchived ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-100"}`}>Active ({activeEmployees.length})</button>
          <button onClick={() => setShowArchived(true)} className={`rounded-lg px-3 py-1.5 font-medium ${showArchived ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-100"}`}>Former staff ({archivedEmployees.length})</button>
        </div>
      )}

      {shownEmployees.length === 0 ? (
        <EmptyState icon={Users} title={showArchived ? "No former staff" : "No employees yet"}
          action={!showArchived && <Button onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Add your first employee</Button>}>
          {showArchived ? "Archived employees appear here, with their training records retained for audit." : "Add the people at your shop. Give each a role, and their onboarding training is proposed automatically for you to confirm in Training Assignments."}
        </EmptyState>
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-100 text-[0.68rem] uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">{showArchived ? "Last day" : "Employment"}</th>
                <th className="px-4 py-2.5 font-medium">Training</th>
                <th className="px-4 py-2.5 font-medium">Readiness</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {shownEmployees.map((e) => {
                const asgs = assignmentsByEmployee[e.id] || [];
                const active = asgs.filter((a) => !a.proposed);
                const proposed = asgs.filter((a) => a.proposed);
                const done = active.filter((a) => a.completedOn).length;
                const r = readinessFor(e.id);
                const role = e.roleId ? roleById[e.roleId] : null;
                return (
                  <tr key={e.id} className="cursor-pointer hover:bg-stone-50" onClick={() => setSelectedId(e.id)}>
                    <td className="px-4 py-3 font-medium text-stone-700">{e.name}</td>
                    <td className="px-4 py-3 text-stone-500">{role ? role.name : <span className="text-stone-300">—</span>}</td>
                    <td className="px-4 py-3 text-stone-500">
                      {showArchived ? (e.endDate || <span className="text-stone-300">—</span>) : <>{e.employmentType}{e.tenure === "Temporary" ? " · Temp" : ""}</>}
                    </td>
                    <td className="px-4 py-3 text-stone-500" onClick={(ev) => { ev.stopPropagation(); goTo("assignments", { focusEmployeeId: e.id }); }}>
                      {active.length === 0 && proposed.length === 0
                        ? <span className="text-stone-300">—</span>
                        : (
                          <span className="inline-flex items-center gap-1.5 text-amber-700 hover:text-amber-800">
                            {active.length > 0 && <span>{done}/{active.length} complete</span>}
                            {proposed.length > 0 && <Pill tone="amber">{proposed.length} proposed</Pill>}
                          </span>
                        )}
                    </td>
                    <td className="px-4 py-3">{showArchived ? <Pill tone="neutral">Archived</Pill> : <Pill tone={r.tone}>{r.label}</Pill>}</td>
                    <td className="px-4 py-3 text-right"><ChevronRight className="inline h-4 w-4 text-stone-300" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {addOpen && <EmployeeModal onClose={() => setAddOpen(false)} />}
      {selected && <EmployeeDrawer employee={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

// Shared add/edit form.
function EmployeeModal({ employee, onClose }) {
  const { shop, api } = useShop();
  const editing = !!employee;
  const [f, setF] = useState(() => ({
    name: employee?.name || "",
    roleId: employee?.roleId || "",
    phone: employee?.phone || "",
    email: employee?.email || "",
    address: employee?.address || "",
    startDate: employee?.startDate || new Date().toISOString().slice(0, 10),
    employmentType: employee?.employmentType || "Full-time",
    tenure: employee?.tenure || "Permanent",
    endDate: employee?.endDate || "",
  }));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!f.name.trim() || busy) return;
    setBusy(true);
    try {
      const payload = { ...f, roleId: f.roleId || null };
      if (editing) {
        const roleChanged = await api.updateEmployee(employee.id, payload);
        if (roleChanged) { setNote("Role changed — new training proposed in Training Assignments."); setBusy(false); return; }
      } else {
        await api.addEmployee(payload);
      }
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={editing ? "Edit employee" : "Add employee"}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{note ? "Close" : "Cancel"}</Button>
        <Button onClick={submit} disabled={!f.name.trim() || busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add employee"}</Button>
      </>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name"><TextInput value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Marco Rossi" autoFocus /></Field>
          <Field label="Role" hint="Drives proposed training">
            <Select value={f.roleId} onChange={(e) => set("roleId", e.target.value)}>
              <option value="">— none —</option>
              {shop.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile phone (their login)"><TextInput value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(905) 555-0100" /></Field>
          <Field label="Email"><TextInput type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="name@shop.example" /></Field>
        </div>
        <Field label="Address"><TextInput value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, city, postal code" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start date"><TextInput type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
          <Field label="Employment">
            <Select value={f.employmentType} onChange={(e) => set("employmentType", e.target.value)}>
              {EMPLOYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Tenure">
            <Select value={f.tenure} onChange={(e) => set("tenure", e.target.value)}>
              {TENURE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
        </div>
        {f.tenure === "Temporary" && (
          <Field label="End date" hint="Contract or temp assignment end">
            <TextInput type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
        )}
        {note && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{note}</p>}
      </div>
    </Modal>
  );
}

// ── Archive / restore an employee ────────────────────────────────────────────
// Archiving is soft: the person leaves the active roster and can no longer log
// in, but all their training records are retained for audit. Restore reactivates.
function ArchiveControl({ employee, onDone }) {
  const { api } = useShop();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const isArchived = employee.active === false;
  const todayISO = new Date().toISOString().slice(0, 10);

  const doArchive = async () => {
    setBusy(true);
    await api.updateEmployee(employee.id, { active: false, endDate: employee.endDate || todayISO });
    setBusy(false); setConfirming(false); onDone?.();
  };
  const doRestore = async () => {
    setBusy(true);
    await api.updateEmployee(employee.id, { active: true, endDate: "" });
    setBusy(false); onDone?.();
  };

  if (isArchived) {
    return (
      <Button size="sm" variant="secondary" onClick={doRestore} disabled={busy}>
        <RotateCcw className="h-3.5 w-3.5" /> {busy ? "…" : "Restore"}
      </Button>
    );
  }
  if (!confirming) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
        <Archive className="h-3.5 w-3.5" /> Archive
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1">
      <span className="text-xs text-amber-700">Archive &amp; end access?</span>
      <button onClick={doArchive} disabled={busy} className="rounded-md bg-amber-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">{busy ? "…" : "Yes"}</button>
      <button onClick={() => setConfirming(false)} className="rounded-md px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-100">No</button>
    </div>
  );
}

function EmployeeDrawer({ employee, onClose }) {
  const { assignmentsByEmployee, readinessFor, roleById, profileById, goTo } = useShop();
  const [editOpen, setEditOpen] = useState(false);
  const asgs = assignmentsByEmployee[employee.id] || [];
  const active = asgs.filter((a) => !a.proposed);
  const proposed = asgs.filter((a) => a.proposed);
  const done = active.filter((a) => a.completedOn).length;
  const r = readinessFor(employee.id);
  const role = employee.roleId ? roleById[employee.roleId] : null;
  const profile = role ? profileById[role.profileId] : null;
  const manageTraining = () => { onClose(); goTo("assignments", { focusEmployeeId: employee.id }); };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-stone-50 shadow-xl">
        <div className="flex items-start justify-between border-b border-stone-200 bg-white px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-stone-800">{employee.name}</h2>
              <Pill tone={r.tone}>{r.label}</Pill>
            </div>
            <p className="mt-0.5 text-sm text-stone-400">
              {role ? role.name : "No role"} · {employee.employmentType}
              {employee.tenure === "Temporary" ? ` · Temp${employee.endDate ? ` to ${employee.endDate}` : ""}` : " · Permanent"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            <ArchiveControl employee={employee} onDone={onClose} />
            <button onClick={onClose} className="rounded-md p-1 text-stone-400 hover:bg-stone-100" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {employee.active === false && (
            <div className="rounded-lg border border-stone-300 bg-stone-100 px-4 py-3 text-sm">
              <span className="font-medium text-stone-700">Archived — access ended{employee.endDate ? ` on ${employee.endDate}` : ""}.</span>
              <span className="text-stone-500"> Training records are retained for audit. Use Restore to reactivate.</span>
            </div>
          )}
          {/* Contact / employment record */}
          <div>
            <SectionTitle>Record</SectionTitle>
            <Card className="divide-y divide-stone-100 text-sm">
              <RecordRow icon={Phone} label="Phone" value={employee.phone} />
              <RecordRow icon={Mail} label="Email" value={employee.email} />
              <RecordRow icon={MapPin} label="Address" value={employee.address} />
              <RecordRow icon={Clock3} label="Started" value={employee.startDate} />
              {employee.endDate ? <RecordRow icon={Clock3} label="Last day" value={employee.endDate} /> : null}
            </Card>
          </div>

          {/* Training — read-only peek; management lives in Training Assignments */}
          <div>
            <SectionTitle right={
              <Button size="sm" variant="secondary" onClick={manageTraining}>
                <ClipboardList className="h-3.5 w-3.5" /> Manage training
              </Button>
            }>Training</SectionTitle>

            {active.length === 0 && proposed.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No training yet">
                {role
                  ? "Confirm this employee's proposed training in Training Assignments."
                  : "Assign a role (Edit) to auto-propose onboarding training, or assign modules directly in Training Assignments."}
              </EmptyState>
            ) : (
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Pill tone={r.tone}>{r.label}</Pill>
                    <span className="text-stone-500">
                      {active.length > 0 && <>{done}/{active.length} complete</>}
                      {active.length === 0 && proposed.length > 0 && <span className="text-stone-400">no confirmed training yet</span>}
                    </span>
                    {proposed.length > 0 && <Pill tone="amber">{proposed.length} proposed</Pill>}
                  </div>
                </div>
                {proposed.length > 0 && (
                  <p className="mt-2 text-xs text-stone-400">
                    {proposed.length} module{proposed.length === 1 ? "" : "s"} proposed{role ? ` from the ${role.name} role` : ""}
                    {profile ? ` (${profile.name})` : ""} — approve in Training Assignments.
                  </p>
                )}
                <button onClick={manageTraining} className="mt-3 text-xs font-medium text-amber-700 hover:text-amber-800">
                  View & manage this employee's training →
                </button>
              </Card>
            )}
          </div>
        </div>
      </div>

      {editOpen && <EmployeeModal employee={employee} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function RecordRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-stone-300" />
      <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-stone-400">{label}</span>
      <span className="text-stone-600">{value || <span className="text-stone-300">—</span>}</span>
    </div>
  );
}
