// FabriLearn — SCORM 1.2 runtime (Stage 6).
//
// Implements the LMS side of SCORM 1.2: the `window.API` object that a SCORM module
// (running in an iframe) calls to initialize, read/write the CMI data model, commit,
// and finish. This is the runtime real packages use — the only thing that changes for
// real content vs. the bundled test module is where the iframe's HTML comes from.
//
// Mastery is 80% (the manifest standard). On finish we derive a lesson status and,
// for passed/completed, hand the score back so the assignment completes.

export const MASTERY_SCORE = 80;

// SCORM 1.2 read-only CMI elements — the content may read but not set these.
const READONLY = new Set([
  "cmi.core.student_id", "cmi.core.student_name", "cmi.core.entry",
  "cmi.core.credit", "cmi.core.lesson_mode", "cmi.core.total_time",
]);

const ERRORS = {
  "0": "No error", "101": "General exception", "201": "Invalid argument error",
  "301": "Not initialized", "403": "Element is read only", "404": "Element is write only",
};

const TERMINAL = ["passed", "failed", "completed", "browsed"];

function numScore(cmi) {
  const raw = cmi["cmi.core.score.raw"];
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Resolve the final lesson status at finish time. Respect an explicit terminal
// status the content set; refine a bare "completed" with a score against mastery;
// otherwise derive from score, or fall back to incomplete.
export function deriveStatus(cmi, mastery = MASTERY_SCORE) {
  const s = cmi["cmi.core.lesson_status"];
  const score = numScore(cmi);
  if (TERMINAL.includes(s)) {
    if (s === "completed" && score != null) return score >= mastery ? "passed" : "failed";
    return s;
  }
  if (score != null) return score >= mastery ? "passed" : "failed";
  return s || "incomplete";
}

// Which statuses count as "done" for our assignment model.
export const isPassingStatus = (status) => status === "passed" || status === "completed";

// Only these CMI fields need to persist between sessions (resume support).
export function persistableCmi(cmi) {
  return {
    "cmi.core.lesson_status": cmi["cmi.core.lesson_status"] || "not attempted",
    "cmi.core.lesson_location": cmi["cmi.core.lesson_location"] || "",
    "cmi.core.score.raw": cmi["cmi.core.score.raw"] || "",
    "cmi.suspend_data": cmi["cmi.suspend_data"] || "",
  };
}

// Build a runtime. Returns { api, getCmi }. Mount `api` as window.API before the
// iframe content loads; the module walks up to window.parent.API to find it.
export function createScormRuntime({ studentId, studentName, initialCmi = {}, masteryScore = MASTERY_SCORE, onCommit, onFinish } = {}) {
  const cmi = {
    "cmi.core.student_id": studentId || "",
    "cmi.core.student_name": studentName || "",
    "cmi.core.lesson_status": "not attempted",
    "cmi.core.lesson_location": "",
    "cmi.core.score.raw": "",
    "cmi.core.score.min": "0",
    "cmi.core.score.max": "100",
    "cmi.core.session_time": "00:00:00",
    "cmi.core.entry": initialCmi["cmi.core.lesson_status"] && initialCmi["cmi.core.lesson_status"] !== "not attempted" ? "resume" : "ab-initio",
    "cmi.core.credit": "credit",
    "cmi.core.lesson_mode": "normal",
    "cmi.suspend_data": "",
    ...initialCmi,
  };
  let initialized = false, finished = false, lastError = "0";
  const setErr = (c) => { lastError = String(c); };

  const api = {
    LMSInitialize() {
      if (initialized) { setErr(101); return "false"; }
      initialized = true; finished = false; setErr(0); return "true";
    },
    LMSFinish() {
      if (!initialized) { setErr(301); return "false"; }
      initialized = false; finished = true; setErr(0);
      const status = deriveStatus(cmi, masteryScore);
      cmi["cmi.core.lesson_status"] = status;
      if (onFinish) onFinish({ cmi: { ...cmi }, status, score: numScore(cmi) });
      return "true";
    },
    LMSGetValue(el) {
      if (!initialized) { setErr(301); return ""; }
      setErr(0);
      return cmi[el] != null ? String(cmi[el]) : "";
    },
    LMSSetValue(el, val) {
      if (!initialized) { setErr(301); return "false"; }
      if (READONLY.has(el)) { setErr(403); return "false"; }
      cmi[el] = String(val); setErr(0); return "true";
    },
    LMSCommit() {
      if (!initialized) { setErr(301); return "false"; }
      setErr(0);
      if (onCommit) onCommit({ ...cmi });
      return "true";
    },
    LMSGetLastError() { return lastError; },
    LMSGetErrorString(c) { return ERRORS[String(c)] || ""; },
    LMSGetDiagnostic(c) { return ERRORS[String(c)] || ""; },
  };

  return { api, getCmi: () => ({ ...cmi }) };
}

// ── Bundled test SCO ─────────────────────────────────────────────────────────
// A tiny, self-contained SCORM 1.2 module for proving the runtime end-to-end with
// no Storage and no real packages. It finds the API, initializes, walks a couple of
// "pages", and on finishing the exam sets a score + status and commits/finishes —
// exactly the calls a real package makes. Real content swaps in via iframe src later.
export const TEST_SCO_HTML = `<!doctype html><html><head><meta charset="utf-8">
<style>
  body{font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;margin:0;padding:24px;background:#fafaf9;}
  .card{max-width:520px;margin:0 auto;}
  h2{font-size:16px;margin:0 0 4px;} p{color:#57534e;}
  .page{display:none;} .page.on{display:block;}
  button{font:inherit;font-weight:500;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;}
  .primary{background:#d97706;color:#fff;} .primary:hover{background:#b45309;}
  .ghost{background:#e7e5e4;color:#44403c;}
  .q{margin:12px 0;padding:12px;border:1px solid #e7e5e4;border-radius:8px;background:#fff;}
  label{display:block;padding:4px 0;cursor:pointer;}
  .bar{height:6px;background:#e7e5e4;border-radius:99px;overflow:hidden;margin:12px 0;}
  .bar>div{height:100%;background:#d97706;transition:width .3s;width:0}
  .status{font-size:12px;color:#a8a29e;margin-top:12px;}
</style></head><body><div class="card">
  <div class="bar"><div id="bar"></div></div>
  <div class="page on" id="p0">
    <h2>Welcome</h2><p>This is a demonstration training module, proving the SCORM player works end-to-end. A real module has interactive content, knowledge checks, and a scored exam.</p>
    <button class="primary" onclick="go(1)">Start &rarr;</button>
  </div>
  <div class="page" id="p1">
    <h2>Key point</h2><p>Your progress is saved as you go, and completing the exam at 80% records your training automatically.</p>
    <button class="ghost" onclick="go(0)">&larr; Back</button> <button class="primary" onclick="go(2)">Continue &rarr;</button>
  </div>
  <div class="page" id="p2">
    <h2>Exam</h2>
    <div class="q"><b>1.</b> Completing a module at 80% or more...
      <label><input type="radio" name="q1"> is not recorded</label>
      <label><input type="radio" name="q1" value="1"> records your training automatically</label>
    </div>
    <div class="q"><b>2.</b> Your progress through a module is...
      <label><input type="radio" name="q2" value="1"> saved as you go</label>
      <label><input type="radio" name="q2"> lost when you close it</label>
    </div>
    <button class="primary" onclick="submitExam()">Submit &amp; finish</button>
    <div class="status" id="st"></div>
  </div>
</div>
<script>
  var API=null, w=window;
  try{ while(w){ if(w.API){API=w.API;break;} if(w.parent===w)break; w=w.parent; } }catch(e){}
  function setSt(m){document.getElementById('st').textContent=m;}
  if(API){ API.LMSInitialize(""); var loc=API.LMSGetValue("cmi.core.lesson_location"); if(loc){go(Number(loc));} }
  else { setSt("SCORM API not found."); }
  function go(n){ for(var i=0;i<3;i++){document.getElementById('p'+i).className='page'+(i===n?' on':'');}
    document.getElementById('bar').style.width=((n/2)*100)+'%';
    if(API){API.LMSSetValue("cmi.core.lesson_location",String(n));API.LMSSetValue("cmi.core.lesson_status","incomplete");API.LMSCommit("");}
  }
  function submitExam(){
    var q1=document.querySelector('input[name=q1]:checked');
    var q2=document.querySelector('input[name=q2]:checked');
    var score=0; if(q1&&q1.value==='1')score+=50; if(q2&&q2.value==='1')score+=50;
    if(API){
      API.LMSSetValue("cmi.core.score.raw",String(score));
      API.LMSSetValue("cmi.core.score.min","0");
      API.LMSSetValue("cmi.core.score.max","100");
      API.LMSSetValue("cmi.core.lesson_status", score>=80?"completed":"incomplete");
      API.LMSCommit("");
      if(score>=80){ API.LMSFinish(""); setSt("Passed with "+score+"%. Recording…"); }
      else { setSt("Scored "+score+"% — 80% needed to pass. Try again."); }
    }
  }
</script></body></html>`;
