// FabriLearn — Supervisor Preview.
//
// The preview counterpart to the staff (learner) preview: what a supervisor sees
// on their phone — the team roster, each person's training progress, and who
// needs a practical sign-off. Built from shop-context (admin) data so it previews
// the real manager experience without needing a live supervisor session. Read-only
// preview: the real sign-off action lives in the production supervisor view and
// the admin Sign-offs screen.

import { useMemo, useState } from "react";
import { useShop } from "./shop-context";
import { STATUS } from "./fab-model";
import { Sparkles, LogOut, ChevronLeft, Users, AlertTriangle, CheckCircle2, HardHat } from "lucide-react";

export default function SupervisorPreview() {
  const { shop, goTo } = useShop();
  const [selectedId, setSelectedId] = useState(null);

  // Active employees only (archived drop off the roster), staff + supervisors.
  const roster = shop.employees.filter((e) => e.active !== false);
  const selected = selectedId ? roster.find((e) => e.id === selectedId) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50/40 to-stone-50">
      {/* Preview top bar */}
      <div className="border-b border-sky-200 bg-sky-100/70">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
          <Sparkles className="h-4 w-4 text-sky-700" />
          <span className="text-xs font-medium text-sky-800">Supervisor view — preview</span>
          <button onClick={() => goTo("dashboard")}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-50">
            <LogOut className="h-3.5 w-3.5" /> Exit preview
          </button>
        </div>
      </div>

      {/* Phone-frame-ish header */}
      <div className="mx-auto max-w-3xl px-4">
        <div className="mt-4 flex items-center gap-2.5 rounded-t-xl border border-b-0 border-stone-200 bg-white px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-white"><HardHat style={{ height: 18, width: 18 }} /></span>
          <div>
            <div className="text-sm font-semibold text-stone-800">Team Training</div>
            <div className="text-[0.7rem] text-stone-400">supervisor</div>
          </div>
        </div>

        <div className="rounded-b-xl border border-stone-200 bg-stone-50 px-4 py-5">
          {!selected ? <TeamList roster={roster} onSelect={setSelectedId} /> : <PersonView employee={selected} onBack={() => setSelectedId(null)} />}
        </div>
      </div>
    </div>
  );
}

function TeamList({ roster, onSelect }) {
  const { assignmentsByEmployee } = useShop();
  const progressFor = (id) => {
    const list = (assignmentsByEmployee[id] || []).filter((a) => !a.proposed);
    const done = list.filter((a) => a.completedOn).length;
    const overdue = list.filter((a) => a._status === STATUS.OVERDUE).length;
    return { done, total: list.length, overdue };
  };
  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-600"><Users className="h-4 w-4" /> Your team <span className="text-stone-400">({roster.length})</span></div>
      {roster.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">No staff yet.</div>
      ) : (
        <div className="space-y-2">
          {roster.map((e) => {
            const p = progressFor(e.id);
            return (
              <button key={e.id} onClick={() => onSelect(e.id)}
                className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 text-left hover:border-sky-300">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-stone-800">{e.name}</div>
                  <div className="text-[0.7rem] text-stone-400">{e.employmentType || "staff"}</div>
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
  );
}

function PersonView({ employee, onBack }) {
  const { assignmentsByEmployee, signoffFor } = useShop();
  const list = (assignmentsByEmployee[employee.id] || []).filter((a) => !a.proposed);

  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600"><ChevronLeft className="h-3.5 w-3.5" /> Back to team</button>
      <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4">
        <div className="text-sm font-semibold text-stone-800">{employee.name}</div>
        <div className="text-[0.7rem] text-stone-400">{employee.employmentType || "staff"}</div>
      </div>

      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Training</div>
      <div className="space-y-2">
        {list.length === 0 && <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-400">No training assigned.</div>}
        {list.map((a) => {
          const so = a.requiresSignoff ? signoffFor(employee.id, a.moduleCode) : null;
          return (
            <div key={a.id} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-stone-800">{a.module?.title || a.moduleCode}</div>
                  <div className="text-[0.7rem] text-stone-400">{a.moduleCode}</div>
                </div>
                <div className="ml-3 shrink-0 text-xs">
                  {a.completedOn
                    ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {a.score != null ? `${a.score}%` : "done"}</span>
                    : <span className="text-stone-400">not started</span>}
                </div>
              </div>
              {a.requiresSignoff && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.68rem]">
                  <span className={`rounded-full px-2 py-0.5 ${so?.result === "pass" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-400"}`}>
                    {so?.result === "pass" ? "signed off" : a.completedOn ? "needs sign-off" : "awaiting completion"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-[0.7rem] text-stone-400">Preview — the real sign-off action is on the supervisor's phone and the admin Sign-offs screen.</p>
    </div>
  );
}
