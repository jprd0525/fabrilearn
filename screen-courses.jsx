// FabriLearn — Courses screen (Stage 3).
// Content configuration, two parts (segmented toggle):
//   • Modules — the 23-module catalogue grouped by training area, with an
//     editable default recurrence per module (the manifest's recommendations
//     are just defaults; set real intervals against your Ontario/CoR framework).
//   • Training profiles — reusable module sets that roles point at. This is the
//     profile-contents editor promised on the Settings screen.

import { useMemo, useState } from "react";
import { useShop } from "./shop-context";
import { Button, Card, Field, TextInput, Select, Modal, EmptyState, Pill, SectionTitle } from "./ui";
import { RECURRENCE, isTimeBased } from "./fab-model";
import { BookOpen, Layers, Pencil, Trash2, Plus, Check, AlertCircle } from "lucide-react";

const RECURRENCE_OPTIONS = Object.entries(RECURRENCE).map(([key, r]) => ({ key, label: r.label }));

export default function CoursesScreen() {
  const [tab, setTab] = useState("modules");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-800">Courses</h1>
        <p className="text-sm text-stone-400">The training catalogue and the profiles your roles draw from.</p>
      </div>

      <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
        <TabBtn on={tab === "modules"} onClick={() => setTab("modules")} icon={BookOpen}>Modules</TabBtn>
        <TabBtn on={tab === "profiles"} onClick={() => setTab("profiles")} icon={Layers}>Training profiles</TabBtn>
      </div>

      {tab === "modules" ? <ModuleCatalogue /> : <ProfilesEditor />}
    </div>
  );
}

function TabBtn({ on, onClick, icon: Icon, children }) {
  return (
    <button onClick={onClick}
      className={"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition " +
        (on ? "bg-amber-600 text-white" : "text-stone-600 hover:bg-stone-100")}>
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

// ── Modules catalogue ────────────────────────────────────────────────────────
function ModuleCatalogue() {
  const { shop, api } = useShop();
  const [savedCode, setSavedCode] = useState(null);

  const byArea = useMemo(() => {
    const m = {};
    for (const mod of shop.modules) (m[mod.area] ||= []).push(mod);
    return m;
  }, [shop.modules]);

  const onRecurrence = async (code, recurrence) => {
    await api.updateModule(code, { recurrence });
    setSavedCode(code);
    setTimeout(() => setSavedCode((c) => (c === code ? null : c)), 1500);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-400">
        {shop.modules.length} modules across {shop.areas.length} areas. The recurrence here is each module's
        <em> default</em> — changing it affects future assignments only; existing assignments keep their own interval.
      </p>

      {shop.areas.map((area) => {
        const mods = byArea[area.id] || [];
        if (!mods.length) return null;
        return (
          <Card key={area.id} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-stone-100 bg-stone-50/60 px-4 py-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-amber-600 text-xs font-semibold text-white">{area.id}</span>
              <span className="text-sm font-medium text-stone-700">{area.name}</span>
              <span className="text-xs text-stone-400">· {mods.length} modules</span>
            </div>
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-stone-100">
                {mods.map((m) => (
                  <tr key={m.code}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-stone-400">{m.code}</span>
                      <span className="ml-2 text-stone-700">{m.title}</span>
                    </td>
                    <td className="w-56 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Select className="!py-1 text-xs" value={m.recurrence} onChange={(e) => onRecurrence(m.code, e.target.value)}>
                          {RECURRENCE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </Select>
                        {savedCode === m.code
                          ? <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                          : !isTimeBased(m.recurrence)
                            ? <span title="Trigger-based: no automatic clock"><AlertCircle className="h-4 w-4 shrink-0 text-stone-300" /></span>
                            : <span className="w-4 shrink-0" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
      <p className="text-xs text-stone-400">
        <AlertCircle className="mr-1 inline h-3.5 w-3.5 text-stone-300" />
        Trigger-based intervals (on change / before operating / on assignment) have no automatic clock — those modules go due only when flagged.
      </p>
    </div>
  );
}

// ── Training profiles editor ─────────────────────────────────────────────────
function ProfilesEditor() {
  const { shop, api, roleById } = useShop();
  const [editing, setEditing] = useState(null); // profile object or {new:true}

  // Which roles use each profile (for delete-guarding + display).
  const rolesByProfile = useMemo(() => {
    const m = {};
    for (const r of shop.roles) (m[r.profileId] ||= []).push(r.name);
    return m;
  }, [shop.roles]);

  const remove = async (id) => {
    await api.saveProfiles(shop.profiles.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-400">Reusable module sets. Roles point at a profile; assigning a role proposes that profile's modules.</p>
        <Button size="sm" onClick={() => setEditing({ new: true })}><Plus className="h-3.5 w-3.5" /> New profile</Button>
      </div>

      {shop.profiles.length === 0 ? (
        <EmptyState icon={Layers} title="No profiles yet"
          action={<Button size="sm" onClick={() => setEditing({ new: true })}>Create a profile</Button>}>
          Create a training profile, then link roles to it in Settings.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shop.profiles.map((p) => {
            const usedBy = rolesByProfile[p.id] || [];
            return (
              <Card key={p.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-700">{p.name}</div>
                    <div className="text-xs text-stone-400">{p.blurb}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => setEditing(p)} className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => remove(p.id)} disabled={usedBy.length > 0}
                      className="rounded-md p-1.5 text-stone-300 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                      title={usedBy.length ? `In use by ${usedBy.join(", ")}` : "Delete"}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.moduleCodes.map((c) => <span key={c} className="rounded bg-stone-50 px-1.5 py-0.5 font-mono text-[0.68rem] text-stone-400 ring-1 ring-stone-200">{c}</span>)}
                </div>
                <div className="mt-2 text-[0.68rem] text-stone-400">
                  {p.moduleCodes.length} module{p.moduleCodes.length === 1 ? "" : "s"}
                  {usedBy.length > 0 && <> · used by {usedBy.join(", ")}</>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && <ProfileModal profile={editing.new ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProfileModal({ profile, onClose }) {
  const { shop, api } = useShop();
  const editing = !!profile;
  const [name, setName] = useState(profile?.name || "");
  const [blurb, setBlurb] = useState(profile?.blurb || "");
  const [codes, setCodes] = useState(() => new Set(profile?.moduleCodes || []));
  const [busy, setBusy] = useState(false);

  const byArea = useMemo(() => {
    const m = {};
    for (const mod of shop.modules) (m[mod.area] ||= []).push(mod);
    return m;
  }, [shop.modules]);

  const toggle = (code) => setCodes((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const orderedCodes = shop.modules.filter((m) => codes.has(m.code)).map((m) => m.code);
      let profiles;
      if (editing) {
        profiles = shop.profiles.map((p) => (p.id === profile.id ? { ...p, name: name.trim(), blurb: blurb.trim(), moduleCodes: orderedCodes } : p));
      } else {
        const id = "prof-" + Math.random().toString(36).slice(2, 8);
        profiles = [...shop.profiles, { id, name: name.trim(), blurb: blurb.trim(), moduleCodes: orderedCodes }];
      }
      await api.saveProfiles(profiles);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={editing ? "Edit profile" : "New training profile"}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={!name.trim() || busy}>{busy ? "Saving…" : editing ? "Save profile" : "Create profile"}</Button>
      </>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Profile name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Saw Operators" autoFocus /></Field>
          <Field label="Description"><TextInput value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Short summary" /></Field>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-stone-600">Modules ({codes.size} selected)</p>
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-stone-200 p-3">
            {shop.areas.map((area) => {
              const mods = byArea[area.id] || [];
              if (!mods.length) return null;
              return (
                <div key={area.id}>
                  <div className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wide text-stone-400">{area.id} · {area.name}</div>
                  <div className="space-y-0.5">
                    {mods.map((m) => (
                      <label key={m.code} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-stone-50">
                        <input type="checkbox" checked={codes.has(m.code)} onChange={() => toggle(m.code)} />
                        <span className="font-mono text-xs text-stone-400">{m.code}</span>
                        <span className="truncate text-stone-700">{m.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
