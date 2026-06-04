"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";

type User = { id: number; email: string; name: string; role: "admin" | "collab" };

const inp: React.CSSProperties = { width: "100%", padding: 12, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box" };

function Comptes() {
  const [users, setUsers] = useState<User[]>([]);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      if (d.ok) setUsers(d.users);
      else setErr(d.error ?? "Erreur");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim() || !email.trim() || !password.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/users", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ name, email, password }) });
      const d = await res.json();
      if (d.ok) { setName(""); setEmail(""); setPassword(""); load(); }
      else alert(d.error ?? "Erreur");
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
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Nouveau collaborateur</div>
        <div style={{ display: "grid", gap: 10 }}>
          <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" />
          <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse e-mail" />
          <input style={inp} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" />
          <button onClick={add} disabled={busy || !name.trim() || !email.trim() || !password.trim()} style={{ padding: 13, borderRadius: 8, border: "none", background: busy ? "#cbd5e1" : PINK, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
            {busy ? "…" : "Créer le compte"}
          </button>
          <p style={{ fontSize: 12, color: "#9aa6b8", margin: 0 }}>Le collaborateur voit ses propres RDV et gagne 50€/véhicule signé.</p>
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
