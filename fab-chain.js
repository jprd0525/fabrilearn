// FabriLearn — generic hash-chain core (Stage 4).
//
// The shared, record-agnostic immutability engine used by BOTH attestations and
// supervisor sign-offs. An append-only log where each record carries a SHA-256
// fingerprint of its own contents plus the previous record's fingerprint, so the
// records link like a chain: alter or remove any past record and every fingerprint
// after it stops matching — verifyChain() finds the exact break.
//
// Records are never edited once written. Corrections APPEND a new record (with a
// supersedesId back-reference); "superseded" is computed at read time, never
// stored on the original.
//
// Tamper-EVIDENT, not tamper-proof: alterations are detectable, but a party with
// write access and this code could recompute the chain. Defeating that needs a
// server-held secret or external anchoring (deferred for the pilot).

const GENESIS = "GENESIS";

// Deterministic serialization of any JSON-ish value: object keys sorted
// recursively, array order preserved (order can be meaningful, e.g. a checklist).
function stable(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
}

// Canonical string for a record, excluding its own hash (a record can't hash
// itself). Keys are sorted so the result is independent of property order.
export function canonical(rec, exclude = ["hash"]) {
  const keys = Object.keys(rec).filter((k) => !exclude.includes(k)).sort();
  return keys.map((k) => `${k}=${stable(rec[k])}`).join("\u241F");
}

// SHA-256 hex via Web Crypto (browsers and Node 20+ expose globalThis.crypto).
export async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashRecord(rec) {
  return sha256Hex(canonical(rec));
}

// Build the next chained record from the previous (or null for the first).
// `base` is the record's content (including a stable id); this adds seq, prevHash
// and hash, and freezes the result to guard against accidental mutation.
export async function buildNext(prev, base) {
  const rec = { ...base, seq: prev ? prev.seq + 1 : 1, prevHash: prev ? prev.hash : GENESIS };
  const hash = await hashRecord(rec);
  return Object.freeze({ ...rec, hash });
}

export async function appendToChain(chain, base) {
  const prev = chain.length ? chain[chain.length - 1] : null;
  const record = await buildNext(prev, base);
  return { chain: [...chain, record], record };
}

// Verify the whole chain. Returns { ok, count } or { ok:false, brokenAt, reason }.
export async function verifyChain(chain) {
  for (let i = 0; i < chain.length; i++) {
    const rec = chain[i];
    const expectedPrev = i === 0 ? GENESIS : chain[i - 1].hash;
    if (rec.seq !== i + 1) return { ok: false, brokenAt: rec.seq, reason: "sequence out of order (a record was removed or reordered)" };
    if (rec.prevHash !== expectedPrev) return { ok: false, brokenAt: rec.seq, reason: "chain link broken (a record was removed or reordered)" };
    if ((await hashRecord(rec)) !== rec.hash) return { ok: false, brokenAt: rec.seq, reason: "record contents were altered after signing" };
  }
  return { ok: true, count: chain.length };
}

// Read-time: mark records that a later record supersedes (never mutates input).
export function markSuperseded(chain) {
  const supersededIds = new Set(chain.map((r) => r.supersedesId).filter(Boolean));
  return chain.map((r) => ({ ...r, superseded: supersededIds.has(r.id) }));
}
