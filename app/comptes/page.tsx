"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";
import { COMMISSION_SCHEMES } from "@/lib/commission";

const NAVY = "#1a273a";
const PINK = "#DB407A";

type User = { id: number; email: string; name: string; role: "admin" | "collab" };
type CallCenter = { id: number; name: string; default_commercial: string };

const inp: React.CSSProperties = { width: "100%", padding: 12, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box" };

function Comptes() {
  const [users, setUsers] = useState<User[]>([]);
  const [callCenter, setCallCenter] = useState<CallCenter | null>(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"telepro" | "callcenter">("telepro");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ccName, setCcName] = useState("");
  const [defaultCommercial, setDefaultCommercial] = useState("");
  const [schemeKey, setSchemeKey] = useState("50+10");
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  async function syncColors() {
    if (!confirm("Réappliquer les couleurs Google Agenda sur tous les RDV et rappels (±1 an) ?")) return;
    setSyncBusy(true); setSyncMsg("");
    try {
      const r = await fetch("/api/admin/sync-colors", { method: "POST", headers: authHeaders() });
      const d = await r.json();
      if (d.ok) setSyncMsg(`✅ ${d.updated} events recolorés (${d.rdvCount} RDV + ${d.reminderCount} rappels analysés sur ${d.checked}).`);
      else setSyncMsg("❌ " + (d.error ?? "Erreur"));
    } catch (e) { setSyncMsg("❌ " + (e instanceof Error ? e.message : "Erreur")); }
    finally { setSyncBusy(false); }
  }

  async function load() {
    setErr("");
    try {
      const res = await fetch("/api/users", { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) { setUsers(d.users); setCallCenter(d.callCenter ?? null); }
      else setErr(d.error ?? "Erreur");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim() || !email.trim() || !password.trim()) return;
    if (mode === "callcenter" && !ccName.trim()) { alert("Nom de l'entité requis."); return; }
    setBusy(true);
    try {
      const body = mode === "callcenter"
        ? { mode, name, email, password, ccName, defaultCommercial, schemeKey }
        : { mode, name, email, password, schemeKey };
      const res = await fetch("/api/users", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(body) });
      const d = await res.json();
      if (d.ok) {
        setName(""); setEmail(""); setPassword(""); setCcName(""); setDefaultCommercial("");
        if (mode === "callcenter") alert(`✅ Nouvelle entité « ${d.callCenter?.name} » créée. Son admin se connecte avec ${email}. Elle est totalement indépendante de ton call center.`);
        load();
      } else alert(d.error ?? "Erreur");
    } finally { setBusy(false); }
  }
  async function del(u: User) {
    if (!confirm(`Supprimer le compte de ${u.name} ?`)) return;
    const res = await fetch(`/api/users?id=${u.id}`, { method: "DELETE", headers: authHeaders() });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }

  const renderHeader = (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <h2 style={{ margin: "0 0 4px", fontFamily: "'Cabin',sans-serif", fontSize: 14, color: PINK, textTransform: "uppercase", letterSpacing: 0.5 }}>🎨 Synchroniser couleurs Google Agenda</h2>
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>Applique les couleurs : 🔵 bleu (RDV pris) · 🟢 vert (signé/BC/vendu) · 🟠 orange (réfléchit) · ⚫ gris (pas signé) · 🔴 rouge (annulé) · 🟣 violet (rappels téléphoniques). Affecte RDV et rappels des 12 derniers/prochains mois.</p>
      <button onClick={syncColors} disabled={syncBusy} style={{ padding: "10px 18px", borderRadius: 8, background: syncBusy ? "#cbd5e1" : PINK, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: syncBusy ? "not-allowed" : "pointer" }}>
        {syncBusy ? "Sync en cours…" : "🎨 Synchroniser maintenant"}
      </button>
      {syncMsg && <p style={{ marginTop: 10, fontSize: 13, color: syncMsg.startsWith("✅") ? "#166534" : "#dc2626", fontWeight: 600 }}>{syncMsg}</p>}
    </div>
  );

  return (
    <>
      {renderHeader}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Nouveau compte</div>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b7280" }}>Ton entité : <strong>{callCenter?.name ?? "—"}</strong></p>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setMode("telepro")} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${mode === "telepro" ? NAVY : "#e5e7eb"}`, background: mode === "telepro" ? NAVY : "#fff", color: mode === "telepro" ? "#fff" : "#6b7280" }}>👤 Téléprospecteur<br /><span style={{ fontWeight: 400, fontSize: 11 }}>(mon call center)</span></button>
          <button onClick={() => setMode("callcenter")} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${mode === "callcenter" ? NAVY : "#e5e7eb"}`, background: mode === "callcenter" ? NAVY : "#fff", color: mode === "callcenter" ? "#fff" : "#6b7280" }}>🏢 Nouvelle entité<br /><span style={{ fontWeight: 400, fontSize: 11 }}>(call center indépendant)</span></button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {mode === "callcenter" && (
            <>
              <input style={inp} value={ccName} onChange={(e) => setCcName(e.target.value)} placeholder="Nom de l'entité (ex: Bonamy Jérémy)" />
              <input style={inp} value={defaultCommercial} onChange={(e) => setDefaultCommercial(e.target.value)} placeholder="Commercial par défaut (ex: Jérémy Bonamy)" />
              <div style={{ fontSize: 11.5, color: "#9aa6b8", marginTop: -2 }}>Le compte ci-dessous sera le <strong>super-administrateur</strong> de cette entité (indépendante de la tienne).</div>
            </>
          )}
          <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === "callcenter" ? "Nom du super-admin" : "Nom du téléprospecteur"} />
          <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse e-mail" />
          <input style={inp} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" />
          <div>
            <label style={{ display: "block", fontSize: 12.5, color: "#6b7280", marginBottom: 5 }}>💰 Base de rémunération (par RDV signé)</label>
            <select style={inp} value={schemeKey} onChange={(e) => setSchemeKey(e.target.value)}>
              {COMMISSION_SCHEMES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <button onClick={add} disabled={busy || !name.trim() || !email.trim() || !password.trim()} style={{ padding: 13, borderRadius: 8, border: "none", background: busy ? "#cbd5e1" : PINK, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
            {busy ? "…" : mode === "callcenter" ? "Créer l'entité + super-admin" : "Créer le téléprospecteur"}
          </button>
          <p style={{ fontSize: 12, color: "#9aa6b8", margin: 0 }}>{mode === "callcenter" ? "Entité totalement séparée : ses RDV, son agenda, ses stats n'ont rien à voir avec les tiens." : "Le téléprospecteur voit les RDV de ton call center."}</p>
        </div>
      </div>

      {err && <p style={{ color: "#dc2626" }}>❌ {err}</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {users.map((u) => (
          <div key={u.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, color: NAVY }}>{u.name} {u.role === "admin" && <span style={{ fontSize: 11, color: PINK }}>(admin)</span>}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{u.email}</div>
            </div>
            {u.role !== "admin" && (
              <button onClick={() => del(u)} style={{ padding: "8px 10px", borderRadius: 8, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Supprimer</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return <Shell active="comptes"><Comptes /></Shell>;
}
