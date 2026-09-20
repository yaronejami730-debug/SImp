"use client";

import { useEffect, useState } from "react";
import EspaceAgenceShell from "@/components/layout/EspaceAgenceShell";
import { authHeaders } from "@/lib/client";

// Onglet "Formation" de l'espace YJ Solutions (voir EspaceAgenceShell / AGENCE_GROUPES) —
// coquille + auth + sidebar déjà gérées par EspaceAgenceShell, pas de re-implémentation ici.
const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";
const GREEN = "#16a34a";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const WARN = "#b45309";

type Partner = { id: number; name: string; active: boolean };
type SlotTemplateEntry = { weekday: number; start: string; end: string; type: "individuel" | "groupe"; capacity: number };
type ProgrammeStep = { title: string };
type Settings = { slotTemplate: SlotTemplateEntry[]; defaultPartnerId: number | null; autoSendEnabled: boolean; programme: ProgrammeStep[] };
type Slot = { id: number; date: string; startTime: string; endTime: string; type: "individuel" | "groupe"; partnerId: number; partnerName: string; capacity: number; active: boolean; registered: number; participants: { firstName: string; lastName: string }[] };
type Registration = { id: number; slotId: number; firstName: string; lastName: string; email: string; status: "inscrit" | "annule"; emailSent: boolean };

const WEEKDAYS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const card: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, marginBottom: 16 };
const sectionTitle: React.CSSProperties = { margin: "0 0 12px", fontFamily: "'Cabin',sans-serif", fontSize: 16, fontWeight: 700, color: NAVY };
const champ: React.CSSProperties = { height: 36, padding: "0 10px", fontSize: 13.5, border: `1px solid ${LINE}`, borderRadius: 8, background: "#fff", color: NAVY };
const btnPrincipal: React.CSSProperties = { height: 36, padding: "0 14px", borderRadius: 8, border: "none", background: NAVY, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const btnSecondaire: React.CSSProperties = { height: 34, padding: "0 12px", borderRadius: 8, border: `1px solid ${LINE}`, background: "#fff", color: NAVY, fontSize: 13, fontWeight: 700, cursor: "pointer" };

export default function Page() {
  return (
    <EspaceAgenceShell active="formation">
      <Formation />
    </EspaceAgenceShell>
  );
}

function Toggle({ on, onClick, busy }: { on: boolean; onClick: () => void; busy: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} title={on ? "Activé — clic pour désactiver" : "Désactivé — clic pour activer"}
      style={{ width: 42, height: 24, borderRadius: 12, border: "none", cursor: busy ? "default" : "pointer", padding: 2, background: on ? GREEN : "#cbd5e1", transition: "background .15s", flexShrink: 0, opacity: busy ? 0.6 : 1 }}>
      <span style={{ display: "block", width: 20, height: 20, borderRadius: 10, background: "#fff", transform: on ? "translateX(18px)" : "translateX(0)", transition: "transform .15s" }} />
    </button>
  );
}

function Formation() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [busy, setBusy] = useState("");

  async function load() {
    const [rs, rp, rl] = await Promise.all([
      fetch("/api/formation/settings", { headers: authHeaders() }),
      fetch("/api/formation/partners", { headers: authHeaders() }),
      fetch("/api/formation/slots", { headers: authHeaders() }),
    ]);
    const [ds, dp, dl] = await Promise.all([rs.json(), rp.json(), rl.json()]);
    if (ds.ok) setSettings(ds.settings);
    if (dp.ok) setPartners(dp.partners);
    if (dl.ok) setSlots(dl.slots);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleAutoSend() {
    if (!settings) return;
    setBusy("autosend");
    try {
      const next = !settings.autoSendEnabled;
      const r = await fetch("/api/formation/settings", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ autoSendEnabled: next }) });
      const d = await r.json();
      if (d.ok) setSettings(d.settings); else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  async function envoyerTest() {
    setBusy("test"); setFlash(null);
    try {
      const r = await fetch("/api/formation/test-email", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({}) });
      const d = await r.json();
      if (d.ok) setFlash({ kind: "ok", msg: `Email de test envoyé à ${d.sentTo}.` });
      else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } catch (e) { setFlash({ kind: "err", msg: e instanceof Error ? e.message : "Erreur" }); }
    finally { setBusy(""); }
  }

  if (loading || !settings) return <div style={{ textAlign: "center", padding: 40, color: MUTED }}>Chargement…</div>;

  return (
    <>
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>🎓 Formation</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Créneaux, inscriptions et email de confirmation — tout est modifiable depuis cette page.</p>
      </header>

      {flash && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, background: flash.kind === "ok" ? "#ecfdf5" : "#fef2f2", color: flash.kind === "ok" ? "#065f46" : "#dc2626", border: `1px solid ${flash.kind === "ok" ? "#a7f3d0" : "#fecaca"}` }}>
          {flash.kind === "ok" ? "✅ " : "❌ "}{flash.msg}
        </div>
      )}

      <div style={card}>
        <div style={sectionTitle}>Envoi de la confirmation</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Toggle on={settings.autoSendEnabled} busy={busy === "autosend"} onClick={toggleAutoSend} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: settings.autoSendEnabled ? GREEN : WARN }}>
            {settings.autoSendEnabled ? "Envoi automatique activé — les inscrits reçoivent la confirmation." : "Envoi automatique désactivé — les inscriptions sont créées mais rien ne part."}
          </span>
        </div>
        <button onClick={envoyerTest} disabled={busy === "test"} style={{ ...btnSecondaire, cursor: busy === "test" ? "wait" : "pointer" }}>
          {busy === "test" ? "…" : "🧪 Envoyer un email de test (à toi uniquement)"}
        </button>
      </div>

      <SlotsSection slots={slots} partners={partners} onReload={load} setFlash={setFlash} />
      <TemplateSection settings={settings} partners={partners} onSaved={(s) => setSettings(s)} setFlash={setFlash} />
      <PartnersSection partners={partners} onReload={load} setFlash={setFlash} />
      <ProgrammeSection settings={settings} onSaved={(s) => setSettings(s)} setFlash={setFlash} />
    </>
  );
}

function SlotsSection({ slots, partners, onReload, setFlash }: { slots: Slot[]; partners: Partner[]; onReload: () => Promise<void>; setFlash: (f: { kind: "ok" | "err"; msg: string } | null) => void }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [busy, setBusy] = useState("");
  const [nouveau, setNouveau] = useState(false);
  const [form, setForm] = useState({ date: "", startTime: "10:00", endTime: "12:00", type: "individuel" as "individuel" | "groupe", partnerId: partners[0]?.id ?? 0, capacity: 1 });

  async function toggleOpen(slot: Slot) {
    if (openId === slot.id) { setOpenId(null); return; }
    setOpenId(slot.id);
    const r = await fetch(`/api/formation/registrations?slotId=${slot.id}`, { headers: authHeaders() });
    const d = await r.json();
    if (d.ok) setRegs(d.registrations);
  }

  async function generer() {
    setBusy("generer"); setFlash(null);
    try {
      const r = await fetch("/api/formation/slots", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ generate: true }) });
      const d = await r.json();
      if (d.ok) { setFlash({ kind: "ok", msg: `${d.created} créneau(x) créé(s).` }); await onReload(); }
      else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  async function creerCreneau() {
    setBusy("creer"); setFlash(null);
    try {
      const r = await fetch("/api/formation/slots", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(form) });
      const d = await r.json();
      if (d.ok) { setFlash({ kind: "ok", msg: "Créneau créé." }); setNouveau(false); await onReload(); }
      else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  async function fermerCreneau(slot: Slot) {
    setBusy(`close-${slot.id}`);
    try {
      await fetch(`/api/formation/slots/${slot.id}`, { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ active: !slot.active }) });
      await onReload();
    } finally { setBusy(""); }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={sectionTitle}>Créneaux</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={generer} disabled={busy === "generer"} style={{ ...btnSecondaire, cursor: busy === "generer" ? "wait" : "pointer" }}>{busy === "generer" ? "…" : "↻ Générer les 4 prochaines semaines"}</button>
          <button onClick={() => setNouveau((v) => !v)} style={btnPrincipal}>+ Nouveau créneau</button>
        </div>
      </div>

      {nouveau && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12, borderRadius: 10, background: "#f8fafc", marginBottom: 12 }}>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={champ} />
          <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} style={{ ...champ, width: 90 }} />
          <span style={{ color: MUTED }}>→</span>
          <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} style={{ ...champ, width: 90 }} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "individuel" | "groupe" })} style={champ}>
            <option value="individuel">Individuel</option>
            <option value="groupe">Groupe</option>
          </select>
          <select value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: Number(e.target.value) })} style={champ}>
            {partners.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} style={{ ...champ, width: 70 }} title="Places" />
          <button onClick={creerCreneau} disabled={busy === "creer" || !form.date} style={btnPrincipal}>{busy === "creer" ? "…" : "Créer"}</button>
        </div>
      )}

      {slots.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>Aucun créneau à venir — génère depuis le modèle ou crée-en un.</div>}

      {groupByDate(slots).map(({ date, items }) => (
        <div key={date} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            {new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {items.map((slot) => {
              const statut = !slot.active ? "Fermé" : slot.registered >= slot.capacity ? "Complet" : "Ouvert";
              const statutColor = !slot.active ? MUTED : slot.registered >= slot.capacity ? WARN : GREEN;
              const noms = slot.participants.map((p) => `${p.firstName} ${p.lastName}`.trim()).join(", ");
              return (
                <div key={slot.id} style={{ border: `1px solid ${openId === slot.id ? NAVY : LINE}`, borderRadius: 10, overflow: "hidden" }}>
                  <button onClick={() => toggleOpen(slot)} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", background: "#fff", border: "none", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 13, color: NAVY, minWidth: 90 }}>{slot.startTime}–{slot.endTime}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, minWidth: 70 }}>{slot.type === "groupe" ? "Groupe" : "Individuel"}</span>
                      <span style={{ fontSize: 12.5, color: MUTED, flex: 1 }}>{slot.partnerName}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: MUTED }}>{slot.registered}/{slot.capacity}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: statutColor }}>{statut}</span>
                    </div>
                    <div style={{ fontSize: 12, color: noms ? NAVY : MUTED, paddingLeft: 102 }}>{noms || "Personne pour l'instant"}</div>
                  </button>
                  {openId === slot.id && (
                    <div style={{ padding: 12, borderTop: `1px solid ${LINE}`, background: "#fafafa" }}>
                      <RegistrationsPanel slot={slot} regs={regs} onChanged={async () => { const r = await fetch(`/api/formation/registrations?slotId=${slot.id}`, { headers: authHeaders() }); const d = await r.json(); if (d.ok) setRegs(d.registrations); await onReload(); }} setFlash={setFlash} />
                      <button onClick={() => fermerCreneau(slot)} disabled={busy === `close-${slot.id}`} style={{ ...btnSecondaire, marginTop: 10 }}>
                        {slot.active ? "Fermer ce créneau" : "Rouvrir ce créneau"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByDate(slots: Slot[]): { date: string; items: Slot[] }[] {
  const groups: { date: string; items: Slot[] }[] = [];
  for (const s of slots) {
    let g = groups.find((x) => x.date === s.date);
    if (!g) { g = { date: s.date, items: [] }; groups.push(g); }
    g.items.push(s);
  }
  return groups;
}

function RegistrationsPanel({ slot, regs, onChanged, setFlash }: { slot: Slot; regs: Registration[]; onChanged: () => Promise<void>; setFlash: (f: { kind: "ok" | "err"; msg: string } | null) => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [busy, setBusy] = useState(false);

  async function inscrire() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) return;
    setBusy(true); setFlash(null);
    try {
      const r = await fetch("/api/formation/registrations", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ slotId: slot.id, ...form }) });
      const d = await r.json();
      if (d.ok) {
        setForm({ firstName: "", lastName: "", email: "" });
        setFlash({ kind: "ok", msg: d.emailSent ? "Inscrit·e — confirmation envoyée." : "Inscrit·e — envoi auto désactivé, aucun email envoyé." });
        await onChanged();
      } else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(false); }
  }

  async function annuler(id: number) {
    await fetch(`/api/formation/registrations?id=${id}`, { method: "DELETE", headers: authHeaders() });
    await onChanged();
  }

  const actifs = regs.filter((r) => r.status === "inscrit");

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Participants ({actifs.length}/{slot.capacity})</div>
      {actifs.length === 0 && <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 8 }}>Personne pour l&apos;instant.</div>}
      <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
        {actifs.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ flex: 1 }}>{r.firstName} {r.lastName} <span style={{ color: MUTED }}>— {r.email}</span></span>
            <span style={{ fontSize: 11, color: r.emailSent ? GREEN : WARN, fontWeight: 600 }}>{r.emailSent ? "✓ mail envoyé" : "mail non envoyé"}</span>
            <button onClick={() => annuler(r.id)} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>Retirer</button>
          </div>
        ))}
      </div>
      {slot.active && actifs.length < slot.capacity && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input placeholder="Prénom" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={{ ...champ, width: 110 }} />
          <input placeholder="Nom" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={{ ...champ, width: 110 }} />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ ...champ, width: 190 }} />
          <button onClick={inscrire} disabled={busy} style={btnPrincipal}>{busy ? "…" : "+ Inscrire"}</button>
        </div>
      )}
    </div>
  );
}

function TemplateSection({ settings, partners, onSaved, setFlash }: { settings: Settings; partners: Partner[]; onSaved: (s: Settings) => void; setFlash: (f: { kind: "ok" | "err"; msg: string } | null) => void }) {
  const [rows, setRows] = useState<SlotTemplateEntry[]>(settings.slotTemplate);
  const [defaultPartnerId, setDefaultPartnerId] = useState(settings.defaultPartnerId);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setRows(settings.slotTemplate); setDefaultPartnerId(settings.defaultPartnerId); }, [settings]);

  function update(i: number, patch: Partial<SlotTemplateEntry>) {
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  async function enregistrer() {
    setBusy(true); setFlash(null);
    try {
      const r = await fetch("/api/formation/settings", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ slotTemplate: rows, defaultPartnerId }) });
      const d = await r.json();
      if (d.ok) { onSaved(d.settings); setFlash({ kind: "ok", msg: "Modèle horaire enregistré." }); }
      else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(false); }
  }

  return (
    <div style={card}>
      <div style={sectionTitle}>Modèle horaire par défaut</div>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: MUTED }}>Utilisé par «Générer les 4 prochaines semaines». Le partenaire par défaut sert aussi au test sans créneau choisi.</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Partenaire par défaut</span>
        <select value={defaultPartnerId ?? ""} onChange={(e) => setDefaultPartnerId(Number(e.target.value) || null)} style={champ}>
          <option value="">—</option>
          {partners.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select value={row.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })} style={{ ...champ, width: 110 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
            </select>
            <input type="time" value={row.start} onChange={(e) => update(i, { start: e.target.value })} style={{ ...champ, width: 90 }} />
            <span style={{ color: MUTED }}>→</span>
            <input type="time" value={row.end} onChange={(e) => update(i, { end: e.target.value })} style={{ ...champ, width: 90 }} />
            <select value={row.type} onChange={(e) => update(i, { type: e.target.value as "individuel" | "groupe" })} style={champ}>
              <option value="individuel">Individuel</option>
              <option value="groupe">Groupe</option>
            </select>
            <input type="number" min={1} value={row.capacity} onChange={(e) => update(i, { capacity: Number(e.target.value) })} style={{ ...champ, width: 60 }} title="Places" />
            <button onClick={() => setRows((r) => r.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>Retirer</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setRows((r) => [...r, { weekday: 1, start: "10:00", end: "12:00", type: "individuel", capacity: 1 }])} style={btnSecondaire}>+ Ligne</button>
        <button onClick={enregistrer} disabled={busy} style={btnPrincipal}>{busy ? "…" : "Enregistrer"}</button>
      </div>
    </div>
  );
}

function PartnersSection({ partners, onReload, setFlash }: { partners: Partner[]; onReload: () => Promise<void>; setFlash: (f: { kind: "ok" | "err"; msg: string } | null) => void }) {
  const [nom, setNom] = useState("");
  const [busy, setBusy] = useState("");

  async function ajouter() {
    if (!nom.trim()) return;
    setBusy("ajout");
    try {
      const r = await fetch("/api/formation/partners", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ name: nom.trim() }) });
      const d = await r.json();
      if (d.ok) { setNom(""); await onReload(); } else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  async function toggleActive(p: Partner) {
    setBusy(`t-${p.id}`);
    try {
      await fetch("/api/formation/partners", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ id: p.id, active: !p.active }) });
      await onReload();
    } finally { setBusy(""); }
  }

  return (
    <div style={card}>
      <div style={sectionTitle}>Partenaires</div>
      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        {partners.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
            <span style={{ flex: 1, color: p.active ? NAVY : MUTED, textDecoration: p.active ? "none" : "line-through" }}>{p.name}</span>
            <Toggle on={p.active} busy={busy === `t-${p.id}`} onClick={() => toggleActive(p)} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="Nom du partenaire" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...champ, flex: 1 }} />
        <button onClick={ajouter} disabled={busy === "ajout"} style={btnPrincipal}>{busy === "ajout" ? "…" : "+ Ajouter"}</button>
      </div>
    </div>
  );
}

function ProgrammeSection({ settings, onSaved, setFlash }: { settings: Settings; onSaved: (s: Settings) => void; setFlash: (f: { kind: "ok" | "err"; msg: string } | null) => void }) {
  const [steps, setSteps] = useState<ProgrammeStep[]>(settings.programme);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSteps(settings.programme); }, [settings]);

  function move(i: number, dir: -1 | 1) {
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function enregistrer() {
    setBusy(true); setFlash(null);
    try {
      const r = await fetch("/api/formation/settings", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ programme: steps }) });
      const d = await r.json();
      if (d.ok) { onSaved(d.settings); setFlash({ kind: "ok", msg: "Programme enregistré — les puces de l'email sont à jour." }); }
      else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(false); }
  }

  return (
    <div style={card}>
      <div style={sectionTitle}>Programme de la formation</div>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: MUTED }}>Alimente directement les puces de l&apos;email de confirmation.</p>
      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: MUTED, width: 20 }}>{i + 1}.</span>
            <input value={step.title} onChange={(e) => setSteps((s) => s.map((x, j) => (j === i ? { title: e.target.value } : x)))} style={{ ...champ, flex: 1 }} />
            <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer" }}>↑</button>
            <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer" }}>↓</button>
            <button onClick={() => setSteps((s) => s.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>Retirer</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setSteps((s) => [...s, { title: "" }])} style={btnSecondaire}>+ Étape</button>
        <button onClick={enregistrer} disabled={busy} style={btnPrincipal}>{busy ? "…" : "Enregistrer"}</button>
      </div>
    </div>
  );
}
