// FabriLearn — Settings screen (Stage 3, partial).
// This session it hosts the Roles editor — owner-configurable job roles, each
// linked to a training profile. Other settings (shop details, supervisors,
// emergency contacts, media) come later in Stage 3/5; shown here as a preview.

import { useState } from "react";
import { useShop } from "./shop-context";
import { Button, Card, Field, TextInput, Select, EmptyState, Pill, SectionTitle } from "./ui";
import { Settings as Cog, Plus, Trash2, Save, Briefcase } from "lucide-react";

export default function SettingsScreen() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-stone-800">Settings</h1>
        <p className="text-sm text-stone-400">Configure roles and their training requirements.</p>
      </div>
      <RolesEditor />
      <ShopDetailsPreview />
    </div>
  );
}

function RolesEditor() {
  const { shop, profileById, api } = useShop();
  const [rows, setRows] = useState(() => shop.roles.map((r) => ({ ...r })));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(rows) !== JSON.stringify(shop.roles);

  const setRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { id: "role-" + Math.random().toString(36).slice(2, 8), name: "", profileId: shop.profiles[0]?.id || "" }]);
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));

  const save = async () => {
    const clean = rows.filter((r) => r.name.trim()).map((r) => ({ ...r, name: r.name.trim() }));
    setBusy(true);
    try { await api.saveRoles(clean); setRows(clean.map((r) => ({ ...r }))); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5">
      <SectionTitle right={
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-600">Saved</span>}
          <Button size="sm" variant="secondary" onClick={addRow}><Plus className="h-3.5 w-3.5" /> Add role</Button>
          <Button size="sm" onClick={save} disabled={!dirty || busy}><Save className="h-3.5 w-3.5" /> {busy ? "Saving…" : "Save"}</Button>
        </div>
      }>
        <span className="inline-flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> Roles &amp; training profiles</span>
      </SectionTitle>

      <p className="mb-3 text-xs text-stone-400">
        Each role links to a training profile. When an employee is given a role, that profile's modules are proposed for manager approval.
      </p>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-[0.68rem] uppercase tracking-wide text-stone-400">
          <span>Role name</span><span>Training profile</span><span></span>
        </div>
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <TextInput value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} placeholder="Role name" />
            <Select value={r.profileId} onChange={(e) => setRow(r.id, { profileId: e.target.value })}>
              {shop.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <button onClick={() => removeRow(r.id)} className="rounded-md p-2 text-stone-300 hover:bg-rose-50 hover:text-rose-500" aria-label="Remove role">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Profile reference — what each profile contains */}
      <div className="mt-5 border-t border-stone-100 pt-4">
        <p className="mb-2 text-[0.68rem] uppercase tracking-wide text-stone-400">Training profiles</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {shop.profiles.map((p) => (
            <div key={p.id} className="rounded-lg bg-stone-50 px-3 py-2">
              <div className="text-sm font-medium text-stone-700">{p.name}</div>
              <div className="text-xs text-stone-400">{p.blurb}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.moduleCodes.map((c) => <span key={c} className="rounded bg-white px-1.5 py-0.5 font-mono text-[0.68rem] text-stone-400 ring-1 ring-stone-200">{c}</span>)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-400">Edit what's inside each profile — modules, name, description — on the Courses screen under Training profiles.</p>
      </div>
    </Card>
  );
}

function ShopDetailsPreview() {
  const { shop } = useShop();
  return (
    <Card className="p-5">
      <SectionTitle><span className="inline-flex items-center gap-1.5"><Cog className="h-3.5 w-3.5" /> Shop details</span></SectionTitle>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs uppercase tracking-wide text-stone-400">Shop name</dt><dd className="text-stone-700">{shop.settings.shopName}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-stone-400">Location</dt><dd className="text-stone-700">{shop.settings.location}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-stone-400">Editing shop details, supervisors, emergency contacts and media comes later in Stage 3/5.</p>
    </Card>
  );
}
