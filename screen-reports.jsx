// FabriLearn — Reports (Stage 5).
// The five shop-wide reports from spec §17, each a table with CSV + print/PDF.
// All are assembled from data already computed elsewhere (assignments with status,
// attestations, sign-offs), so a report is a view + an export — no new logic.

import { useMemo, useState } from "react";
import { useShop } from "./shop-context";
import { Button, Card, Pill, StatusPill, EmptyState } from "./ui";
import { decorateChain } from "./fab-attest";
import { decorateSignoffs } from "./fab-signoff";
import { daysUntil, SIGNOFF_RESULTS, STATUS } from "./fab-model";
import { exportCSV, printTable } from "./fab-export";
import {
  BarChart3, Download, Printer, GraduationCap, ClipboardList,
  FileSignature, CheckSquare, AlertTriangle,
} from "lucide-react";

const RESULT_LABEL = Object.fromEntries(SIGNOFF_RESULTS.map((r) => [r.key, r.label]));

const REPORTS = [
  { id: "training",   name: "Employee Training Record", icon: ClipboardList,  desc: "Every employee's assignments with status, dates and scores." },
  { id: "onboarding", name: "Onboarding Status",        icon: GraduationCap,  desc: "Per-employee onboarding progress and readiness." },
  { id: "attest",     name: "Attestation Report",       icon: FileSignature,  desc: "All signed acknowledgements (modules and documents)." },
  { id: "signoff",    name: "Supervisor Sign-off Report", icon: CheckSquare,  desc: "All practical competency sign-offs." },
  { id: "overdue",    name: "Overdue Training Report",   icon: AlertTriangle, desc: "Overdue training and refreshers now due." },
];

export default function ReportsScreen() {
  const [active, setActive] = useState("training");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-800">Reports</h1>
        <p className="text-sm text-stone-400">Shop-wide, audit-ready. Export to CSV or print to PDF.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit overflow-hidden">
          <div className="border-b border-stone-100 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-wide text-stone-400">Reports</div>
          <div className="divide-y divide-stone-100">
            {REPORTS.map((r) => {
              const Icon = r.icon; const on = r.id === active;
              return (
                <button key={r.id} onClick={() => setActive(r.id)}
                  className={"flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-stone-50 " + (on ? "bg-amber-50" : "")}>
                  <Icon className={"mt-0.5 h-4 w-4 shrink-0 " + (on ? "text-amber-700" : "text-stone-400")} />
                  <span className="min-w-0">
                    <span className={"block text-sm " + (on ? "font-medium text-amber-800" : "text-stone-700")}>{r.name}</span>
                    <span className="block text-xs text-stone-400">{r.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <ReportView reportId={active} />
      </div>
    </div>
  );
}

// Renders the selected report (own component so hooks run cleanly per render).
function ReportView({ reportId }) {
  const data = useReportData(reportId);
  const meta = [["Shop", data.shopName], ["Generated", new Date().toISOString().slice(0, 10)], ["Rows", String(data.rows.length)]];

  const doCSV = () => exportCSV({ filename: `${data.filenameBase}_${new Date().toISOString().slice(0, 10)}.csv`, columns: data.columns, rows: data.rows, meta });
  const doPrint = () => printTable({ title: data.title, subtitle: data.shopName, meta, columns: data.columns, rows: data.rows });

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
        <div>
          <h2 className="text-base font-semibold text-stone-800">{data.title}</h2>
          <p className="text-sm text-stone-400">{data.rows.length} row{data.rows.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={doPrint} disabled={!data.rows.length}><Printer className="h-3.5 w-3.5" /> Print</Button>
          <Button size="sm" onClick={doCSV} disabled={!data.rows.length}><Download className="h-3.5 w-3.5" /> Export CSV</Button>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-stone-400">{data.empty || "No data for this report yet."}</div>
      ) : (
        <div className="max-h-[34rem] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-stone-100 bg-white text-[0.68rem] uppercase tracking-wide text-stone-400">
              <tr>{data.columns.map((c) => <th key={c} className="px-4 py-2.5 font-medium">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.display.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j} className="px-4 py-2.5 text-stone-600">{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// Build the active report's columns + rows (plain strings for CSV/print) and a
// `display` variant that may contain rich cells (status pills) for the on-screen table.
function useReportData(reportId) {
  const { shop, assignmentsByEmployee, attestations, signoffs, readinessFor, roleById } = useShop();
  const shopName = shop.settings.shopName;
  const empById = Object.fromEntries(shop.employees.map((e) => [e.id, e]));
  const roleName = (e) => (e?.roleId ? roleById[e.roleId]?.name || "" : "");

  return useMemo(() => {
    if (reportId === "training") {
      const columns = ["Employee", "Role", "Code", "Module", "Status", "Assigned", "Completed", "Score", "Recurrence", "Next due"];
      const rows = []; const display = [];
      for (const e of shop.employees) {
        for (const a of (assignmentsByEmployee[e.id] || []).filter((x) => !x.proposed)) {
          rows.push([e.name, roleName(e), a.moduleCode, a.module?.title || "", a.status, a.assignedOn || "", a.completedOn || "", a.score != null ? a.score + "%" : "", a.recurrenceLabel, a.nextDue || ""]);
          display.push([e.name, roleName(e), a.moduleCode, a.module?.title || "", <StatusPill status={a.status} />, a.assignedOn || "—", a.completedOn || "—", a.score != null ? a.score + "%" : "—", a.recurrenceLabel, a.nextDue || "—"]);
        }
      }
      return { title: "Employee Training Record", filenameBase: "EmployeeTrainingRecord", shopName, columns, rows, display, empty: "No training assigned yet." };
    }

    if (reportId === "onboarding") {
      const columns = ["Employee", "Role", "Employment", "Modules", "Complete", "Proposed", "Readiness"];
      const rows = []; const display = [];
      for (const e of shop.employees) {
        const list = assignmentsByEmployee[e.id] || [];
        const active = list.filter((a) => !a.proposed);
        const proposed = list.filter((a) => a.proposed).length;
        const done = active.filter((a) => a.completedOn).length;
        const r = readinessFor(e.id);
        const emp = `${e.employmentType}${e.tenure === "Temporary" ? " · Temp" : ""}`;
        rows.push([e.name, roleName(e), emp, String(active.length), String(done), String(proposed), r.label]);
        display.push([e.name, roleName(e), emp, String(active.length), `${done}/${active.length}`, proposed ? String(proposed) : "—", <Pill tone={r.tone}>{r.label}</Pill>]);
      }
      return { title: "Onboarding Status", filenameBase: "OnboardingStatus", shopName, columns, rows, display, empty: "No employees yet." };
    }

    if (reportId === "attest") {
      const columns = ["#", "Employee", "Type", "Subject", "Version", "Signature", "Recorded by", "Date", "State"];
      const dec = decorateChain(attestations);
      const rows = dec.map((r) => [String(r.seq), empById[r.employeeId]?.name || r.employeeId, r.subjectType, r.subjectTitle || r.subjectId, r.contentVersion, r.signature, r.signedBy, r.timestamp.slice(0, 16).replace("T", " "), r.superseded ? "superseded" : "current"]);
      const display = dec.map((r) => [String(r.seq), empById[r.employeeId]?.name || r.employeeId, r.subjectType, r.subjectTitle || r.subjectId, `v${r.contentVersion}`, r.signature, r.signedBy, r.timestamp.slice(0, 16).replace("T", " "), r.superseded ? <Pill tone="stone">superseded</Pill> : <Pill tone="emerald">current</Pill>]);
      return { title: "Attestation Report", filenameBase: "AttestationReport", shopName, columns, rows, display, empty: "No attestations recorded yet." };
    }

    if (reportId === "signoff") {
      const columns = ["#", "Employee", "Module", "Result", "Supervisor", "Recorded by", "Date", "State"];
      const dec = decorateSignoffs(signoffs);
      const rows = dec.map((r) => [String(r.seq), empById[r.employeeId]?.name || r.employeeId, `${r.moduleCode} ${r.moduleTitle}`, RESULT_LABEL[r.result] || r.result, r.supervisor, r.signedBy, r.timestamp.slice(0, 16).replace("T", " "), r.superseded ? "superseded" : "current"]);
      const display = dec.map((r) => [String(r.seq), empById[r.employeeId]?.name || r.employeeId, <span><span className="font-mono text-xs text-stone-400">{r.moduleCode}</span> {r.moduleTitle}</span>, RESULT_LABEL[r.result] || r.result, r.supervisor, r.signedBy, r.timestamp.slice(0, 16).replace("T", " "), r.superseded ? <Pill tone="stone">superseded</Pill> : <Pill tone="emerald">current</Pill>]);
      return { title: "Supervisor Sign-off Report", filenameBase: "SignoffReport", shopName, columns, rows, display, empty: "No sign-offs recorded yet." };
    }

    // overdue
    const columns = ["Employee", "Role", "Code", "Module", "Status", "Due", "Days overdue"];
    const rows = []; const display = [];
    for (const e of shop.employees) {
      for (const a of (assignmentsByEmployee[e.id] || []).filter((x) => !x.proposed)) {
        if (a.status !== STATUS.OVERDUE && a.status !== STATUS.REFRESHER_DUE) continue;
        const dueDate = a.status === STATUS.OVERDUE ? a.dueOn : a.nextDue;
        const d = dueDate ? -daysUntil(dueDate) : "";
        const daysStr = d === "" ? "" : (d > 0 ? `${d}` : "0");
        rows.push([e.name, roleName(e), a.moduleCode, a.module?.title || "", a.status, dueDate || "", daysStr]);
        display.push([e.name, roleName(e), a.moduleCode, a.module?.title || "", <StatusPill status={a.status} />, dueDate || "—", daysStr || "—"]);
      }
    }
    return { title: "Overdue Training Report", filenameBase: "OverdueTraining", shopName, columns, rows, display, empty: "Nothing overdue — everyone's on track." };
  }, [reportId, shop, assignmentsByEmployee, attestations, signoffs]);
}
