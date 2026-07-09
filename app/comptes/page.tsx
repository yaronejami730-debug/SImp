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
  call_center_id?: number; agence_name?: string; call_center_name?: string;
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
  const [openCC, setOpenCC] = useState<number | null>(null); // call center déplié
  const [openAgence, setOpenAgence] = useState<number | null>(null); // agence dépliée
  // Mini-form "ajouter un télépro à CE call center"
  const [ccTele, setCcTele] = useState({ name: "", email: "", password: "", phone: "" });

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

  async function addAgence() {
    const name = prompt("Nom de la nouvelle agence (ex: Simplicicar Lyon) :");
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/callcenters", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ agence: true, name: name.trim() }) });
      const d = await res.json();
      if (d.ok) load(); else alert(d.error ?? "Erreur");
    } finally { setBusy(false); }
  }
  async function delCallCenter(id: number, label: string) {
    if (!confirm(`Supprimer ${label} ?`)) return;
    const res = await fetch(`/api/callcenters?id=${id}`, { method: "DELETE", headers: authHeaders() });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  async function setAgence(ccId: number, parentId: number) {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, parentId, action: "setAgence" }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }

  async function addTeleproToCC(ccId: number) {
    if (!ccTele.name.trim() || !ccTele.email.trim() || !ccTele.password.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/users", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ type: "telepro", ...ccTele, callCenterId: ccId }) });
      const d = await res.json();
      if (d.ok) { setCcTele({ name: "", email: "", password: "", phone: "" }); load(); }
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
  const currentSchemeKey = (u: User) => {
    const base = Number(u.commission_base ?? 0), pct = Number(u.commission_pct ?? 0);
    return COMMISSION_SCHEMES.find((s) => s.base === base && s.pct === pct)?.key ?? "";
  };
  const isAssigned = (email: string, ccId: number) => assignments.some((a) => a.commercial_email === email.toLowerCase() && a.call_center_id === ccId);
  const agences = callCenters.filter((c) => c.parent_id == null); // racines = agences
  const subCallCenters = callCenters.filter((c) => c.parent_id != null); // rattachés à une agence

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
      <header style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Comptes</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            {isAdmin ? "Agences, call centers, commerciaux et téléprospecteurs." : "Ajoute et rémunère les téléprospecteurs de ton call center."}
          </p>
        </div>
        {isAdmin && (
          <button onClick={addAgence} disabled={busy} style={{ padding: "9px 14px", borderRadius: 8, border: `1.5px solid ${PINK}`, background: "#fff", color: PINK, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Créer une agence</button>
        )}
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
            {type === "commercial" && <input style={inp} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone (injecté dans les mails/SMS clients)" />}
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

      {/* Agences (admin) — clic = voir ses commerciaux */}
      {isAdmin && agences.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Agences</div>
          <div style={{ display: "grid", gap: 8 }}>
            {agences.map((a) => {
              const open = openAgence === a.id;
              const coms = users.filter((u) => u.is_commercial && u.agence_name === a.name);
              const ccs = callCenters.filter((c) => c.parent_id === a.id);
              return (
                <div key={a.id} style={{ border: `1px solid ${open ? PINK : "#eef1f4"}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "stretch", background: open ? "#fff5f9" : "#f8fafc" }}>
                    <button onClick={() => setOpenAgence(open ? null : a.id)} style={{ flex: 1, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "transparent", border: "none", padding: "12px 14px", cursor: "pointer" }}>
                      <span style={{ fontWeight: 700, color: NAVY }}>🏢 {a.name}</span>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>{coms.length} commerciaux · {ccs.length} call center{ccs.length > 1 ? "s" : ""} {open ? "▲" : "▼"}</span>
                    </button>
                    <button onClick={() => delCallCenter(a.id, `l'agence ${a.name}`)} title="Supprimer l'agence" style={{ border: "none", background: "transparent", color: "#dc2626", padding: "0 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Supprimer</button>
                  </div>
                  {open && (
                    <div style={{ padding: 14, borderTop: "1px solid #eef1f4" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Commerciaux de l&apos;agence</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {coms.length === 0 && <span style={{ fontSize: 12, color: "#9aa6b8" }}>Aucun commercial.</span>}
                        {coms.map((u) => <span key={u.id} style={{ fontSize: 13, color: NAVY, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 999, padding: "4px 10px" }}>{u.name}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Call centers existants (admin) — cartes dépliables */}
      {isAdmin && subCallCenters.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Call centers</div>
          <div style={{ display: "grid", gap: 8 }}>
            {subCallCenters.map((c) => {
              const open = openCC === c.id;
              const teleprosOfCC = users.filter((u) => Number(u.call_center_id) === c.id && u.is_teleprospector);
              const commercials = users.filter((u) => u.is_commercial);
              return (
                <div key={c.id} style={{ border: `1px solid ${open ? PINK : "#eef1f4"}`, borderRadius: 10, overflow: "hidden" }}>
                  {/* En-tête cliquable */}
                  <button onClick={() => { setOpenCC(open ? null : c.id); setCcTele({ name: "", email: "", password: "", phone: "" }); }}
                    style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: open ? "#fff5f9" : "#f8fafc", border: "none", padding: "12px 14px", cursor: "pointer" }}>
                    <div>
                      <span style={{ fontWeight: 700, color: NAVY }}>{c.name}</span>
                      {c.agence_only && <span style={{ fontSize: 11, color: "#0891b2", background: "#ecfeff", padding: "1px 7px", borderRadius: 999, marginLeft: 8 }}>agence only</span>}
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Agence : <strong style={{ color: NAVY }}>{c.parent_name ?? c.name}</strong></div>
                    </div>
                    <div style={{ display: "flex", gap: 14, fontSize: 13, alignItems: "center" }}>
                      <div style={{ textAlign: "center" }}><div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 20, fontWeight: 700, color: "#15803d" }}>{c.commercials_count}</div><div style={{ fontSize: 11, color: "#6b7280" }}>commerciaux</div></div>
                      <div style={{ textAlign: "center" }}><div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 20, fontWeight: 700, color: "#0369a1" }}>{c.telepros_count}</div><div style={{ fontSize: 11, color: "#6b7280" }}>télépros</div></div>
                      <span style={{ color: "#9aa6b8", fontSize: 13 }}>{open ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* Détail */}
                  {open && (
                    <div style={{ padding: 14, display: "grid", gap: 16, borderTop: "1px solid #eef1f4" }}>
                      <div style={{ fontSize: 13, color: "#6b7280" }}>Responsable : <strong style={{ color: NAVY }}>{c.responsable_email || "—"}</strong></div>

                      {/* Rattacher à une agence */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Agence :</span>
                        <select value={c.parent_id ?? ""} onChange={(e) => e.target.value && setAgence(c.id, Number(e.target.value))} style={{ padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 13, background: "#fff" }}>
                          <option value="">— choisir —</option>
                          {agences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>

                      {/* Lier un commercial */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Lier un commercial</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {commercials.length === 0 && <span style={{ fontSize: 12, color: "#9aa6b8" }}>Aucun commercial créé.</span>}
                          {commercials.map((u) => {
                            const on = isAssigned(u.email, c.id);
                            return (
                              <button key={u.id} type="button" onClick={(e) => { e.stopPropagation(); toggleAssign(u, c.id, on); }} style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${on ? "#15803d" : "#cbd5e1"}`, background: on ? "#15803d" : "#fff", color: on ? "#fff" : NAVY }}>
                                {on ? `✓ ${u.name} (retirer)` : `+ Ajouter ${u.name}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Téléprospecteurs du call center */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Téléprospecteurs ({teleprosOfCC.length})</div>
                        <div style={{ display: "grid", gap: 4 }}>
                          {teleprosOfCC.length === 0 && <span style={{ fontSize: 12, color: "#9aa6b8" }}>Aucun téléprospecteur.</span>}
                          {teleprosOfCC.map((u) => (
                            <div key={u.id} style={{ fontSize: 13, color: NAVY }}>{u.name} <span style={{ color: "#9aa6b8", fontSize: 12 }}>· {u.email}{u.role === "responsable" ? " (responsable)" : ""}</span></div>
                          ))}
                        </div>
                      </div>

                      {/* Ajouter un télépro à ce call center */}
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Ajouter un téléprospecteur à {c.name}</div>
                        <input style={inp} value={ccTele.name} onChange={(e) => setCcTele({ ...ccTele, name: e.target.value })} placeholder="Nom" />
                        <input style={inp} type="email" value={ccTele.email} onChange={(e) => setCcTele({ ...ccTele, email: e.target.value })} placeholder="E-mail (login)" />
                        <input style={inp} value={ccTele.password} onChange={(e) => setCcTele({ ...ccTele, password: e.target.value })} placeholder="Mot de passe" />
                        <input style={inp} value={ccTele.phone} onChange={(e) => setCcTele({ ...ccTele, phone: e.target.value })} placeholder="Téléphone (optionnel)" />
                        <button onClick={() => addTeleproToCC(c.id)} disabled={busy || !ccTele.name.trim() || !ccTele.email.trim() || !ccTele.password.trim()} style={{ padding: 11, borderRadius: 8, border: "none", background: busy ? "#cbd5e1" : PINK, color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{busy ? "…" : "Ajouter le téléprospecteur"}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
                {u.agence_name && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>🏢 Agence : <strong style={{ color: NAVY }}>{u.agence_name}</strong></div>}
                <div style={{ fontSize: 12.5, color: "#15803d", marginTop: 2 }}>{schemeLabel(u)}</div>
              </div>
              {u.role !== "admin" && (
                <button onClick={() => del(u)} style={{ padding: "8px 10px", borderRadius: 8, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Supprimer</button>
              )}
            </div>

            {isAdmin && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                <button onClick={() => patch(u.id, { isCommercial: !u.is_commercial })} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${u.is_commercial ? "#15803d" : "#e5e7eb"}`, background: u.is_commercial ? "#f0fdf4" : "#fff", color: u.is_commercial ? "#15803d" : "#6b7280" }}>{u.is_commercial ? "✓ commercial" : "commercial"}</button>
                <button onClick={() => patch(u.id, { isTeleprospector: !u.is_teleprospector })} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${u.is_teleprospector ? "#0369a1" : "#e5e7eb"}`, background: u.is_teleprospector ? "#f0f9ff" : "#fff", color: u.is_teleprospector ? "#0369a1" : "#6b7280" }}>{u.is_teleprospector ? "✓ téléprospecteur" : "téléprospecteur"}</button>
                <button onClick={() => patch(u.id, { active: u.active === false })} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid #e5e7eb", background: "#fff", color: u.active === false ? "#15803d" : "#9aa6b8" }}>{u.active === false ? "Réactiver" : "Désactiver"}</button>
              </div>
            )}

            {/* Rémunération : éditable par l'admin et par le responsable (pour ses télépros) */}
            {(isAdmin || role === "responsable") && u.role === "collab" && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>💰 Rémunération :</span>
                <select value={currentSchemeKey(u)} onChange={(e) => patch(u.id, { schemeKey: e.target.value })} style={{ padding: "7px 10px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 13, background: "#fff" }}>
                  {currentSchemeKey(u) === "" && <option value="">{schemeLabel(u)} (personnalisé)</option>}
                  {COMMISSION_SCHEMES.map((sc) => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
                </select>
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
