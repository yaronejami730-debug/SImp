"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";
import { COMMISSION_SCHEMES } from "@/lib/commission";

const NAVY = "#1a273a";
const PINK = "#DB407A";

type User = {
  id: number; email: string; name: string; role: "admin" | "responsable" | "collab";
  is_commercial?: boolean; is_teleprospector?: boolean; phone?: string; active?: boolean;
  commission_base?: number; commission_pct?: number;
};
type CallCenter = { id: number; name: string; agence_only: boolean; responsable_email: string; parent_id: number | null; parent_name: string | null; commercials_count: number; telepros_count: number };
type Assignment = { call_center_id: number; commercial_email: string };

const inp: React.CSSProperties = { width: "100%", padding: 12, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box" };

function Comptes() {
  const [users, setUsers] = useState<User[]>([]);
  const [role, setRole] = useState<"admin" | "responsable" | "collab">("collab");
  const [callCenters, setCallCenters] = useState<CallCenter[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [type, setType] = useState<"commercial" | "telepro" | "callcenter">("commercial");
  // Compte commercial / télépro
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [schemeKey, setSchemeKey] = useState("50+10");
  // Call center
  const [ccName, setCcName] = useState("");
  const [ccAgence, setCcAgence] = useState(true);
  const [rName, setRName] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPass, setRPass] = useState("");
  const [rPhone, setRPhone] = useState("");

  async function load() {
    setErr("");
    try {
      const res = await fetch("/api/users", { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) { setUsers(d.users); setRole(d.role ?? "collab"); }
      else { setErr(d.error ?? "Erreur"); return; }
      if (d.role === "admin") {
        const r2 = await fetch("/api/callcenters", { headers: authHeaders() });
        const d2 = await r2.json();
        if (d2.ok) { setCallCenters(d2.callCenters); setAssignments(d2.assignments); }
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
  }
  useEffect(() => { load(); }, []);

  // Un responsable ne peut créer que des télépros.
  const isAdmin = role === "admin";
  useEffect(() => { if (!isAdmin && type !== "telepro") setType("telepro"); }, [isAdmin, type]);

  async function addUser() {
    if (!name.trim() || !email.trim() || !password.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/users", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ type: type === "commercial" ? "commercial" : "telepro", name, email, password, phone, schemeKey }) });
      const d = await res.json();
      if (d.ok) { setName(""); setEmail(""); setPassword(""); setPhone(""); load(); }
      else alert(d.error ?? "Erreur");
    } finally { setBusy(false); }
  }

  async function addCallCenter() {
    if (!ccName.trim() || !rName.trim() || !rEmail.trim() || !rPass.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/callcenters", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ name: ccName, agenceOnly: ccAgence, responsable: { name: rName, email: rEmail, password: rPass, phone: rPhone } }) });
      const d = await res.json();
      if (d.ok) { setCcName(""); setRName(""); setREmail(""); setRPass(""); setRPhone(""); load(); }
      else alert(d.error ?? "Erreur");
    } finally { setBusy(false); }
  }

  async function toggleAssign(u: User, ccId: number, assigned: boolean) {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, email: u.email, action: assigned ? "unassign" : "assign" }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
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
  const isAssigned = (email: string, ccId: number) => assignments.some((a) => a.commercial_email === email.toLowerCase() && a.call_center_id === ccId);
  const subCallCenters = callCenters.filter((c) => c.id !== 1); // CC 1 = racine (voit tout)

  const roleBadges = (u: User) => (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      {u.role === "admin" && <span style={{ fontSize: 11, color: PINK, fontWeight: 700 }}>super-admin</span>}
      {u.role === "responsable" && <span style={{ fontSize: 11, color: "#7c3aed", background: "#f5f3ff", padding: "1px 7px", borderRadius: 999, fontWeight: 700 }}>responsable</span>}
      {u.is_commercial && <span style={{ fontSize: 11, color: "#15803d", background: "#f0fdf4", padding: "1px 7px", borderRadius: 999, fontWeight: 700 }}>commercial</span>}
      {u.is_teleprospector && <span style={{ fontSize: 11, color: "#0369a1", background: "#f0f9ff", padding: "1px 7px", borderRadius: 999, fontWeight: 700 }}>téléprospecteur</span>}
      {u.active === false && <span style={{ fontSize: 11, color: "#9aa6b8" }}>(inactif)</span>}
    </span>
  );

  const typeBtn = (v: typeof type, label: string, sub: string) => (
    <button onClick={() => setType(v)} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${type === v ? NAVY : "#e5e7eb"}`, background: type === v ? NAVY : "#fff", color: type === v ? "#fff" : "#6b7280" }}>{label}<br /><span style={{ fontWeight: 400, fontSize: 11 }}>{sub}</span></button>
  );

  return (
    <>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Comptes</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
          {isAdmin ? "Crée commerciaux, téléprospecteurs et call centers. Assigne les commerciaux à chaque call center." : "Ajoute les téléprospecteurs de ton call center."}
        </p>
      </header>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Nouveau</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {isAdmin && typeBtn("commercial", "Commercial", "réalise les RDV")}
          {typeBtn("telepro", "Téléprospecteur", "crée les RDV")}
          {isAdmin && typeBtn("callcenter", "Call center", "équipe + responsable")}
        </div>

        {type === "callcenter" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <input style={inp} value={ccName} onChange={(e) => setCcName(e.target.value)} placeholder="Nom du call center (ex: Call Center Hanan)" />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: NAVY }}>
              <input type="checkbox" checked={ccAgence} onChange={(e) => setCcAgence(e.target.checked)} /> Agence uniquement (pas de déplacement)
            </label>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Responsable du call center :</div>
            <input style={inp} value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Nom du responsable" />
            <input style={inp} type="email" value={rEmail} onChange={(e) => setREmail(e.target.value)} placeholder="E-mail (login responsable)" />
            <input style={inp} value={rPass} onChange={(e) => setRPass(e.target.value)} placeholder="Mot de passe" />
            <input style={inp} value={rPhone} onChange={(e) => setRPhone(e.target.value)} placeholder="Téléphone (optionnel)" />
            <button onClick={addCallCenter} disabled={busy || !ccName.trim() || !rName.trim() || !rEmail.trim() || !rPass.trim()} style={{ padding: 13, borderRadius: 8, border: "none", background: busy ? "#cbd5e1" : PINK, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>{busy ? "…" : "Créer le call center"}</button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "commercial" ? "Nom du commercial (ex: Jérémy Bonamy)" : "Nom du téléprospecteur"} />
            <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse e-mail (login)" />
            <input style={inp} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" />
            <input style={inp} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone (injecté dans les mails/SMS clients)" />
            <div>
              <label style={{ display: "block", fontSize: 12.5, color: "#6b7280", marginBottom: 5 }}>Commission (par RDV signé)</label>
              <select style={inp} value={schemeKey} onChange={(e) => setSchemeKey(e.target.value)}>
                {COMMISSION_SCHEMES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <button onClick={addUser} disabled={busy || !name.trim() || !email.trim() || !password.trim()} style={{ padding: 13, borderRadius: 8, border: "none", background: busy ? "#cbd5e1" : PINK, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              {busy ? "…" : type === "commercial" ? "Créer le commercial" : "Créer le téléprospecteur"}
            </button>
          </div>
        )}
      </div>

      {/* Call centers existants (admin) */}
      {isAdmin && subCallCenters.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Call centers</div>
          <div style={{ display: "grid", gap: 8 }}>
            {subCallCenters.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#f8fafc", borderRadius: 8, padding: "12px 14px" }}>
                <div>
                  <span style={{ fontWeight: 700, color: NAVY }}>{c.name}</span>
                  {c.agence_only && <span style={{ fontSize: 11, color: "#0891b2", background: "#ecfeff", padding: "1px 7px", borderRadius: 999, marginLeft: 8 }}>agence only</span>}
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    Agence : <strong style={{ color: NAVY }}>{c.parent_name ?? "— (racine)"}</strong> · responsable : {c.responsable_email || "—"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
                  <div style={{ textAlign: "center" }}><div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 20, fontWeight: 700, color: "#15803d" }}>{c.commercials_count}</div><div style={{ fontSize: 11, color: "#6b7280" }}>commerciaux</div></div>
                  <div style={{ textAlign: "center" }}><div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 20, fontWeight: 700, color: "#0369a1" }}>{c.telepros_count}</div><div style={{ fontSize: 11, color: "#6b7280" }}>téléprospecteurs</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <p style={{ color: "#dc2626" }}>❌ {err}</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {users.map((u) => (
          <div key={u.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, color: NAVY }}>{u.name} {roleBadges(u)}</div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
                <div style={{ fontSize: 12.5, color: "#15803d", marginTop: 2 }}>{schemeLabel(u)}</div>
              </div>
              {u.role !== "admin" && (
                <button onClick={() => del(u)} style={{ padding: "8px 10px", borderRadius: 8, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Supprimer</button>
              )}
            </div>

            {/* Assignation aux call centers (admin, uniquement sur les commerciaux) */}
            {isAdmin && u.is_commercial && subCallCenters.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #eef1f4" }}>
                <div style={{ fontSize: 11.5, color: "#6b7280", marginBottom: 6 }}>Disponible pour les call centers :</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {subCallCenters.map((c) => {
                    const on = isAssigned(u.email, c.id);
                    return (
                      <button key={c.id} onClick={() => toggleAssign(u, c.id, on)} style={{ padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${on ? PINK : "#e5e7eb"}`, background: on ? PINK : "#fff", color: on ? "#fff" : "#6b7280" }}>
                        {on ? "✓ " : "+ "}{c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isAdmin && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                <button onClick={() => patch(u.id, { isCommercial: !u.is_commercial })} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${u.is_commercial ? "#15803d" : "#e5e7eb"}`, background: u.is_commercial ? "#f0fdf4" : "#fff", color: u.is_commercial ? "#15803d" : "#6b7280" }}>{u.is_commercial ? "✓ commercial" : "commercial"}</button>
                <button onClick={() => patch(u.id, { isTeleprospector: !u.is_teleprospector })} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${u.is_teleprospector ? "#0369a1" : "#e5e7eb"}`, background: u.is_teleprospector ? "#f0f9ff" : "#fff", color: u.is_teleprospector ? "#0369a1" : "#6b7280" }}>{u.is_teleprospector ? "✓ téléprospecteur" : "téléprospecteur"}</button>
                <button onClick={() => patch(u.id, { active: u.active === false })} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid #e5e7eb", background: "#fff", color: u.active === false ? "#15803d" : "#9aa6b8" }}>{u.active === false ? "Réactiver" : "Désactiver"}</button>
              </div>
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
