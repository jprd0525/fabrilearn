// FabriLearn — attestations (Stage 4).
// Attestation-specific layer over the generic hash chain (fab-chain.js). Keeps the
// public API the store/UI already use; the immutability mechanics live in fab-chain.

import { appendToChain as chainAppend, buildNext, verifyChain, markSuperseded } from "./fab-chain.js";
export { verifyChain, canonical, hashRecord, sha256Hex } from "./fab-chain.js";

// Assemble an attestation's content (no seq/prevHash/hash — the chain adds those).
function makeBase(fields) {
  return {
    id: "att-" + Math.random().toString(36).slice(2, 10),
    kind: "attestation",
    employeeId: fields.employeeId,
    subjectType: fields.subjectType || "module",
    subjectId: fields.subjectId,
    subjectTitle: fields.subjectTitle || "",
    ackText: fields.ackText || "",
    contentVersion: fields.contentVersion || "1.0",
    signature: fields.signature || "",
    signedBy: fields.signedBy || "",
    device: fields.device || "",
    timestamp: fields.timestamp || new Date().toISOString(),
    supersedesId: fields.supersedesId || null,
    reason: fields.reason || null,
  };
}

export async function appendToChain(chain, fields) {
  return chainAppend(chain, makeBase(fields));
}

// Kept for tests: build a chained record from a previous one.
export async function buildAttestation(prev, fields) {
  return buildNext(prev, makeBase(fields));
}

export const decorateChain = markSuperseded;

// The current (latest, non-superseded) attestation per employee×subject.
export function currentAttestations(chain) {
  const decorated = markSuperseded(chain);
  const out = {};
  for (const r of decorated) {
    if (r.superseded) continue;
    const k = attestKey(r.employeeId, r.subjectType, r.subjectId);
    if (!out[k] || r.seq > out[k].seq) out[k] = r;
  }
  return out;
}

export const attestKey = (employeeId, subjectType, subjectId) => `${employeeId}::${subjectType}::${subjectId}`;

export function defaultAckText(subjectTitle) {
  return `I confirm that I have completed and understood "${subjectTitle}", and I am able to apply this training safely in my work.`;
}
