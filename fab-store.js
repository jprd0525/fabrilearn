// FabriLearn — Stage 2 store layer.
//
// Bridges the pure domain model (fab-model.js) to the engine seam
// (chainApi.getState/saveState, Stage-1 verified). The UI never calls the
// adapter directly — it calls loadShop() once, then mutate helpers that persist
// and hand back the updated slice.

import { chainApi } from "./supabase-adapter";
import {
  KEYS, SCHEMA_VERSION,
  SEED_AREAS, SEED_MODULES, SEED_PLANS, SEED_SETTINGS, SEED_PROFILES, SEED_ROLES, SEED_DOCUMENTS,
  RECURRENCE, computeNextDue, computeStatus,
} from "./fab-model";

const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 9);
const today = () => new Date().toISOString().slice(0, 10);

// Load every store in parallel. Missing keys come back null -> we substitute the
// seed and (for catalogue keys) write it back so the shop starts populated.
export async function loadShop() {
  const [meta, areas, modules, plans, profiles, roles, assignments, settings, employees, documents] = await Promise.all([
    chainApi.getState(KEYS.meta),
    chainApi.getState(KEYS.areas),
    chainApi.getState(KEYS.modules),
    chainApi.getState(KEYS.plans),
    chainApi.getState(KEYS.profiles),
    chainApi.getState(KEYS.roles),
    chainApi.getState(KEYS.assignments),
    chainApi.getState(KEYS.settings),
    chainApi.getState(KEYS.employees),
    chainApi.getState(KEYS.documents),
  ]);

  const firstRun = !meta;
  const shop = {
    meta:        meta        || { schemaVersion: SCHEMA_VERSION, seededOn: today() },
    areas:       areas       || SEED_AREAS,
    modules:     modules     || SEED_MODULES,
    plans:       plans       || SEED_PLANS,
    profiles:    profiles    || SEED_PROFILES,
    roles:       roles       || SEED_ROLES,
    assignments: assignments || [],
    employees:   employees   || [],
    settings:    settings    || SEED_SETTINGS,
    documents:   documents   || SEED_DOCUMENTS,
  };

  if (firstRun) {
    // Fresh shop: persist the whole seed catalogue.
    await Promise.all([
      chainApi.saveState(KEYS.meta,     shop.meta),
      chainApi.saveState(KEYS.areas,    shop.areas),
      chainApi.saveState(KEYS.modules,  shop.modules),
      chainApi.saveState(KEYS.plans,    shop.plans),
      chainApi.saveState(KEYS.profiles, shop.profiles),
      chainApi.saveState(KEYS.roles,    shop.roles),
      chainApi.saveState(KEYS.settings, shop.settings),
      chainApi.saveState(KEYS.documents, shop.documents),
    ]);
  } else if ((meta.schemaVersion || 1) < SCHEMA_VERSION) {
    // Existing shop from an earlier schema: seed only the newly-added stores,
    // leave everything the owner already has untouched.
    const writes = [];
    if (!profiles) { shop.profiles = SEED_PROFILES; writes.push(chainApi.saveState(KEYS.profiles, SEED_PROFILES)); }
    if (!roles)    { shop.roles    = SEED_ROLES;    writes.push(chainApi.saveState(KEYS.roles, SEED_ROLES)); }
    if (!documents){ shop.documents= SEED_DOCUMENTS;writes.push(chainApi.saveState(KEYS.documents, SEED_DOCUMENTS)); }

    // v3 -> v4: back-fill contentCourseId onto existing modules from the seed map,
    // without disturbing any owner edits to titles/recurrence.
    if ((meta.schemaVersion || 1) < 4 && modules) {
      const codeToCourse = Object.fromEntries(SEED_MODULES.map((m) => [m.code, m.contentCourseId]));
      const patched = modules.map((m) => (m.contentCourseId === undefined ? { ...m, contentCourseId: codeToCourse[m.code] || null } : m));
      shop.modules = patched;
      writes.push(chainApi.saveState(KEYS.modules, patched));
    }

    shop.meta = { ...meta, schemaVersion: SCHEMA_VERSION, migratedOn: today() };
    writes.push(chainApi.saveState(KEYS.meta, shop.meta));
    await Promise.all(writes);
  }
  return shop;
}

// ── Employees ────────────────────────────────────────────────────────────────
// Full HR record. Only name is required; the rest are optional at creation.
export async function addEmployee(list, input) {
  const rec = {
    id: uid("emp"),
    name: (input.name || "").trim(),
    roleId: input.roleId || null,
    phone: input.phone || "",
    email: input.email || "",
    address: input.address || "",
    startDate: input.startDate || today(),
    employmentType: input.employmentType || "Full-time",
    tenure: input.tenure || "Permanent",
    endDate: input.tenure === "Temporary" ? (input.endDate || null) : null,
    active: true,
  };
  const next = [...list, rec];
  await chainApi.saveState(KEYS.employees, next);
  return { list: next, employee: rec };
}

// Persist a batch of proposed (role-driven) assignments.
export async function addProposedAssignments(assignments, proposals) {
  if (!proposals.length) return { list: assignments, addedCount: 0 };
  const next = [...assignments, ...proposals];
  await chainApi.saveState(KEYS.assignments, next);
  return { list: next, addedCount: proposals.length };
}

// Approve proposed assignments: flip proposed -> active for the given ids.
// dueOn (optional) sets the initial onboarding deadline on approval.
export async function approveProposals(assignments, { ids, dueOn = null }) {
  const idSet = new Set(ids);
  const next = assignments.map((a) =>
    idSet.has(a.id) && a.proposed ? { ...a, proposed: false, approvedOn: today(), dueOn: dueOn || a.dueOn } : a
  );
  await chainApi.saveState(KEYS.assignments, next);
  return next;
}

// Dismiss proposed assignments: drop them entirely (they were never active).
export async function dismissProposals(assignments, { ids }) {
  const idSet = new Set(ids);
  const next = assignments.filter((a) => !(idSet.has(a.id) && a.proposed));
  await chainApi.saveState(KEYS.assignments, next);
  return next;
}

// Assign specific modules directly to one or more employees (active, not proposed).
// Skips modules an employee already has (active or proposed). This is the manual
// path and the bulk path — one module set, many employees.
export async function assignModulesToEmployees(assignments, { moduleCodes, modules, employeeIds, dueOn = null }) {
  const added = [];
  for (const employeeId of employeeIds) {
    const have = new Set(assignments.concat(added).filter((a) => a.employeeId === employeeId).map((a) => a.moduleCode));
    for (const code of moduleCodes) {
      if (have.has(code)) continue;
      const module = modules.find((m) => m.code === code);
      if (!module) continue;
      added.push(makeAssignment({ employeeId, module, dueOn }));
    }
  }
  const next = [...assignments, ...added];
  await chainApi.saveState(KEYS.assignments, next);
  return { list: next, addedCount: added.length };
}

// ── Assignments ──────────────────────────────────────────────────────────────
// Build one assignment (employee × module). Recurrence resolves as: explicit
// override -> module default. dueOn is the initial onboarding deadline.
export function makeAssignment({ employeeId, module, recurrenceOverride, dueOn, proposed = false, source = "manual" }) {
  const recurrenceKey = recurrenceOverride || module.recurrence;
  return {
    id: uid("asg"),
    employeeId,
    moduleCode: module.code,
    assignedOn: today(),
    dueOn: dueOn || null,
    recurrenceKey,               // may differ from module default (override)
    recurrenceDefault: module.recurrence,
    proposed,                    // true = awaiting manager approval (role-driven); not yet in the status model
    source,                      // "manual" | "role:<roleId>" — provenance for the approval queue
    startedOn: null,
    completedOn: null,
    score: null,
    nextDue: null,               // set on completion for time-based kinds
    requiresSignoff: false,      // set true in Stage 4 for machine sign-offs
    signedOff: false,
    manualRefresher: false,      // trigger-based "flag it due" switch
  };
}

// Generate PROPOSED assignments for an employee from a role's training profile.
// These land unconfirmed; the manager approves them in Training Assignments.
// Skips modules the employee already has (active or proposed) to avoid dupes.
export function proposeFromRole({ role, profiles, modules, employeeId, existing }) {
  if (!role) return [];
  const profile = profiles.find((p) => p.id === role.profileId);
  if (!profile) return [];
  const have = new Set(existing.filter((a) => a.employeeId === employeeId).map((a) => a.moduleCode));
  return profile.moduleCodes
    .filter((code) => !have.has(code))
    .map((code) => modules.find((m) => m.code === code))
    .filter(Boolean)
    .map((module) => makeAssignment({ employeeId, module, proposed: true, source: "role:" + role.id }));
}

// Assign a whole plan to one employee: expands to per-module assignments,
// skipping modules already assigned to that person.
export function expandPlan({ plan, modules, employeeId, existing }) {
  const have = new Set(existing.filter((a) => a.employeeId === employeeId).map((a) => a.moduleCode));
  return plan.moduleCodes
    .filter((code) => !have.has(code))
    .map((code) => makeAssignment({ employeeId, module: modules.find((m) => m.code === code) }))
    .filter((a) => a.moduleCode); // guard against a stale code
}

// Bulk assignment: one plan -> many employees at once (spec §14).
export async function assignPlanToEmployees(assignments, { plan, modules, employeeIds }) {
  const added = employeeIds.flatMap((employeeId) =>
    expandPlan({ plan, modules, employeeId, existing: assignments })
  );
  const next = [...assignments, ...added];
  await chainApi.saveState(KEYS.assignments, next);
  return { list: next, addedCount: added.length };
}

// Learner opens a module for the first time — marks it in progress.
export async function startAssignment(assignments, { id }) {
  const next = assignments.map((a) => (a.id === id && !a.startedOn && !a.completedOn ? { ...a, startedOn: today() } : a));
  await chainApi.saveState(KEYS.assignments, next);
  return next;
}

// Mark completion (Stage 6 SCORM will call this with a real score). Sets the
// recurrence clock for time-based kinds; trigger-based get no auto next-due.
export async function completeAssignment(assignments, { id, score = null, completedOn }) {
  const done = completedOn || today();
  const next = assignments.map((a) =>
    a.id !== id ? a : {
      ...a,
      startedOn: a.startedOn || done,
      completedOn: done,
      score,
      manualRefresher: false,
      nextDue: computeNextDue({ recurrenceKey: a.recurrenceKey, completedOn: done }),
    }
  );
  await chainApi.saveState(KEYS.assignments, next);
  return next;
}

// Flag a trigger-based module as due again (machine/procedure changed, incident).
export async function flagRefresher(assignments, { id }) {
  const next = assignments.map((a) => (a.id === id ? { ...a, manualRefresher: true } : a));
  await chainApi.saveState(KEYS.assignments, next);
  return next;
}

// ── Read helpers for the UI (status is always computed, never stored) ────────
export function decorate(assignment, modulesByCode) {
  return {
    ...assignment,
    module: modulesByCode[assignment.moduleCode],
    status: assignment.proposed ? "Proposed" : computeStatus(assignment),
    recurrenceLabel: RECURRENCE[assignment.recurrenceKey]?.label || assignment.recurrenceKey,
    overridden: assignment.recurrenceKey !== assignment.recurrenceDefault,
  };
}

export function indexModules(modules) {
  return Object.fromEntries(modules.map((m) => [m.code, m]));
}

// ── Attestations (append-only hash chain) ────────────────────────────────────
import { appendToChain } from "./fab-attest";

export async function loadAttestations() {
  return (await chainApi.getState(KEYS.attestations)) || [];
}

// Record a new attestation (or a superseding correction — same path, with
// supersedesId + reason set). Always appends; never edits an existing record.
export async function recordAttestation(chain, fields) {
  const { chain: next, record } = await appendToChain(chain, fields);
  await chainApi.saveState(KEYS.attestations, next);
  return { chain: next, record };
}

// ── Supervisor sign-offs (append-only hash chain) ────────────────────────────
import { appendSignoff } from "./fab-signoff";

export async function loadSignoffs() {
  return (await chainApi.getState(KEYS.signoffs)) || [];
}

export async function recordSignoff(chain, fields) {
  const { chain: next, record } = await appendSignoff(chain, fields);
  await chainApi.saveState(KEYS.signoffs, next);
  return { chain: next, record };
}

// ── SCORM run state (per employee×module, for resume) ────────────────────────
export async function loadScormRuns() {
  return (await chainApi.getState(KEYS.scormRuns)) || {};
}

export async function saveScormRun(runs, key, cmi) {
  const next = { ...runs, [key]: cmi };
  await chainApi.saveState(KEYS.scormRuns, next);
  return next;
}
