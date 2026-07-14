// FabriLearn — Training Records (Stage 3).
// The audit-ready, per-employee training history. Master/detail: pick a person,
// see their complete record (every module, dates, score, status, next due), and
// export it — CSV (spec §19) or a clean print/PDF view. Proposed (unconfirmed)
// assignments are excluded; a record reflects confirmed training only.

import { useMemo, useState } from "react";
import { useShop } from "./shop-context";
import { Card, Button, Pill, StatusPill, EmptyState } from "./ui";
import { toCSV } from "./fab-model";
import { FolderArchive, Download, Printer, ChevronRight, Users } from "lucide-react";

export default function RecordsScreen() {
  const { shop, assignmentsByEmployee, readinessFor, roleById } = useShop();
  const [selectedId, setSelectedId] = useState(shop.employees[0]?.id || null);

  const areaName = useMemo(() => Object.fromEntries(shop.areas.map((a) => [a.id, a.name])), [shop.areas]);
  const employee = shop.employees.find((e) => e.id === selectedId) || null;

  if (shop.employees.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-stone-800">Training Records</h1>
        <EmptyState icon={FolderArchive} title="No records yet">
          Once you've added employees and assigned training, each person's audit-ready record appears here — ready to export or print.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-800">Training Records</h1>
        <p className="text-sm text-stone-400">Each employee's complete, audit-ready training history.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
        {/* Employee list */}
        <Card className="h-fit overflow-hidden">
          <div className="border-b border-stone-100 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-wide text-stone-400">
            Employees
          </div>
          <div className="max-h-[32rem] divide-y divide-stone-100 overflow-y-auto">
            {shop.employees.map((e) => {
              const on = e.id === selectedId;
              const r = readinessFor(e.id);
              return (
                <button key={e.id} onClick={() => setSelectedId(e.id)}
                  className={"flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-stone-50 " + (on ? "bg-amber-50" : "")}>
                  <span className="min-w-0 flex-1">
                    <span className={"block truncate " + (on ? "font-medium text-amber-800" : "text-stone-700")}>{e.name}</span>
                    <span className="block truncate text-xs text-stone-400">{e.roleId ? roleById[e.roleId]?.name : "no role"}</span>
                  </span>
                  <span className={"h-2 w-2 shrink-0 rounded-full " + toneDot(r.tone)} title={r.label} />
                </button>
              );
            })}
          </div>
        </Card>

        {/* Record detail */}
        {employee
          ? <RecordDetail employee={employee} assignments={(assignmentsByEmployee[employee.id] || []).filter((a) => !a.proposed)}
              readiness={readinessFor(employee.id)} role={employee.roleId ? roleById[employee.roleId] : null} areaName={areaName} shopName={shop.settings.shopName} />
          : <Card className="p-8 text-center text-sm text-stone-400">Select an employee to view their record.</Card>}
      </div>
    </div>
  );
}

function RecordDetail({ employee, assignments, readiness, role, areaName, shopName }) {
  const done = assignments.filter((a) => a.completedOn).length;

  const columns = ["Module", "Title", "Area", "Assigned", "Status", "Completed", "Score", "Recurrence", "Next due"];
  const rowsForExport = assignments.map((a) => [
    a.moduleCode, a.module?.title || "", areaName[a.module?.area] || a.module?.area || "",
    a.assignedOn || "", a.status, a.completedOn || "", a.score != null ? a.score + "%" : "",
    a.recurrenceLabel, a.nextDue || "",
  ]);

  const exportCSV = () => {
    const meta = [
      ["FabriLearn — Employee Training Record"],
      ["Shop", shopName],
      ["Employee", employee.name],
      ["Role", role?.name || "—"],
      ["Employment", `${employee.employmentType}${employee.tenure === "Temporary" ? " · Temporary" : " · Permanent"}`],
      ["Start date", employee.startDate || ""],
      ["Generated", new Date().toISOString().slice(0, 10)],
      [""],
    ];
    const metaCsv = meta.map((r) => r.map((v) => /[",\n\r]/.test(String(v)) ? '"' + v.replace(/"/g, '""') + '"' : v).join(",")).join("\r\n");
    const tableCsv = toCSV(columns, rowsForExport);
    downloadText(`TrainingRecord_${slug(employee.name)}_${new Date().toISOString().slice(0, 10)}.csv`,
      metaCsv + "\r\n" + tableCsv, "text/csv");
  };

  const print = () => printRecord({ employee, role, readiness, assignments, areaName, shopName, done });

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-stone-800">{employee.name}</h2>
            <Pill tone={readiness.tone}>{readiness.label}</Pill>
          </div>
          <p className="mt-0.5 text-sm text-stone-400">
            {role?.name || "No role"} · {employee.employmentType}
            {employee.tenure === "Temporary" ? " · Temporary" : " · Permanent"} · started {employee.startDate || "—"}
          </p>
          <p className="mt-0.5 text-xs text-stone-400">
            {assignments.length} module{assignments.length === 1 ? "" : "s"} · {done} complete
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="secondary" onClick={print} disabled={!assignments.length}><Printer className="h-3.5 w-3.5" /> Print</Button>
          <Button size="sm" onClick={exportCSV} disabled={!assignments.length}><Download className="h-3.5 w-3.5" /> Export CSV</Button>
        </div>
      </div>

      {/* Record table */}
      {assignments.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-stone-400">
          No confirmed training on record yet. Assign or approve training in Training Assignments.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-100 text-[0.68rem] uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Module</th>
                <th className="px-4 py-2.5 font-medium">Area</th>
                <th className="px-4 py-2.5 font-medium">Assigned</th>
                <th className="px-4 py-2.5 font-medium">Completed</th>
                <th className="px-4 py-2.5 font-medium">Score</th>
                <th className="px-4 py-2.5 font-medium">Next due</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2.5 text-stone-700">
                    <span className="font-mono text-xs text-stone-400">{a.moduleCode}</span> {a.module?.title}
                  </td>
                  <td className="px-4 py-2.5 text-stone-500">{a.module?.area}</td>
                  <td className="px-4 py-2.5 text-stone-500">{a.assignedOn || "—"}</td>
                  <td className="px-4 py-2.5 text-stone-500">{a.completedOn || "—"}</td>
                  <td className="px-4 py-2.5 text-stone-500">{a.score != null ? `${a.score}%` : "—"}</td>
                  <td className="px-4 py-2.5 text-stone-500">{a.nextDue || "—"}</td>
                  <td className="px-4 py-2.5"><StatusPill status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
function toneDot(tone) {
  return { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", sky: "bg-sky-500", stone: "bg-stone-300" }[tone] || "bg-stone-300";
}
function slug(s) { return String(s).trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, ""); }

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Open a clean, self-contained print window (user can Save as PDF from it).
function printRecord({ employee, role, readiness, assignments, areaName, shopName, done }) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const rows = assignments.map((a) => `
    <tr>
      <td><b>${esc(a.moduleCode)}</b> ${esc(a.module?.title || "")}</td>
      <td>${esc(areaName[a.module?.area] || a.module?.area || "")}</td>
      <td>${esc(a.assignedOn || "—")}</td>
      <td>${esc(a.completedOn || "—")}</td>
      <td>${a.score != null ? esc(a.score) + "%" : "—"}</td>
      <td>${esc(a.recurrenceLabel)}</td>
      <td>${esc(a.nextDue || "—")}</td>
      <td>${esc(a.status)}</td>
    </tr>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Training Record — ${esc(employee.name)}</title>
    <style>
      body{font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;margin:32px;}
      h1{font-size:18px;margin:0 0 2px;} .sub{color:#78716c;margin:0 0 16px;}
      .meta{margin:0 0 16px;font-size:12px;color:#57534e;} .meta span{margin-right:16px;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e7e5e4;vertical-align:top;}
      th{text-transform:uppercase;font-size:10px;letter-spacing:.04em;color:#78716c;}
      .foot{margin-top:20px;font-size:11px;color:#a8a29e;}
      @media print{body{margin:0;}}
    </style></head><body>
    <h1>Employee Training Record</h1>
    <p class="sub">${esc(shopName)}</p>
    <div class="meta">
      <span><b>${esc(employee.name)}</b></span>
      <span>Role: ${esc(role?.name || "—")}</span>
      <span>${esc(employee.employmentType)} · ${employee.tenure === "Temporary" ? "Temporary" : "Permanent"}</span>
      <span>Started: ${esc(employee.startDate || "—")}</span>
      <span>Readiness: ${esc(readiness.label)}</span>
      <span>${assignments.length} modules · ${done} complete</span>
    </div>
    <table>
      <thead><tr><th>Module</th><th>Area</th><th>Assigned</th><th>Completed</th><th>Score</th><th>Recurrence</th><th>Next due</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="foot">Generated ${new Date().toLocaleString()} · FabriLearn</p>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html); w.document.close();
}
