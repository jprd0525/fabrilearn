// FabriLearn — app shell (Stage 3).
// The lean fabrication frontend: sidebar of the ten screens on the reused engine.
// This session, Employees is built end-to-end; the other nine are honest
// placeholders naming the stage that fills them in. No forensic terms or routes.

import { ShopProvider, useShop } from "./shop-context";
import { chainSignOut } from "./auth-gate";
import { ME } from "./supabase-adapter";
import EmployeesScreen from "./screen-employees";
import AssignmentsScreen from "./screen-assignments";
import CoursesScreen from "./screen-courses";
import DashboardScreen from "./screen-dashboard";
import RecordsScreen from "./screen-records";
import AttestationsScreen from "./screen-attestations";
import SignoffsScreen from "./screen-signoffs";
import DocumentsScreen from "./screen-documents";
import ReportsScreen from "./screen-reports";
import LearnerPreview from "./screen-learner";
import SupervisorPreview from "./screen-supervisor-preview";
import SettingsScreen from "./screen-settings";
import { EmptyState } from "./ui";
import {
  HardHat, LayoutDashboard, Users, ClipboardList, BookOpen, FileSignature,
  CheckSquare, FolderArchive, BarChart3, FileText, Settings, LogOut, Loader2, Hammer, Sparkles,
} from "lucide-react";

const NAV = [
  { id: "dashboard",   label: "Dashboard",            icon: LayoutDashboard, stage: 3, live: true },
  { id: "employees",   label: "Employees",            icon: Users,           stage: 3, live: true },
  { id: "assignments", label: "Training Assignments", icon: ClipboardList,   stage: 3, live: true },
  { id: "courses",     label: "Courses",              icon: BookOpen,        stage: 3, live: true },
  { id: "attestations",label: "Attestations",         icon: FileSignature,   stage: 4, live: true },
  { id: "signoffs",    label: "Supervisor Sign-offs", icon: CheckSquare,     stage: 4, live: true },
  { id: "records",     label: "Training Records",     icon: FolderArchive,   stage: 3, live: true },
  { id: "reports",     label: "Reports",              icon: BarChart3,       stage: 5, live: true },
  { id: "documents",   label: "Documents",            icon: FileText,        stage: 5, live: true },
  { id: "settings",    label: "Settings",             icon: Settings,        stage: 3, live: true },
];

export default function AppShell() {
  return (
    <ShopProvider>
      <Shell />
    </ShopProvider>
  );
}

function Shell() {
  const { shop, loading, error, nav, goTo } = useShop();
  const active = nav.screen;

  // Learner preview takes over the full viewport (distinct staff-facing view).
  if (active === "learner" && !loading && !error) return <LearnerPreview />;
  if (active === "supervisor" && !loading && !error) return <SupervisorPreview />;

  return (
    <div className="flex min-h-screen bg-stone-100 text-stone-800">
      <aside className="flex w-56 flex-col border-r border-stone-200 bg-white">
        <div className="flex items-center gap-2.5 border-b border-stone-100 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-white">
            <HardHat style={{ height: 18, width: 18 }} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight">FabriLearn</h1>
            <p className="truncate text-[0.68rem] leading-tight text-stone-400">
              {shop?.settings?.shopName || "Fabrication shop"}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = active === item.id;
            return (
              <button key={item.id} onClick={() => goTo(item.id)}
                className={"flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition " +
                  (on ? "bg-amber-50 font-medium text-amber-800" : "text-stone-600 hover:bg-stone-100")}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Built" />}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-stone-100 p-2">
          <button onClick={() => goTo("learner")}
            className="mb-1 flex w-full items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100">
            <Sparkles className="h-4 w-4" /> Preview staff view
          </button>
          <button onClick={() => goTo("supervisor")}
            className="mb-1 flex w-full items-center gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100">
            <Sparkles className="h-4 w-4" /> Preview supervisor view
          </button>
          <div className="px-3 py-1.5 text-xs text-stone-400">Signed in as {ME}</div>
          <button onClick={chainSignOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">
          {loading ? (
            <div className="flex items-center gap-2 py-20 text-sm text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading shop…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
          ) : (
            <Screen id={active} />
          )}
        </div>
      </main>
    </div>
  );
}

function Screen({ id }) {
  if (id === "dashboard") return <DashboardScreen />;
  if (id === "employees") return <EmployeesScreen />;
  if (id === "assignments") return <AssignmentsScreen />;
  if (id === "courses") return <CoursesScreen />;
  if (id === "records") return <RecordsScreen />;
  if (id === "attestations") return <AttestationsScreen />;
  if (id === "signoffs") return <SignoffsScreen />;
  if (id === "documents") return <DocumentsScreen />;
  if (id === "reports") return <ReportsScreen />;
  if (id === "settings") return <SettingsScreen />;
  const item = NAV.find((n) => n.id === id);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-stone-800">{item.label}</h1>
      <EmptyState icon={Hammer} title={item.label + " — coming in Stage " + item.stage}>
        This screen isn't built yet. We're building the ten screens one at a time on the proven engine;
        Employees is complete and demonstrates the patterns the rest will follow.
      </EmptyState>
    </div>
  );
}
