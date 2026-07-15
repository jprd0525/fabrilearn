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
import { HardHat, LogOut, ChevronLeft, PenLine, CheckCircle2, AlertTriangle, Users } from "lucide-react";

const MODULE_BY_CODE = Object.fromEntries(SEED_MODULES.map((m) => [m.code, m]));

export default function ManagerApp({ identity, switchSlot }) {
  const [roster, setRoster] = useState(null);     // [{employee_id, full_name, role, active}]
  const [assignments, setAssignments] = useState([]);
  const [attestations, setAttestations] = useState([]);
  const [signoffs, setSignoffs] = useState([]);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(null); // employee_id being viewed
  const [signMod, setSignMod] = useState(null);   // {employee_id, ...}

  async function load() {
    setErr("");
    try {
      const [ident, prov, asg, att, so] = await Promise.all([
        supabase.from("staff_identities").select("employee_id, full_name, role"),
        supabase.from("staff_provisioning").select("employee_id, full_name, role, bound_user_id"),
        supabase.from("staff_assignments").select("*"),
        supabase.from("staff_attestations").select("employee_id, module_code, signed_name, signed_at"),
        supabase.from("staff_signoffs").select("*"),
      ]);
      if (ident.error) throw ident.error;
      // Merge active identities + provisioned (some may not have logged in yet).
      const byId = {};
      (prov.data || []).forEach((p) => { byId[p.employee_id] = { employee_id: p.employee_id, full_name: p.full_name, role: p.role, active: !!p.bound_user_id }; });
      (ident.data || []).forEach((i) => { byId[i.employee_id] = { employee_id: i.employee_id, full_name: i.full_name, role: i.role, active: true }; });
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

        {!selectedEmp ? (
          <>
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
  return <ManagerApp identity={identity} switchSlot={pill("mine", "My training")} />;
}
