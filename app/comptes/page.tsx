"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";
import { COMMISSION_SCHEMES } from "@/lib/commission";

const NAVY = "#1a273a";
const PINK = "#DB407A";

type User = {
  id: number; email: string; name: string; role: "admin" | "collab";
  is_commercial?: boolean; is_teleprospector?: boolean; phone?: string; active?: boolean;
  commission_base?: number; commission_pct?: number;
};

const inp: React.CSSProperties = { width: "100%", padding: 12, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box" };

function Comptes() {
  const [users, setUsers] = useState<User[]>([]);
  const [err, setErr] = useState("");
  const [type, setType] = useState<"commercial" | "telepro">("commercial");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [schemeKey, setSchemeKey] = useState("50+10");
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr("");
    try {
      const res = await fetch("/api/users", { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) setUsers(d.users); else setErr(d.error ?? "Erreur");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim() || !email.trim() || !password.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/users", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ type, name, email, password, phone, schemeKey }) });
      const d = await res.json();
      if (d.ok) { setName(""); setEmail(""); setPassword(""); setPhone(""); load(); }
      else alert(d.error ?? "Erreur");
    } finally { setBusy(false); }
  }
  async function patch(id: number, body: Record<string, unknown>) {
    const res = await fetch("/api/users", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ id, ...body }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  async function del(u: User) {
    if (!confirm(`Supprimer le compte de ${u.name} ?`)) return;
    const res = await fetch(`/api/users?id=${u.id}`, { method: "DELETE", headers: authHeaders() });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }

  const schemeLabel = (u: User) => {
    const base = Number(u.commission_base ?? 0), pct = Number(u.commission_pct ?? 0);
    return `${base ? `${base} €` : ""}${base && pct ? " + " : ""}${pct ? `${pct} %` : ""}` || "—";
  };
  const roleBadges = (u: User) => (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      {u.role === "admin" && <span style={{ fontSize: 11, color: PINK, fontWeight: 700 }}>super-admin</span>}
      {u.is_commercial && <span style={{ fontSize: 11, color: "#15803d", background: "#f0fdf4", padding: "1px 7px", borderRadius: 999, fontWeight: 700 }}>🛠️ commercial</span>}
      {u.is_teleprospector && <span style={{ fontSize: 11, color: "#0369a1", background: "#f0f9ff", padding: "1px 7px", borderRadius: 999, fontWeight: 700 }}>📞 téléprospecteur</span>}
      {u.active === false && <span style={{ fontSize: 11, color: "#9aa6b8" }}>(inactif)</span>}
    </span>
  );

  return (
    <>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Comptes</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>Crée des commerciaux et des téléprospecteurs (avec login). Chacun a sa commission.</p>
      </header>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Nouveau compte</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setType("commercial")} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${type === "commercial" ? NAVY : "#e5e7eb"}`, background: type === "commercial" ? NAVY : "#fff", color: type === "commercial" ? "#fff" : "#6b7280" }}>🛠️ Commercial<br /><span style={{ fontWeight: 400, fontSize: 11 }}>(réalise les RDV)</span></button>
          <button onClick={() => setType("telepro")} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${type === "telepro" ? NAVY : "#e5e7eb"}`, background: type === "telepro" ? NAVY : "#fff", color: type === "telepro" ? "#fff" : "#6b7280" }}>📞 Téléprospecteur<br /><span style={{ fontWeight: 400, fontSize: 11 }}>(crée les RDV)</span></button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "commercial" ? "Nom du commercial (ex: Jérémie Bonamy)" : "Nom du téléprospecteur"} />
          <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse e-mail (login)" />
          <input style={inp} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" />
          <input style={inp} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone (injecté dans les mails/SMS clients)" />
          <div>
            <label style={{ display: "block", fontSize: 12.5, color: "#6b7280", marginBottom: 5 }}>💰 Commission (par RDV signé)</label>
            <select style={inp} value={schemeKey} onChange={(e) => setSchemeKey(e.target.value)}>
              {COMMISSION_SCHEMES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <button onClick={add} disabled={busy || !name.trim() || !email.trim() || !password.trim()} style={{ padding: 13, borderRadius: 8, border: "none", background: busy ? "#cbd5e1" : PINK, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
            {busy ? "…" : type === "commercial" ? "Créer le commercial" : "Créer le téléprospecteur"}
          </button>
        </div>
      </div>

      {err && <p style={{ color: "#dc2626" }}>❌ {err}</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {users.map((u) => (
          <div key={u.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, color: NAVY }}>{u.name} {roleBadges(u)}</div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
                <div style={{ fontSize: 12.5, color: "#15803d", marginTop: 2 }}>💰 {schemeLabel(u)}</div>
              </div>
              {u.role !== "admin" && (
                <button onClick={() => del(u)} style={{ padding: "8px 10px", borderRadius: 8, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Supprimer</button>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              <button onClick={() => patch(u.id, { isCommercial: !u.is_commercial })} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${u.is_commercial ? "#15803d" : "#e5e7eb"}`, background: u.is_commercial ? "#f0fdf4" : "#fff", color: u.is_commercial ? "#15803d" : "#6b7280" }}>{u.is_commercial ? "✓ commercial" : "commercial"}</button>
              <button onClick={() => patch(u.id, { isTeleprospector: !u.is_teleprospector })} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${u.is_teleprospector ? "#0369a1" : "#e5e7eb"}`, background: u.is_teleprospector ? "#f0f9ff" : "#fff", color: u.is_teleprospector ? "#0369a1" : "#6b7280" }}>{u.is_teleprospector ? "✓ téléprospecteur" : "téléprospecteur"}</button>
              <button onClick={() => patch(u.id, { active: u.active === false })} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid #e5e7eb", background: "#fff", color: u.active === false ? "#15803d" : "#9aa6b8" }}>{u.active === false ? "Réactiver" : "Désactiver"}</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return <Shell active="comptes"><Comptes /></Shell>;
}
