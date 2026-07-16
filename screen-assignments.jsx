// FabriLearn — Training Assignments screen (Stage 3, revised).
// The single source of truth for training. One row per employee; expand to see
// and act on that person's training. Proposals (role-driven, awaiting approval)
// and active assignments both live inside each employee's expanded panel — one
// place per person. Bulk assignment (spec §14) is the toolbar action.

import { useMemo, useState, useEffect } from "react";
import { useShop } from "./shop-context";
import { Button, Card, Select, Modal, EmptyState, Pill, StatusPill, SectionTitle } from "./ui";
import { STATUS } from "./fab-model";
import { ClipboardList, CheckCircle2, Plus, ChevronDown, ChevronRight, Inbox } from "lucide-react";

export default function AssignmentsScreen() {
  const { shop, assignmentsByEmployee, roleById, readinessFor, api, nav, goTo } = useShop();
  const [assignOpen, setAssignOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set(nav.focusEmployeeId ? [nav.focusEmployeeId] : []));

  // If we arrived here via "Manage training" for a specific person, expand them.
  useEffect(() => {
    if (nav.focusEmployeeId) setExpanded((s) => new Set(s).add(nav.focusEmployeeId));
  }, [nav.focusEmployeeId]);

  const toggle = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totalProposals = useMemo(
    () => Object.values(assignmentsByEmployee).flat().filter((a) => a.proposed).length,
    [assignmentsByEmployee]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-800">Training Assignments</h1>
          <p className="text-sm text-stone-400">
            Every employee's training in one place.
            {totalProposals > 0 && <> <span className="text-amber-700">{totalProposals} proposed</span> awaiting approval.</>}
          </p>
        </div>
        <Button onClick={() => setAssignOpen(true)}><Plus className="h-4 w-4" /> Assign training</Button>
      </div>

      {shop.employees.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No employees yet">
          Add employees first — then give them a role or assign modules, and their training shows up here.
        </EmptyState>
      ) : (
        <Card>
          <div className="divide-y divide-stone-100">
            {shop.employees.map((e) => {
              const list = assignmentsByEmployee[e.id] || [];
              const proposed = list.filter((a) => a.proposed);
              const active = list.filter((a) => !a.proposed);
              const done = active.filter((a) => a.completedOn).length;
              const r = readinessFor(e.id);
              const isOpen = expanded.has(e.id);
              const role = e.roleId ? roleById[e.roleId] : null;

              return (
                <div key={e.id}>
                  {/* Summary row */}
                  <button onClick={() => toggle(e.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-stone-400" /> : <ChevronRight className="h-4 w-4 text-stone-300" />}
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-stone-700">{e.name}</span>
                      <span className="text-sm text-stone-400"> · {role ? role.name : "no role"}</span>
                    </span>
                    <span className="text-sm text-stone-500">
                      {active.length > 0 ? `${done}/${active.length} complete` : <span className="text-stone-300">no active training</span>}
                    </span>
                    {proposed.length > 0 && <Pill tone="amber">{proposed.length} proposed</Pill>}
                    <Pill tone={r.tone}>{r.label}</Pill>
                  </button>

                  {/* Expanded panel */}
                  {isOpen && (
                    <div className="space-y-3 bg-stone-50/60 px-4 py-3 pl-11">
                      {proposed.length > 0 && (
                        <ProposalBlock employee={e} role={role} proposals={proposed} api={api} />
                      )}

                      {active.length > 0 ? (
                        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
                          <table className="w-full text-left text-sm">
                            <thead className="border-b border-stone-100 text-[0.68rem] uppercase tracking-wide text-stone-400">
                              <tr>
                                <th className="px-3 py-2 font-medium">Module</th>
                                <th className="px-3 py-2 font-medium">Recurrence</th>
                                <th className="px-3 py-2 font-medium">Next due</th>
                                <th className="px-3 py-2 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                              {active.map((a) => (
                                <tr key={a.id}>
                                  <td className="px-3 py-2 text-stone-700">
                                    <span className="font-mono text-xs text-stone-400">{a.moduleCode}</span> {a.module?.title}
                                    {a.overridden && <Pill tone="sky">override</Pill>}
                                  </td>
                                  <td className="px-3 py-2 text-stone-500">{a.recurrenceLabel}</td>
                                  <td className="px-3 py-2 text-stone-500">{a.nextDue || "—"}</td>
                                  <td className="px-3 py-2">
                                    {a.status === STATUS.AWAITING ? (
                                      <button onClick={() => goTo("signoffs", { focusEmployeeId: e.id })}
                                        className="rounded-md ring-1 ring-transparent transition hover:ring-amber-300" title="Go to sign-off">
                                        <StatusPill status={a.status} />
                                      </button>
                                    ) : <StatusPill status={a.status} />}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : proposed.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-stone-200 px-3 py-4 text-center text-xs text-stone-400">
                          No training assigned. Use “Assign training” above, or give {e.name.split(" ")[0]} a role in Employees.
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {assignOpen && <AssignModal onClose={() => setAssignOpen(false)} />}
    </div>
  );
}

// Proposals for one employee, with per-item selection and approve/dismiss.
function ProposalBlock({ employee, role, proposals, api }) {
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(() => new Set(proposals.map((p) => p.id)));
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = sel.size === proposals.length;
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  return (
    <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/50">
      <div className="flex items-center justify-between border-b border-amber-100 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
          <Inbox className="h-3.5 w-3.5" /> {proposals.length} proposed{role ? ` from ${role.name}` : ""} — approve to confirm
        </span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" disabled={busy || sel.size === 0}
            onClick={() => run(() => api.dismissProposals([...sel]))}>Dismiss</Button>
          <Button size="sm" disabled={busy || sel.size === 0}
            onClick={() => run(() => api.approveProposals([...sel]))}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve{sel.size < proposals.length ? ` (${sel.size})` : " all"}
          </Button>
        </div>
      </div>
      <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-stone-400">
        <input type="checkbox" checked={allSelected}
          onChange={() => setSel(allSelected ? new Set() : new Set(proposals.map((p) => p.id)))} />
        Select all
      </label>
      <div className="divide-y divide-amber-100/70">
        {proposals.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-amber-50">
            <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
            <span className="font-mono text-xs text-stone-400">{p.moduleCode}</span>
            <span className="flex-1 text-sm text-stone-700">{p.module?.title}</span>
            <span className="text-xs text-stone-400">{p.recurrenceLabel}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// Direct + bulk assignment: choose modules and one-or-many employees.
function AssignModal({ onClose }) {
  const { shop, api } = useShop();
  const [empIds, setEmpIds] = useState(new Set());
  const [modCodes, setModCodes] = useState(new Set());
  const [areaFilter, setAreaFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const modules = areaFilter === "all" ? shop.modules : shop.modules.filter((m) => m.area === areaFilter);
  const mk = (setter) => (id) => setter((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleEmp = mk(setEmpIds);
  const toggleMod = mk(setModCodes);

  const canAssign = empIds.size > 0 && modCodes.size > 0 && !busy;
  const submit = async () => {
    if (!canAssign) return;
    setBusy(true);
    try { setResult(await api.assignModules({ moduleCodes: [...modCodes], employeeIds: [...empIds] })); }
    finally { setBusy(false); }
  };

  if (result != null) {
    return (
      <Modal open onClose={onClose} title="Training assigned" footer={<Button onClick={onClose}>Done</Button>}>
        <p className="text-sm text-stone-600">
          Added <span className="font-medium text-stone-800">{result}</span> assignment{result === 1 ? "" : "s"} across {empIds.size} employee{empIds.size === 1 ? "" : "s"}.
          {result === 0 && " (Everyone already had the selected modules.)"}
        </p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Assign training"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={!canAssign}>
          {busy ? "Assigning…" : `Assign to ${empIds.size || "—"} ${empIds.size === 1 ? "person" : "people"}`}
        </Button>
      </>}>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-stone-600">Employees ({empIds.size} selected)</p>
          {shop.employees.length === 0 ? <p className="text-xs text-stone-400">No employees yet.</p> : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-stone-200 p-2">
              {shop.employees.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-stone-50">
                  <input type="checkbox" checked={empIds.has(e.id)} onChange={() => toggleEmp(e.id)} />
                  <span className="text-stone-700">{e.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-stone-600">Modules ({modCodes.size})</p>
            <Select className="!w-auto !py-1 text-xs" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
              <option value="all">All areas</option>
              {shop.areas.map((a) => <option key={a.id} value={a.id}>{a.id} · {a.name}</option>)}
            </Select>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-stone-200 p-2">
            {modules.map((m) => (
              <label key={m.code} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-stone-50">
                <input type="checkbox" checked={modCodes.has(m.code)} onChange={() => toggleMod(m.code)} />
                <span className="font-mono text-xs text-stone-400">{m.code}</span>
                <span className="truncate text-stone-700">{m.title}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-stone-400">
        Modules an employee already has are skipped automatically. Assigning to several people at once is the bulk path.
      </p>
    </Modal>
  );
}
