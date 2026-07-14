// FabriLearn — Dashboard (Stage 3).
// The owner's home: "is everyone trained, documented, and ready to work?" answered
// in seconds (spec §19). Every tile is derived live from assignments via the pure
// summarizeShop aggregator. Attestations/sign-offs tiles arrive in Stage 4.

import { useMemo } from "react";
import { useShop } from "./shop-context";
import { Card, Pill, StatusPill, EmptyState, SectionTitle, Button } from "./ui";
import { summarizeShop, daysUntil } from "./fab-model";
import {
  LayoutDashboard, AlertTriangle, CalendarClock, CheckCircle2, Users,
  FileSignature, ChevronRight, TrendingUp,
} from "lucide-react";

export default function DashboardScreen() {
  const { shop, assignmentsByEmployee, goTo } = useShop();

  const s = useMemo(
    () => summarizeShop({ employees: shop.employees, assignmentsByEmployee }),
    [shop.employees, assignmentsByEmployee]
  );

  if (shop.employees.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-stone-800">Dashboard</h1>
        <EmptyState icon={LayoutDashboard} title="Nothing to show yet"
          action={<Button onClick={() => goTo("employees")}><Users className="h-4 w-4" /> Add employees</Button>}>
          Add your team and assign training — this dashboard then answers, at a glance, who's ready to work and who needs attention.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-stone-800">Dashboard</h1>
        <p className="text-sm text-stone-400">{shop.settings.shopName} · training readiness at a glance</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Employees" value={s.counts.employees} tone="stone" icon={Users} onClick={() => goTo("employees")} />
        <Kpi label="Ready to work" value={s.counts.readyToWork} tone="emerald" icon={CheckCircle2} />
        <Kpi label="Need attention" value={s.counts.needsAttention} tone={s.counts.needsAttention ? "rose" : "stone"} icon={AlertTriangle} />
        <Kpi label="Proposed" value={s.counts.proposed} tone={s.counts.proposed ? "amber" : "stone"} icon={FileSignature}
          onClick={() => goTo("assignments")} hint="awaiting approval" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Requiring attention — the actionable column */}
        <div>
          <SectionTitle right={s.attention.length > 0 ? <Pill tone="rose">{s.attention.length}</Pill> : null}>
            <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Requiring attention</span>
          </SectionTitle>
          {s.attention.length === 0 ? (
            <Card className="p-6 text-center text-sm text-stone-400">
              <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
              Everyone's on track — no overdue training, refreshers, or pending sign-offs.
            </Card>
          ) : (
            <Card className="divide-y divide-stone-100">
              {s.attention.map(({ employee, readiness, items }) => (
                <button key={employee.id} onClick={() => goTo("assignments", { focusEmployeeId: employee.id })}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-stone-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-stone-700">{employee.name}</span>
                      <Pill tone={readiness.tone}>{readiness.label}</Pill>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {items.slice(0, 4).map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 text-xs text-stone-500">
                          <span className="font-mono text-stone-400">{a.moduleCode}</span>
                          <StatusPill status={a._status} />
                        </span>
                      ))}
                      {items.length > 4 && <span className="text-xs text-stone-400">+{items.length - 4} more</span>}
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-stone-300" />
                </button>
              ))}
            </Card>
          )}
        </div>

        {/* Upcoming refreshers */}
        <div>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Upcoming refreshers · next 60 days</span>
          </SectionTitle>
          {s.upcomingRefreshers.length === 0 ? (
            <Card className="p-6 text-center text-sm text-stone-400">No refreshers coming due in the next 60 days.</Card>
          ) : (
            <Card className="divide-y divide-stone-100">
              {s.upcomingRefreshers.slice(0, 8).map(({ employee, assignment, dueInDays }) => (
                <div key={assignment.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-stone-700">
                      <span className="font-medium">{employee.name}</span>
                      <span className="text-stone-400"> · </span>
                      <span className="font-mono text-xs text-stone-400">{assignment.moduleCode}</span> {assignment.module?.title}
                    </div>
                    <div className="text-xs text-stone-400">due {assignment.nextDue}</div>
                  </div>
                  <Pill tone={dueInDays <= 14 ? "amber" : "stone"}>
                    {dueInDays === 0 ? "today" : `in ${dueInDays}d`}
                  </Pill>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Recent completions */}
        <div>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Recent completions</span>
          </SectionTitle>
          {s.recentCompletions.length === 0 ? (
            <Card className="p-6 text-center text-sm text-stone-400">No completed modules yet.</Card>
          ) : (
            <Card className="divide-y divide-stone-100">
              {s.recentCompletions.slice(0, 8).map(({ employee, assignment }) => (
                <div key={assignment.id} className="flex items-center gap-3 px-4 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-stone-700">
                      <span className="font-medium">{employee.name}</span>
                      <span className="text-stone-400"> · </span>
                      <span className="font-mono text-xs text-stone-400">{assignment.moduleCode}</span> {assignment.module?.title}
                    </div>
                    <div className="text-xs text-stone-400">
                      completed {assignment.completedOn}{assignment.score != null ? ` · scored ${assignment.score}%` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Attestations & sign-offs — real in Stage 4 */}
        <div>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5"><FileSignature className="h-3.5 w-3.5" /> Attestations &amp; sign-offs</span>
          </SectionTitle>
          <Card className="flex flex-col items-center justify-center p-6 text-center">
            <FileSignature className="mb-2 h-6 w-6 text-stone-300" />
            <p className="text-sm font-medium text-stone-500">Coming in Stage 4</p>
            <p className="mt-1 max-w-xs text-xs text-stone-400">
              Missing attestations and pending supervisor sign-offs will surface here once those screens are built.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon: Icon, onClick, hint }) {
  const tones = {
    stone: "text-stone-700", emerald: "text-emerald-600", rose: "text-rose-600", amber: "text-amber-600",
  };
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick}
      className={"rounded-xl border border-stone-200 bg-white p-4 text-left " + (onClick ? "hover:border-stone-300" : "")}>
      <div className="flex items-center justify-between">
        <span className="text-[0.68rem] uppercase tracking-wide text-stone-400">{label}</span>
        <Icon className={"h-4 w-4 " + tones[tone]} />
      </div>
      <div className={"mt-1 text-2xl font-semibold " + tones[tone]}>{value}</div>
      {hint && <div className="text-[0.68rem] text-stone-400">{hint}</div>}
    </Comp>
  );
}
