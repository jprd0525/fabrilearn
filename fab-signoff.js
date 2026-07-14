// FabriLearn — supervisor sign-offs (Stage 4).
// The practical/hands-on competency record, on the same tamper-evident chain as
// attestations (fab-chain.js). A sign-off is the competency determination that
// gates "Ready to Work" — so it gets the same audit-grade immutability.
//
// Result is pass / needs_review / fail. Only a current (non-superseded) "pass"
// authorizes readiness. Corrections supersede; originals are never edited.

import { appendToChain as chainAppend, buildNext, verifyChain, markSuperseded } from "./fab-chain.js";
export { verifyChain } from "./fab-chain.js";

function makeBase(fields) {
  return {
    id: "sgn-" + Math.random().toString(36).slice(2, 10),
    kind: "signoff",
    employeeId: fields.employeeId,
    moduleCode: fields.moduleCode,
    moduleTitle: fields.moduleTitle || "",
    result: fields.result || "needs_review",       // "pass" | "needs_review" | "fail"
    checklist: fields.checklist || [],               // [{ item, checked }]
    notes: fields.notes || "",
    supervisor: fields.supervisor || "",             // typed supervisor name
    signedBy: fields.signedBy || "",                 // app user recording it
    device: fields.device || "",
    timestamp: fields.timestamp || new Date().toISOString(),
    supersedesId: fields.supersedesId || null,
    reason: fields.reason || null,
  };
}

export async function appendSignoff(chain, fields) {
  return chainAppend(chain, makeBase(fields));
}

export async function buildSignoff(prev, fields) {   // for tests
  return buildNext(prev, makeBase(fields));
}

export const decorateSignoffs = markSuperseded;

export const signoffKey = (employeeId, moduleCode) => `${employeeId}::${moduleCode}`;

// Current (latest, non-superseded) sign-off per employee×module.
export function currentSignoffs(chain) {
  const decorated = markSuperseded(chain);
  const out = {};
  for (const r of decorated) {
    if (r.superseded) continue;
    const k = signoffKey(r.employeeId, r.moduleCode);
    if (!out[k] || r.seq > out[k].seq) out[k] = r;
  }
  return out;
}

// Is this employee signed off (competent) on this module? Current result "pass".
export function isSignedOff(currentMap, employeeId, moduleCode) {
  const r = currentMap[signoffKey(employeeId, moduleCode)];
  return r?.result === "pass";
}
