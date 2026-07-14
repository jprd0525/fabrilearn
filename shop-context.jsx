// FabriLearn — shop data context.
// Loads the shop once and shares it with every screen, along with mutation
// helpers that persist through the proven seam and update local state in place.
// Screens consume useShop() and never touch the adapter directly.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  loadShop, addEmployee as addEmployeeStore, addProposedAssignments,
  assignPlanToEmployees, completeAssignment, flagRefresher,
  approveProposals, dismissProposals, assignModulesToEmployees,
  proposeFromRole, decorate, indexModules, startAssignment,
  loadAttestations, recordAttestation, loadSignoffs, recordSignoff,
  loadScormRuns, saveScormRun,
} from "./fab-store";
import { currentAttestations, verifyChain, attestKey } from "./fab-attest";
import { currentSignoffs, signoffKey, isSignedOff } from "./fab-signoff";
import { KEYS, employeeReadiness, moduleNeedsSignoff } from "./fab-model";
import { chainApi } from "./supabase-adapter";

const ShopCtx = createContext(null);
export const useShop = () => useContext(ShopCtx);

export function ShopProvider({ children }) {
  const [shop, setShop] = useState(null);
  const [attestations, setAttestations] = useState([]);
  const [signoffs, setSignoffs] = useState([]);
  const [scormRuns, setScormRuns] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useState({ screen: "dashboard", focusEmployeeId: null });

  // Navigate between screens, optionally focusing an employee (e.g. "manage
  // training" from the Employees tab opens Training Assignments on that person).
  const goTo = (screen, opts = {}) => setNav({ screen, focusEmployeeId: opts.focusEmployeeId || null });

  useEffect(() => {
    (async () => {
      try {
        const [s, atts, sgn, runs] = await Promise.all([loadShop(), loadAttestations(), loadSignoffs(), loadScormRuns()]);
        setShop(s);
        setAttestations(atts);
        setSignoffs(sgn);
        setScormRuns(runs);
      }
      catch (e) { setError(e?.message || String(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const modsByCode = useMemo(() => (shop ? indexModules(shop.modules) : {}), [shop]);
  const currentSignoffMap = useMemo(() => currentSignoffs(signoffs), [signoffs]);

  // Assignments decorated with module + computed status, grouped per employee.
  // requiresSignoff/signedOff are computed live here (from the module's area and
  // the current sign-off records) rather than trusting stale stored flags, so a
  // machine module correctly shows Awaiting Sign-off → Ready to Work as sign-offs
  // land. This keeps status computed, never drifting.
  const assignmentsByEmployee = useMemo(() => {
    if (!shop) return {};
    const out = {};
    for (const a of shop.assignments) {
      const module = modsByCode[a.moduleCode];
      const requiresSignoff = moduleNeedsSignoff(module);
      const signedOff = requiresSignoff && isSignedOff(currentSignoffMap, a.employeeId, a.moduleCode);
      const merged = { ...a, requiresSignoff, signedOff };
      (out[a.employeeId] ||= []).push(decorate(merged, modsByCode));
    }
    return out;
  }, [shop, modsByCode, currentSignoffMap]);

  // Lookups the screens need often.
  const roleById = useMemo(() => Object.fromEntries((shop?.roles || []).map((r) => [r.id, r])), [shop]);
  const profileById = useMemo(() => Object.fromEntries((shop?.profiles || []).map((p) => [p.id, p])), [shop]);

  const api = useMemo(() => ({
    // Create an employee, then (if they have a role) generate proposed
    // assignments from that role's profile — unconfirmed, for the approval queue.
    async addEmployee(input) {
      const { list, employee } = await addEmployeeStore(shop.employees, input);
      let assignments = shop.assignments;
      if (employee.roleId) {
        const proposals = proposeFromRole({
          role: roleById[employee.roleId], profiles: shop.profiles,
          modules: shop.modules, employeeId: employee.id, existing: assignments,
        });
        if (proposals.length) {
          const res = await addProposedAssignments(assignments, proposals);
          assignments = res.list;
        }
      }
      setShop((s) => ({ ...s, employees: list, assignments }));
      return employee;
    },

    // Edit an employee. If the role changed, propose the new role's training.
    async updateEmployee(id, patch) {
      const before = shop.employees.find((e) => e.id === id);
      const list = shop.employees.map((e) => (e.id === id ? { ...e, ...patch } : e));
      await chainApi.saveState(KEYS.employees, list);
      let assignments = shop.assignments;
      const roleChanged = patch.roleId && patch.roleId !== before?.roleId;
      if (roleChanged) {
        const proposals = proposeFromRole({
          role: roleById[patch.roleId], profiles: shop.profiles,
          modules: shop.modules, employeeId: id, existing: assignments,
        });
        if (proposals.length) {
          const res = await addProposedAssignments(assignments, proposals);
          assignments = res.list;
        }
      }
      setShop((s) => ({ ...s, employees: list, assignments }));
      return roleChanged;
    },

    // Roles (owner-configurable).
    async saveRoles(roles) {
      await chainApi.saveState(KEYS.roles, roles);
      setShop((s) => ({ ...s, roles }));
    },

    // Module catalogue: edit a module's default recurrence (affects future
    // assignments only — existing assignments keep the recurrence they captured).
    async updateModule(code, patch) {
      const modules = shop.modules.map((m) => (m.code === code ? { ...m, ...patch } : m));
      await chainApi.saveState(KEYS.modules, modules);
      setShop((s) => ({ ...s, modules }));
    },

    // Training profiles: persist the full profiles array (add/edit/remove).
    async saveProfiles(profiles) {
      await chainApi.saveState(KEYS.profiles, profiles);
      setShop((s) => ({ ...s, profiles }));
    },

    // Documents register: persist the full documents array (add/edit/version/remove).
    async saveDocuments(documents) {
      await chainApi.saveState(KEYS.documents, documents);
      setShop((s) => ({ ...s, documents }));
    },

    async assignPlan({ plan, employeeIds }) {
      const { list, addedCount } = await assignPlanToEmployees(shop.assignments, { plan, modules: shop.modules, employeeIds });
      setShop((s) => ({ ...s, assignments: list }));
      return addedCount;
    },

    // Approve proposed (role-driven) assignments -> active.
    async approveProposals(ids, dueOn = null) {
      const next = await approveProposals(shop.assignments, { ids, dueOn });
      setShop((s) => ({ ...s, assignments: next }));
    },
    // Dismiss proposed assignments -> removed.
    async dismissProposals(ids) {
      const next = await dismissProposals(shop.assignments, { ids });
      setShop((s) => ({ ...s, assignments: next }));
    },
    // Direct/bulk assignment of specific modules to employees (active).
    async assignModules({ moduleCodes, employeeIds, dueOn = null }) {
      const { list, addedCount } = await assignModulesToEmployees(shop.assignments, {
        moduleCodes, modules: shop.modules, employeeIds, dueOn,
      });
      setShop((s) => ({ ...s, assignments: list }));
      return addedCount;
    },
    async complete(id, score) {
      const next = await completeAssignment(shop.assignments, { id, score });
      setShop((s) => ({ ...s, assignments: next }));
    },
    async start(id) {
      const next = await startAssignment(shop.assignments, { id });
      setShop((s) => ({ ...s, assignments: next }));
    },
    async flagRefresher(id) {
      const next = await flagRefresher(shop.assignments, { id });
      setShop((s) => ({ ...s, assignments: next }));
    },

    // Record an attestation (new or superseding). Appends to the hash chain.
    async recordAttestation(fields) {
      const { chain } = await recordAttestation(attestations, fields);
      setAttestations(chain);
      return chain;
    },

    // Record a supervisor sign-off (new or superseding). Appends to its chain.
    async recordSignoff(fields) {
      const { chain } = await recordSignoff(signoffs, fields);
      setSignoffs(chain);
      return chain;
    },

    // Persist SCORM CMI state for resume (per employee×module).
    async saveScormRun(employeeId, moduleCode, cmi) {
      const next = await saveScormRun(scormRuns, `${employeeId}::${moduleCode}`, cmi);
      setScormRuns(next);
    },
  }), [shop, roleById, attestations, signoffs, scormRuns]);

  // Current (non-superseded) attestation per employee×subject, for worklists.
  const currentAtts = useMemo(() => currentAttestations(attestations), [attestations]);
  const attestationFor = (employeeId, subjectId, subjectType = "module") =>
    currentAtts[attestKey(employeeId, subjectType, subjectId)] || null;

  // Current sign-off per employee×module.
  const signoffFor = (employeeId, moduleCode) =>
    currentSignoffMap[signoffKey(employeeId, moduleCode)] || null;

  // Readiness ignores proposed (unconfirmed) assignments — they aren't part of
  // the person's real training record until a manager approves them.
  const readinessFor = (empId) =>
    employeeReadiness((assignmentsByEmployee[empId] || []).filter((a) => !a.proposed));

  // Saved SCORM CMI for resume (per employee×module).
  const scormRunFor = (employeeId, moduleCode) => scormRuns[`${employeeId}::${moduleCode}`] || null;

  const value = { shop, loading, error, modsByCode, assignmentsByEmployee,
    roleById, profileById, api, readinessFor, nav, goTo,
    attestations, currentAtts, attestationFor,
    signoffs, signoffFor, scormRunFor };

  return <ShopCtx.Provider value={value}>{children}</ShopCtx.Provider>;
}
