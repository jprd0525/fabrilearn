// FabriLearn — Course Library.
//
// Pull published ConSRT catalog courses into this org's library. The provider
// (allowlisted) curates: browse the catalog, "Add to library" binds a course to
// a FabriLearn module slot (A-mode: sets that module's contentCourseId, so the
// existing assignment/player machinery uses it unchanged). Owners get the same
// browse but a "Request this course" button instead of add.
//
// Link model: the library stores the ConSRT course_id; the player resolves the
// current APPROVED version at play-time, so content revisions flow through.
// Only approved courses are addable (enforced server-side by catalog-list).

import { useEffect, useMemo, useState } from "react";
import { useShop } from "./shop-context";
import { supabase, chainApi } from "./supabase-adapter";
import { Button, Card, Pill, Select, EmptyState, SectionTitle } from "./ui";
import { BookOpen, Plus, Check, Trash2, Inbox, RefreshCw, Layers } from "lucide-react";

// GF-A5a-emergency -> A5A ; GF-WVP -> WVP ; GF-D5-table-saw -> D5 ; MON-A1 -> A1
function moduleCodeFromCourse(courseId) {
  const m = String(courseId || "").match(/^[A-Za-z]+-([A-Za-z0-9]+)(?:-.*)?$/);
  return m ? m[1].toUpperCase() : null;
}

export default function CourseLibraryScreen() {
  const { shop, api } = useShop();
  const modules = shop?.modules || [];

  const [isProvider, setIsProvider] = useState(false);
  const [tenantId, setTenantId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [catalog, setCatalog] = useState(null);   // null = loading
  const [library, setLibrary] = useState([]);      // org_library rows
  const [requests, setRequests] = useState([]);    // course_requests rows
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function loadFrame() {
    const [{ data: prov }, tenant, { data: u }] = await Promise.all([
      supabase.rpc("is_provider"),
      chainApi.currentTenant(),
      supabase.auth.getUser(),
    ]);
    setIsProvider(!!prov);
    setTenantId(tenant || null);
    setUserId(u?.user?.id || null);
    return !!prov;
  }

  async function loadData() {
    setErr("");
    try {
      const body = showAll ? { showAll: true } : { industry: "granite" };
      const [cat, lib, reqs] = await Promise.all([
        supabase.functions.invoke("catalog-list", { body }),
        supabase.from("org_library").select("*"),
        supabase.from("course_requests").select("*").order("created_at", { ascending: false }),
      ]);
      if (cat.error) throw new Error(cat.error.message || "Couldn't reach the catalog.");
      if (cat.data?.error) throw new Error(cat.data.error);
      setCatalog(cat.data?.courses || []);
      setLibrary(lib.data || []);
      setRequests(reqs.data || []);
    } catch (e) {
      setErr(e?.message || "Couldn't load the catalog.");
      setCatalog([]);
    }
  }

  useEffect(() => { loadFrame(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [showAll]);

  const inLibrary = useMemo(() => {
    const map = {};
    for (const r of library) map[r.consrt_course_id] = r;
    return map;
  }, [library]);

  const pendingReqIds = useMemo(() => {
    const s = {};
    for (const r of requests) if (r.status === "pending") s[r.consrt_course_id] = r;
    return s;
  }, [requests]);

  // ── Provider actions ───────────────────────────────────────────────────────
  async function addToLibrary(course, moduleCode) {
    setBusyId(course.consrt_course_id); setErr("");
    try {
      const { error } = await supabase.from("org_library").upsert({
        tenant_id: tenantId, consrt_course_id: course.consrt_course_id,
        module_code: moduleCode || null, title: course.title, industry: course.industry,
        added_by: userId,
      }, { onConflict: "tenant_id,consrt_course_id" });
      if (error) throw error;
      // A-mode: bind the module slot so assignment + player use this course.
      if (moduleCode) await api.updateModule(moduleCode, { contentCourseId: course.consrt_course_id });
      // If this fulfils a pending request, mark it added.
      const req = pendingReqIds[course.consrt_course_id];
      if (req) await supabase.from("course_requests").update({ status: "added" }).eq("id", req.id);
      await loadData();
    } catch (e) { setErr(e?.message || "Couldn't add the course."); }
    setBusyId(null);
  }

  async function removeFromLibrary(course) {
    setBusyId(course.consrt_course_id); setErr("");
    try {
      const row = inLibrary[course.consrt_course_id];
      const { error } = await supabase.from("org_library").delete().eq("consrt_course_id", course.consrt_course_id);
      if (error) throw error;
      // Unbind the module if it pointed at this course.
      const code = row?.module_code || moduleCodeFromCourse(course.consrt_course_id);
      const mod = modules.find((m) => m.code === code);
      if (mod && mod.contentCourseId === course.consrt_course_id) {
        await api.updateModule(code, { contentCourseId: null });
      }
      await loadData();
    } catch (e) { setErr(e?.message || "Couldn't remove the course."); }
    setBusyId(null);
  }

  // ── Owner action ───────────────────────────────────────────────────────────
  async function requestCourse(course) {
    setBusyId(course.consrt_course_id); setErr("");
    try {
      const { error } = await supabase.from("course_requests").insert({
        tenant_id: tenantId, consrt_course_id: course.consrt_course_id,
        title: course.title, requested_by: userId,
      });
      if (error) throw error;
      await loadData();
    } catch (e) { setErr(e?.message || "Couldn't send the request."); }
    setBusyId(null);
  }

  async function declineRequest(req) {
    await supabase.from("course_requests").update({ status: "declined" }).eq("id", req.id);
    await loadData();
  }

  const pendingReqs = requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-800">Course Library</h1>
          <p className="text-sm text-stone-400">
            {isProvider
              ? "Pull published courses from the catalog into this shop's library."
              : "Browse the catalog and request courses for your shop."}
          </p>
        </div>
        <button onClick={loadData} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-500 hover:bg-stone-50">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Industry toggle */}
      <div className="flex gap-1 text-sm">
        <button onClick={() => setShowAll(false)} className={`rounded-lg px-3 py-1.5 font-medium ${!showAll ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-100"}`}>Granite</button>
        <button onClick={() => setShowAll(true)} className={`rounded-lg px-3 py-1.5 font-medium ${showAll ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-100"}`}>All courses</button>
      </div>

      {err ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</p> : null}

      {/* Provider: pending requests inbox */}
      {isProvider && pendingReqs.length > 0 && (
        <Card className="p-4">
          <SectionTitle><span className="inline-flex items-center gap-1.5"><Inbox className="h-4 w-4" /> Requests from owners ({pendingReqs.length})</span></SectionTitle>
          <div className="mt-2 space-y-2">
            {pendingReqs.map((r) => {
              const code = moduleCodeFromCourse(r.consrt_course_id);
              return (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-stone-800">{r.title || r.consrt_course_id}</div>
                    <div className="text-[0.7rem] text-amber-700">{r.consrt_course_id}{code ? ` · module ${code}` : ""}</div>
                  </div>
                  <div className="ml-3 flex shrink-0 gap-1.5">
                    <button onClick={() => addToLibrary({ consrt_course_id: r.consrt_course_id, title: r.title, industry: null }, code)}
                      disabled={busyId === r.consrt_course_id}
                      className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">Add</button>
                    <button onClick={() => declineRequest(r)} className="rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-stone-100">Decline</button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Catalog */}
      {catalog === null ? (
        <div className="py-10 text-center text-sm text-stone-400">Loading catalog…</div>
      ) : catalog.length === 0 ? (
        <EmptyState icon={BookOpen} title="No courses found">
          {showAll ? "The catalog has no published courses yet." : "No published granite courses yet. Try “All courses”."}
        </EmptyState>
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-100 text-[0.68rem] uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Course</th>
                <th className="px-4 py-2.5 font-medium">Module</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {catalog.map((c) => (
                <CatalogRow key={c.consrt_course_id} course={c} modules={modules}
                  inLibraryRow={inLibrary[c.consrt_course_id]} isProvider={isProvider}
                  requested={!!pendingReqIds[c.consrt_course_id]} busy={busyId === c.consrt_course_id}
                  onAdd={addToLibrary} onRemove={removeFromLibrary} onRequest={requestCourse} />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-[0.7rem] text-stone-400">
        Courses are linked, not copied — when a course is revised and re-approved in the catalog, staff get the update automatically.
      </p>
    </div>
  );
}

function CatalogRow({ course, modules, inLibraryRow, isProvider, requested, busy, onAdd, onRemove, onRequest }) {
  const autoCode = moduleCodeFromCourse(course.consrt_course_id);
  const autoExists = modules.some((m) => m.code === autoCode);
  const [pickedCode, setPickedCode] = useState(autoExists ? autoCode : "");
  const isIn = !!inLibraryRow;

  return (
    <tr className="hover:bg-stone-50">
      <td className="px-4 py-3">
        <div className="font-medium text-stone-700">{course.title}</div>
        <div className="font-mono text-[0.7rem] text-stone-400">{course.consrt_course_id} · {course.version}{course.organization ? ` · ${course.organization}` : ""}</div>
      </td>
      <td className="px-4 py-3">
        {isIn ? (
          <span className="text-stone-500">{inLibraryRow.module_code || <span className="text-stone-300">—</span>}</span>
        ) : isProvider ? (
          <Select value={pickedCode} onChange={(e) => setPickedCode(e.target.value)} className="w-28 text-xs">
            <option value="">— pick —</option>
            {modules.map((m) => <option key={m.code} value={m.code}>{m.code}</option>)}
          </Select>
        ) : (
          <span className="text-stone-400">{autoCode || "—"}</span>
        )}
      </td>
      <td className="px-4 py-3">
        {isIn ? <Pill tone="emerald"><span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> In library</span></Pill>
          : requested ? <Pill tone="amber">Requested</Pill>
          : <span className="text-xs text-stone-300">not added</span>}
      </td>
      <td className="px-4 py-3 text-right">
        {isProvider ? (
          isIn ? (
            <button onClick={() => onRemove(course)} disabled={busy}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          ) : (
            <button onClick={() => onAdd(course, pickedCode)} disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> {busy ? "Adding…" : "Add to library"}
            </button>
          )
        ) : (
          isIn ? <span className="text-xs text-emerald-600">Available</span>
            : requested ? <span className="text-xs text-amber-600">Requested</span>
            : <button onClick={() => onRequest(course)} disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">
                {busy ? "Sending…" : "Request this course"}
              </button>
        )}
      </td>
    </tr>
  );
}
