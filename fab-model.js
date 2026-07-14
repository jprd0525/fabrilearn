// FabriLearn — Stage 2 domain model.
//
// The fabrication data model, built on the proven engine seam. Nothing here
// touches the adapter or the SQL; every store is a JSON doc under a "fab:*" key
// in app_state, read/written through getState/saveState (Stage-1 verified).
//
// This file is pure data + logic — no React, no I/O. It defines: the store keys,
// the record shapes, the recurrence engine, and the seven-status computation.
// The persistence layer (fab-store.js) and the UI (Stage 3) sit on top of it.

// ── Store keys ───────────────────────────────────────────────────────────────
// One app_state row per key, per shop. Namespaced so they can never collide
// with forensic keys even in a shared database.
export const KEYS = {
  employees:     "fab:employees",       // people at the shop
  areas:         "fab:areas",           // training areas A–E (grouping)
  modules:       "fab:modules",         // the catalogue (23 SCOs from the manifest)
  plans:         "fab:plans",           // onboarding plans (named sets of modules)
  profiles:      "fab:profiles",        // training profiles (named module sets, role-linked)
  roles:         "fab:roles",           // configurable job roles, each -> a profile
  assignments:   "fab:assignments",     // employee × module, with due/recurrence/status
  attestations:  "fab:attestations",    // signed acknowledgements (Stage 4; key reserved)
  signoffs:      "fab:signoffs",         // supervisor practical sign-offs (Stage 4; reserved)
  documents:     "fab:documents",       // policies/SOPs (Stage 5; reserved)
  settings:      "fab:settings",        // shop customization
  scormRuns:     "fab:scormruns",        // per employee×module SCORM CMI state (resume)
  meta:          "fab:meta",            // schema version + bookkeeping
};

export const SCHEMA_VERSION = 4;

// ── Recurrence model ─────────────────────────────────────────────────────────
// Hybrid, per your decision:
//   • Time-based kinds carry a clock -> next-due computed from completion + interval.
//   • Trigger-based kinds have NO auto-clock -> they only come due when a human
//     flags them (machine/material/procedure changed, or a relevant incident).
// "months: null" is the signal that a kind is trigger-based, not time-based.
export const RECURRENCE = {
  once:        { label: "On hire (once)",        months: null, trigger: false },
  annual:      { label: "Annual",                months: 12,   trigger: false },
  biennial:    { label: "Every 2 years",         months: 24,   trigger: false },
  triennial:   { label: "Every 3 years",         months: 36,   trigger: false },
  on_change:   { label: "On change",             months: null, trigger: true  },
  on_assign:   { label: "On assignment + change",months: null, trigger: true  },
  before_use:  { label: "Before operating",      months: null, trigger: true  },
};

export const isTimeBased = (key) => !!RECURRENCE[key] && RECURRENCE[key].months != null;

// Add N months to an ISO date, returning an ISO date (yyyy-mm-dd).
export function addMonths(iso, months) {
  if (!iso || months == null) return null;
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Next-due date for an assignment given its completion date.
// Time-based -> completed + interval. Trigger-based -> null (no clock).
export function computeNextDue({ recurrenceKey, completedOn }) {
  if (!completedOn) return null;
  const r = RECURRENCE[recurrenceKey];
  if (!r || r.months == null) return null;   // once / trigger-based: no recurring due date
  return addMonths(completedOn, r.months);
}

// ── The seven-status model ───────────────────────────────────────────────────
// Not Started / In Progress / Complete / Awaiting Sign-off / Ready to Work /
// Overdue / Refresher Due. Status is *computed* from an assignment's facts, never
// stored as a free field — so it can't drift out of sync with the dates.
export const STATUS = {
  NOT_STARTED:    "Not Started",
  IN_PROGRESS:    "In Progress",
  COMPLETE:       "Complete",
  AWAITING:       "Awaiting Sign-off",
  READY:          "Ready to Work",
  OVERDUE:        "Overdue",
  REFRESHER_DUE:  "Refresher Due",
};

// Display metadata for the UI (Tailwind stone/amber family + semantic accents).
export const STATUS_META = {
  [STATUS.NOT_STARTED]:   { tone: "stone",   order: 0 },
  [STATUS.IN_PROGRESS]:   { tone: "sky",     order: 1 },
  [STATUS.COMPLETE]:      { tone: "emerald", order: 2 },
  [STATUS.AWAITING]:      { tone: "amber",   order: 3 },
  [STATUS.READY]:         { tone: "emerald", order: 4 },
  [STATUS.REFRESHER_DUE]: { tone: "amber",   order: 5 },
  [STATUS.OVERDUE]:       { tone: "rose",    order: 6 },
};

// Compute status from an assignment record + today's date.
// Assignment facts used: startedOn, completedOn, nextDue, requiresSignoff,
// signedOff, dueOn (initial onboarding due date), manualRefresher (trigger flag).
export function computeStatus(a, today = new Date().toISOString().slice(0, 10)) {
  if (!a) return STATUS.NOT_STARTED;

  const past = (d) => d && d < today;

  // Finished the learning?
  if (a.completedOn) {
    // Recurrence overdue (time-based clock elapsed) or a human flagged a refresher.
    if (a.manualRefresher || past(a.nextDue)) return STATUS.REFRESHER_DUE;
    // Practical sign-off gate.
    if (a.requiresSignoff && !a.signedOff)     return STATUS.AWAITING;
    // Cleared to work.
    return a.requiresSignoff ? STATUS.READY : STATUS.COMPLETE;
  }

  // Not finished. Overdue if the initial due date has passed.
  if (past(a.dueOn)) return STATUS.OVERDUE;
  if (a.startedOn)   return STATUS.IN_PROGRESS;
  return STATUS.NOT_STARTED;
}

// A shop-wide readiness roll-up for one employee across their assignments.
export function employeeReadiness(assignments) {
  const statuses = assignments.map((a) => computeStatus(a));
  const any = (s) => statuses.includes(s);
  if (any(STATUS.OVERDUE))       return { label: "Attention needed", tone: "rose" };
  if (any(STATUS.REFRESHER_DUE)) return { label: "Refresher due",     tone: "amber" };
  if (any(STATUS.AWAITING))      return { label: "Awaiting sign-off", tone: "amber" };
  if (statuses.length && statuses.every((s) => s === STATUS.READY || s === STATUS.COMPLETE))
    return { label: "Ready to work", tone: "emerald" };
  return { label: "Onboarding", tone: "sky" };
}

// ── Dashboard aggregation (pure) ─────────────────────────────────────────────
export function todayISO() { return new Date().toISOString().slice(0, 10); }

// ── CSV export (pure) ────────────────────────────────────────────────────────
// RFC-4180-ish: quote any field containing a comma, quote, or newline, and
// double embedded quotes. Used by Training Records export (spec §19).
export function toCSV(headers, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

// Signed day delta from today to an ISO date. Negative = past, 0 = today.
export function daysUntil(iso, today = todayISO()) {
  if (!iso) return null;
  return Math.round((new Date(iso + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
}

// Roll the whole shop into the buckets the Dashboard shows. Consumes assignments
// grouped per employee (each carrying computed status via decorate, or raw
// fields — both work). Pure: no I/O, fully testable.
export function summarizeShop({ employees, assignmentsByEmployee, today = todayISO(), refresherWindowDays = 60 }) {
  const empById = Object.fromEntries(employees.map((e) => [e.id, e]));
  const counts = { employees: employees.length, readyToWork: 0, needsAttention: 0, onboarding: 0, proposed: 0 };
  const attention = [];
  const upcomingRefreshers = [];
  const overdue = [];
  const recentCompletions = [];

  for (const e of employees) {
    const all = assignmentsByEmployee[e.id] || [];
    const active = all.filter((a) => !a.proposed);
    const proposed = all.filter((a) => a.proposed);
    counts.proposed += proposed.length;

    const withStatus = active.map((a) => ({ ...a, _status: a.status || computeStatus(a, today) }));
    const readiness = employeeReadiness(active);

    if (readiness.label === "Ready to work") counts.readyToWork++;
    else if (readiness.label === "Onboarding") counts.onboarding++;
    if (readiness.tone === "rose" || readiness.tone === "amber") counts.needsAttention++;

    // Attention: the actionable items behind a non-green readiness.
    const flags = withStatus.filter((a) => [STATUS.OVERDUE, STATUS.REFRESHER_DUE, STATUS.AWAITING].includes(a._status));
    if (flags.length) {
      attention.push({ employee: e, readiness, items: flags });
    }

    for (const a of withStatus) {
      if (a._status === STATUS.OVERDUE) overdue.push({ employee: e, assignment: a });
      if (a.completedOn) recentCompletions.push({ employee: e, assignment: a });
      // Upcoming refresher: a future next-due within the window, not yet due.
      if (a.nextDue) {
        const d = daysUntil(a.nextDue, today);
        if (d != null && d >= 0 && d <= refresherWindowDays) {
          upcomingRefreshers.push({ employee: e, assignment: a, dueInDays: d });
        }
      }
    }
  }

  upcomingRefreshers.sort((x, y) => x.dueInDays - y.dueInDays);
  recentCompletions.sort((x, y) => (y.assignment.completedOn || "").localeCompare(x.assignment.completedOn || ""));

  return { counts, attention, upcomingRefreshers, overdue, recentCompletions, empById };
}

// ── Seed catalogue — the five areas and 23 modules from the manifest ─────────
// Recurrence keys map the manifest's recommended cadence into our model.
// These are DEFAULTS on the module; an assignment can override (your decision).
export const SEED_AREAS = [
  { id: "A", name: "Safety Foundations",      blurb: "Day-one core — everyone takes it." },
  { id: "B", name: "Moving & Storing Slabs",  blurb: "Yard & handling equipment." },
  { id: "C", name: "Digitizing & Planning",   blurb: "Measuring, imaging, layout." },
  { id: "D", name: "Cutting & Fabrication",   blurb: "The machines." },
  { id: "E", name: "Installation",            blurb: "Lifting & loading for install." },
];

// FabriLearn module code -> ConSRT content course_id (library='fabrilearn').
// Read from ConSRT: courses are keyed GF-{code}-{slug}. null = no content course
// authored yet; those modules stay on the placeholder/bundled path until one exists.
// This is the explicit link so we never string-parse course_ids at runtime.
const CONTENT_COURSE = {
  A1:  "GF-A1-orientation",
  A2:  "GF-A2-ppe-hazard",
  A3:  "GF-A3-silica",
  A5A: "GF-A5a-emergency",
  WVP: "GF-WVP",
  B1:  "GF-B1-slabs",
  B2:  "GF-B2-forklift",
  B3:  "GF-B3-manzelli",
  B4:  "GF-B4-loader",
  C1:  "GF-C1-proliner",
  C2:  "GF-C2-slabsmith",
  C3:  "GF-C3-layout",
  D1C: "GF-D1c-genya-optimise",
  D3:  "GF-D3-titan",
  D4:  "GF-D4-postform-saw",
  D5:  "GF-D5-table-saw",
  D6:  "GF-D6-panel-saw",
  D7:  "GF-D7-power-tools",
  E1:  "GF-E1-install-lift",
  // No ConSRT course yet: A4, D1A, D1B, D2 (authored later; stay on placeholder path).
};

const RAW_MODULES = [
  { code: "A1",  area: "A", title: "Welcome to Onofrio's Top Shop",            recurrence: "once" },
  { code: "A2",  area: "A", title: "PPE & Hazard Awareness",                   recurrence: "annual" },
  { code: "A3",  area: "A", title: "Silica & Dust Control",                    recurrence: "annual" },
  { code: "A4",  area: "A", title: "Manual Handling & Ergonomics",             recurrence: "biennial" },
  { code: "A5A", area: "A", title: "Emergency & Incident Response",            recurrence: "annual" },
  { code: "WVP", area: "A", title: "Workplace Violence & Harassment Prevention", recurrence: "annual" },
  { code: "B1",  area: "B", title: "Moving Slabs with the Overhead Crane",     recurrence: "on_change" },
  { code: "B2",  area: "B", title: "Forklift & Hoist Safety",                  recurrence: "triennial" },
  { code: "B3",  area: "B", title: "Operating the Manzelli Vacuum Lift",       recurrence: "on_assign" },
  { code: "B4",  area: "B", title: "Loader Operation",                         recurrence: "on_assign" },
  { code: "C1",  area: "C", title: "Templating On-Location with the Prodim Proliner", recurrence: "on_assign" },
  { code: "C2",  area: "C", title: "Picturing Slabs in Slabsmith",             recurrence: "on_assign" },
  { code: "C3",  area: "C", title: "Setting Up Fabrication: Layout to Saw",    recurrence: "on_assign" },
  { code: "D1A", area: "D", title: "The Breton Genya: Working Safely",         recurrence: "before_use" },
  { code: "D1B", area: "D", title: "Operating the Breton Genya",               recurrence: "before_use" },
  { code: "D1C", area: "D", title: "The Breton Genya: Optimising & Finishing", recurrence: "on_assign" },
  { code: "D2",  area: "D", title: "Cutting with the Fusion Sawjet",           recurrence: "before_use" },
  { code: "D3",  area: "D", title: "Cutting & Coring on the Titan",            recurrence: "before_use" },
  { code: "D4",  area: "D", title: "The Postforming Saw: Cutting Laminate Tops", recurrence: "before_use" },
  { code: "D5",  area: "D", title: "Table Saw Safety",                         recurrence: "annual" },
  { code: "D6",  area: "D", title: "Panel Saw Safety",                         recurrence: "annual" },
  { code: "D7",  area: "D", title: "Small Power Tools",                        recurrence: "annual" },
  { code: "E1",  area: "E", title: "Lifting & Loading Slabs for Install",      recurrence: "on_assign" },
];

export const SEED_MODULES = RAW_MODULES.map((m) => ({ ...m, contentCourseId: CONTENT_COURSE[m.code] || null }));

// The onboarding plan every new hire starts with: all of Area A.
export const SEED_PLANS = [
  {
    id: "plan-core-safety",
    name: "New Hire — Safety Foundations",
    blurb: "The day-one core every new employee completes before shop-floor work.",
    moduleCodes: ["A1", "A2", "A3", "A4", "A5A", "WVP"],
  },
];

// ── Training profiles — named module sets that roles point at ────────────────
// A profile is the reusable unit of "what training this kind of job needs."
// Roles link to a profile, so two roles can share one and renaming a role never
// disturbs its training. The safety-foundations set is the common base.
const SAFETY_CORE = ["A1", "A2", "A3", "A4", "A5A", "WVP"];
export const SEED_PROFILES = [
  { id: "prof-shop-core",   name: "Shop Floor Core",     blurb: "Safety foundations + slab handling for anyone on the floor.",
    moduleCodes: [...SAFETY_CORE, "B1"] },
  { id: "prof-office",      name: "Office / Non-floor",  blurb: "Core safety and workplace conduct for office-based staff.",
    moduleCodes: ["A1", "A5A", "WVP"] },
  { id: "prof-contractor",  name: "Contractor / Visitor", blurb: "Minimum site-safety orientation for short-term contractors.",
    moduleCodes: ["A1", "A5A"] },
  { id: "prof-management",  name: "Management",          blurb: "Full safety awareness plus conduct, for those overseeing the floor.",
    moduleCodes: [...SAFETY_CORE] },
];

// ── Roles — configurable by the owner; each points at one profile ────────────
// Seeded with sensible defaults so the shop works out of the box. `system:false`
// marks these as owner-editable (all of them are, but the flag is future-proofing
// for any role we might want to protect later).
export const SEED_ROLES = [
  { id: "role-shop",       name: "Shop",       profileId: "prof-shop-core"  },
  { id: "role-admin",      name: "Admin",      profileId: "prof-office"     },
  { id: "role-sales",      name: "Sales",      profileId: "prof-office"     },
  { id: "role-support",    name: "Support",    profileId: "prof-office"     },
  { id: "role-management", name: "Management", profileId: "prof-management" },
  { id: "role-contractor", name: "Contractor", profileId: "prof-contractor" },
];

// Employment field vocabularies for the employee record.
export const EMPLOYMENT_TYPES = ["Full-time", "Part-time"];
export const TENURE_TYPES = ["Permanent", "Temporary"];

// ── Supervisor sign-off configuration ────────────────────────────────────────
// Which modules need a hands-on practical sign-off before "Ready to Work".
// Areas B–E are the machine/practical modules (the manifest's "knowledge layer
// is not a substitute for hands-on sign-off"); Area A is knowledge-only.
// A module may override via an explicit needsSignoff flag.
export const SIGNOFF_AREAS = new Set(["B", "C", "D", "E"]);
export function moduleNeedsSignoff(module) {
  if (!module) return false;
  return module.needsSignoff != null ? module.needsSignoff : SIGNOFF_AREAS.has(module.area);
}

export const SIGNOFF_RESULTS = [
  { key: "pass",         label: "Pass — ready to work", tone: "emerald" },
  { key: "needs_review", label: "Needs review",         tone: "amber" },
  { key: "fail",         label: "Fail",                 tone: "rose" },
];

// Default practical-competency checklist (supervisor ticks these at sign-off).
export const DEFAULT_SIGNOFF_CHECKLIST = [
  "Demonstrated safe set-up, start-up and shut-down",
  "Selected and used correct PPE and machine guarding",
  "Operated to the required standard under supervision",
  "Knows the emergency stop and incident response",
];

export const SEED_SETTINGS = {
  shopName: "Onofrio's Top Shop",
  location: "Ajax, Ontario",
  supervisors: [],
  emergencyContacts: [],
  introMessage: "Welcome. Complete your assigned training to get ready to work safely.",
};

// ── Documents (§13) ──────────────────────────────────────────────────────────
// A register of shop documents. Acknowledging one is itself an attestation (same
// tamper-evident chain, subjectType "document"). Binary upload is deferred to
// Stage 6 storage; for now each doc carries a link to the file (Drive/SharePoint).
export const DOCUMENT_CATEGORIES = [
  "Policy", "SOP", "Evacuation Plan", "Emergency Contacts", "PPE Policy", "Silica Plan", "Other",
];

// Starter set matching the spec's examples — links added by the owner. Onboarding-
// required documents appear in every employee's acknowledgement worklist.
export const SEED_DOCUMENTS = [
  { id: "doc-silica",  title: "Silica Exposure Control Plan",          category: "Silica Plan",       version: "1.0", link: "", notes: "O. Reg. 490/09 control program.", onboardingRequired: true },
  { id: "doc-ppe",     title: "PPE Policy",                            category: "PPE Policy",        version: "1.0", link: "", notes: "", onboardingRequired: true },
  { id: "doc-evac",    title: "Emergency Evacuation Plan",             category: "Evacuation Plan",   version: "1.0", link: "", notes: "Muster point and routes.", onboardingRequired: true },
  { id: "doc-contacts",title: "Emergency Contacts",                    category: "Emergency Contacts",version: "1.0", link: "", notes: "", onboardingRequired: true },
  { id: "doc-whs",     title: "Workplace Violence & Harassment Policy",category: "Policy",            version: "1.0", link: "", notes: "OHSA policy review is typically annual.", onboardingRequired: true },
];
