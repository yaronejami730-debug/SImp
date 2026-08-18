"use client";

import { useCallback, useEffect, useState } from "react";
import { DatePicker, TimePicker } from "./Pickers";
import { INK, BG, LINE, MUTED, SOFT, WHATSAPP_GROUP, input as inputStyle, label as labelStyle, pill } from "./theme";

type Me = { email: string; name: string; role: "admin" | "telepro" };
type Appointment = {
  id: number; nom: string; prenom: string; rdv_date: string; rdv_time: string; telephone: string;
  telepro_email: string; telepro_name: string; statut: string; notes: string; created_at: string;
};
type DdeUser = { id: number; email: string; name: string; role: "admin" | "telepro"; phone: string; active: boolean };

const STATUTS: { key: string; label: string }[] = [
  { key: "a_venir", label: "À venir" },
  { key: "confirme", label: "Confirmé" },
  { key: "honore", label: "Honoré" },
  { key: "absent", label: "Absent" },
  { key: "annule", label: "Annulé" },
];

function token(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem("dde_token");
}
function headers(): Record<string, string> {
  const t = token();
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
function frDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** Message WhatsApp prêt à envoyer pour un rendez-vous. */
function waMessage(a: Appointment): string {
  const lignes = [
    "*Nouveau rendez-vous*",
    `Client : ${a.nom.toUpperCase()} ${a.prenom}`,
    `Date : ${frDate(a.rdv_date)} à ${a.rdv_time}`,
    `Téléphone : ${a.telephone}`,
    `Téléprospectrice : ${a.telepro_name || a.telepro_email}`,
  ];
  if (a.notes.trim()) lignes.push(`Commentaire : ${a.notes.trim()}`);
  return lignes.join("\n");
}

export default function DdePage() {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    try { setMe(JSON.parse(localStorage.getItem("dde_user") || "null")); } catch { setMe(null); }
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!me || !token()) return <Login onLogin={setMe} />;
  return <Espace me={me} onLogout={() => { localStorage.removeItem("dde_token"); localStorage.removeItem("dde_user"); setMe(null); }} />;
}

// ---------- Connexion ----------

function Login({ onLogin }: { onLogin: (me: Me) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/dde/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Connexion impossible.");
      localStorage.setItem("dde_token", j.token);
      localStorage.setItem("dde_user", JSON.stringify(j.user));
      onLogin(j.user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = email.trim() !== "" && password !== "" && !busy;

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", justifyContent: "center", padding: "80px 24px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.01em", color: INK, margin: "0 0 56px" }}>Connexion</h1>

        <label htmlFor="email" style={labelStyle}>E-mail</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inputStyle, marginBottom: 32 }} />

        <label htmlFor="pw" style={labelStyle}>Mot de passe</label>
        <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, marginBottom: 40 }} />

        <button type="submit" disabled={!canSubmit} style={pill(canSubmit)}>{busy ? "Connexion…" : "Se connecter"}</button>
        {err && <div style={{ marginTop: 20, fontSize: 15, fontWeight: 700, color: "#b3261e" }}>{err}</div>}
      </form>
    </div>
  );
}

// ---------- Espace connecté ----------

function Espace({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [tab, setTab] = useState<"form" | "table" | "comptes">("form");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/dde/appointments", { headers: headers() });
      const j = await r.json();
      if (r.status === 401) { onLogout(); return; }
      if (!r.ok) throw new Error(j.error || "Erreur.");
      setAppointments(j.appointments);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur.");
    }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "form", label: "Nouveau rendez-vous" },
    { key: "table", label: `Rendez-vous (${appointments.length})` },
    ...(me.role === "admin" ? [{ key: "comptes" as const, label: "Comptes" }] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: BG, padding: "40px 24px 80px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif", color: INK }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
          <div />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 14, color: MUTED }}>{me.name}{me.role === "admin" ? " (admin)" : ""}</span>
            <button onClick={onLogout} style={{ height: 36, padding: "0 16px", borderRadius: 18, border: `1px solid ${LINE}`, background: "#fff", fontSize: 14, cursor: "pointer" }}>Déconnexion</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 40, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button
              key={t.key} onClick={() => setTab(t.key)}
              style={{
                height: 44, padding: "0 22px", borderRadius: 22, fontSize: 15, fontWeight: 700, cursor: "pointer",
                border: tab === t.key ? "none" : `1px solid ${LINE}`,
                background: tab === t.key ? INK : "#fff", color: tab === t.key ? "#fff" : INK,
              }}
            >{t.label}</button>
          ))}
        </div>

        {err && <div style={{ marginBottom: 24, fontSize: 15, fontWeight: 700, color: "#b3261e" }}>{err}</div>}

        {tab === "form" && <Formulaire onSaved={() => { load(); }} />}
        {tab === "table" && <Tableau me={me} rows={appointments} reload={load} />}
        {tab === "comptes" && me.role === "admin" && <Comptes />}
      </div>
    </div>
  );
}

// ---------- Formulaire de rendez-vous ----------

function Formulaire({ onSaved }: { onSaved: () => void }) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [date, setDate] = useState("");
  const [heure, setHeure] = useState("");
  const [telephone, setTelephone] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = nom.trim() !== "" && prenom.trim() !== "" && date !== "" && heure !== "" && telephone.trim() !== "" && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/dde/appointments", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ nom, prenom, date, heure, telephone, notes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erreur.");
      setNom(""); setPrenom(""); setDate(""); setHeure(""); setTelephone(""); setNotes("");
      setConfirm(true);
      setTimeout(() => setConfirm(false), 2500);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.01em", color: INK, margin: "0 0 56px" }}>Nouveau rendez-vous</h1>

      <label htmlFor="nom" style={labelStyle}>Nom</label>
      <input id="nom" type="text" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...inputStyle, marginBottom: 32 }} />

      <label htmlFor="prenom" style={labelStyle}>Prénom</label>
      <input id="prenom" type="text" value={prenom} onChange={(e) => setPrenom(e.target.value)} style={{ ...inputStyle, marginBottom: 32 }} />

      <div style={labelStyle}>Date de rendez-vous</div>
      <div style={{ marginBottom: 32 }}><DatePicker value={date} onChange={setDate} /></div>

      <div style={labelStyle}>Heure de rendez-vous</div>
      <div style={{ marginBottom: 32 }}><TimePicker value={heure} onChange={setHeure} /></div>

      <label htmlFor="tel" style={labelStyle}>Numéro de téléphone</label>
      <input id="tel" type="tel" placeholder="06 12 34 56 78" value={telephone} onChange={(e) => setTelephone(e.target.value)} style={{ ...inputStyle, marginBottom: 32 }} />

      <label htmlFor="notes" style={labelStyle}>Commentaire <span style={{ fontWeight: 400, color: MUTED, fontSize: 15 }}>(facultatif)</span></label>
      <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, height: "auto", padding: "16px 18px", marginBottom: 40, fontFamily: "inherit", resize: "vertical" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
        <button type="submit" disabled={!canSubmit} style={pill(canSubmit)}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
        {confirm && <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>Rendez-vous enregistré.</span>}
        {err && <span style={{ fontSize: 16, fontWeight: 700, color: "#b3261e" }}>{err}</span>}
      </div>
    </form>
  );
}

// ---------- Tableau des rendez-vous ----------

const WA_GREEN = "#25D366";
const WA_DARK = "#1da851";

/** Bouton WhatsApp : ouvre WhatsApp avec les infos du rendez-vous pré-remplies. */
function BoutonWhatsApp({ appointment }: { appointment: Appointment }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title="Envoyer ce rendez-vous sur WhatsApp"
      onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(waMessage(appointment))}`, "_blank", "noopener")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 18px",
        borderRadius: 20, border: "none", cursor: "pointer",
        background: hover ? WA_DARK : WA_GREEN, color: "#fff", fontSize: 14, fontWeight: 700,
        boxShadow: hover ? "0 6px 16px rgba(37,211,102,0.35)" : "0 2px 8px rgba(37,211,102,0.25)",
        transform: hover ? "translateY(-1px)" : "none", transition: "background .15s, box-shadow .15s, transform .15s",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z"/>
        <path d="M12.04 2.5C6.79 2.5 2.53 6.76 2.53 12c0 1.68.44 3.32 1.28 4.77L2.5 21.5l4.86-1.27a9.45 9.45 0 0 0 4.68 1.22h.01c5.24 0 9.5-4.26 9.5-9.5 0-2.54-.99-4.92-2.78-6.71a9.42 9.42 0 0 0-6.73-2.74zm0 17.09h-.01a7.9 7.9 0 0 1-4.02-1.1l-.29-.17-2.88.75.77-2.81-.19-.29a7.86 7.86 0 0 1-1.21-4.2c0-4.36 3.55-7.9 7.91-7.9 2.11 0 4.1.83 5.59 2.32a7.85 7.85 0 0 1 2.31 5.59c0 4.36-3.55 7.9-7.98 7.9z"/>
      </svg>
      WhatsApp
    </button>
  );
}

function Tableau({ me, rows, reload }: { me: Me; rows: Appointment[]; reload: () => void }) {
  async function setStatut(id: number, statut: string) {
    await fetch("/api/dde/appointments", { method: "PATCH", headers: headers(), body: JSON.stringify({ id, statut }) });
    reload();
  }
  async function remove(id: number) {
    await fetch(`/api/dde/appointments?id=${id}`, { method: "DELETE", headers: headers() });
    reload();
  }

  if (!rows.length) return <div style={{ fontSize: 17, color: MUTED }}>Aucun rendez-vous enregistré pour le moment.</div>;

  // Fiches empilées : tout reste visible sans jamais défiler latéralement.
  const cle: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: MUTED, marginBottom: 4 };
  const val: React.CSSProperties = { fontSize: 16, wordBreak: "break-word" };

  return (
    <div style={{ maxWidth: "100%" }}>
      {me.role === "admin" && (
        <div style={{ marginBottom: 16 }}>
          <a href={WHATSAPP_GROUP} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: MUTED }}>Ouvrir le groupe WhatsApp</a>
        </div>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {rows.map((a) => (
          <div key={a.id} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 20, maxWidth: "100%", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${SOFT}` }}>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{frDate(a.rdv_date)}</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{a.rdv_time}</span>
              <span style={{ fontSize: 18, color: MUTED }}>{a.nom.toUpperCase()} {a.prenom}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
              <div>
                <div style={cle}>Téléphone</div>
                <div style={val}><a href={`tel:${a.telephone.replace(/\s/g, "")}`} style={{ color: INK }}>{a.telephone}</a></div>
              </div>
              {me.role === "admin" && (
                <div>
                  <div style={cle}>Téléprospectrice</div>
                  <div style={val}>{a.telepro_name || a.telepro_email}</div>
                </div>
              )}
              {a.notes.trim() && (
                <div>
                  <div style={cle}>Commentaire</div>
                  <div style={{ ...val, color: MUTED }}>{a.notes}</div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <select value={a.statut} onChange={(e) => setStatut(a.id, e.target.value)} style={{ height: 40, padding: "0 12px", borderRadius: 20, border: `1px solid ${LINE}`, background: "#fff", fontSize: 14, cursor: "pointer", maxWidth: "100%" }}>
                {STATUTS.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
              </select>
              {me.role === "admin" && <BoutonWhatsApp appointment={a} />}
              <button onClick={() => remove(a.id)} style={{ height: 40, padding: "0 16px", borderRadius: 20, border: `1px solid ${LINE}`, background: "#fff", fontSize: 14, cursor: "pointer", color: "#b3261e" }}>Supprimer</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Comptes (admin DDE) ----------

function Comptes() {
  const [users, setUsers] = useState<DdeUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/dde/users", { headers: headers() });
    const j = await r.json();
    if (r.ok) setUsers(j.users); else setErr(j.error || "Erreur.");
  }, []);
  useEffect(() => { load(); }, [load]);

  const canSubmit = name.trim() !== "" && email.trim() !== "" && password.length >= 8 && !busy;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/dde/users", { method: "POST", headers: headers(), body: JSON.stringify({ name, email, phone, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erreur.");
      setName(""); setEmail(""); setPhone(""); setPassword("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(u: DdeUser) {
    await fetch("/api/dde/users", { method: "PATCH", headers: headers(), body: JSON.stringify({ id: u.id, active: !u.active }) });
    load();
  }
  async function resetPassword(u: DdeUser) {
    const pw = window.prompt(`Nouveau mot de passe pour ${u.name} (8 caractères minimum) :`);
    if (!pw) return;
    const r = await fetch("/api/dde/users", { method: "PATCH", headers: headers(), body: JSON.stringify({ id: u.id, password: pw }) });
    const j = await r.json();
    if (!r.ok) setErr(j.error || "Erreur.");
  }
  async function remove(u: DdeUser) {
    await fetch(`/api/dde/users?id=${u.id}`, { method: "DELETE", headers: headers() });
    load();
  }

  const td: React.CSSProperties = { fontSize: 15, padding: 14, borderTop: `1px solid ${SOFT}` };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: MUTED, padding: "0 14px 12px" };

  return (
    <div style={{ display: "grid", gap: 48 }}>
      <form onSubmit={create} style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.01em", margin: "0 0 40px" }}>Nouvelle téléprospectrice</h1>

        <label htmlFor="u-name" style={labelStyle}>Nom</label>
        <input id="u-name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 32 }} />

        <label htmlFor="u-mail" style={labelStyle}>E-mail de connexion</label>
        <input id="u-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inputStyle, marginBottom: 32 }} />

        <label htmlFor="u-tel" style={labelStyle}>Téléphone <span style={{ fontWeight: 400, color: MUTED, fontSize: 15 }}>(facultatif)</span></label>
        <input id="u-tel" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...inputStyle, marginBottom: 32 }} />

        <label htmlFor="u-pw" style={labelStyle}>Mot de passe</label>
        <input id="u-pw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" style={{ ...inputStyle, marginBottom: 40 }} />

        <button type="submit" disabled={!canSubmit} style={pill(canSubmit)}>{busy ? "Création…" : "Créer le compte"}</button>
        {err && <div style={{ marginTop: 20, fontSize: 15, fontWeight: 700, color: "#b3261e" }}>{err}</div>}
      </form>

      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "20px 8px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead>
            <tr><th style={th}>Nom</th><th style={th}>E-mail</th><th style={th}>Rôle</th><th style={th}>Statut</th><th style={th}></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ ...td, fontWeight: 700 }}>{u.name}</td>
                <td style={td}>{u.email}</td>
                <td style={td}>{u.role === "admin" ? "Administrateur" : "Téléprospectrice"}</td>
                <td style={{ ...td, color: u.active ? INK : MUTED }}>{u.active ? "Actif" : "Désactivé"}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button onClick={() => resetPassword(u)} style={{ height: 34, padding: "0 12px", borderRadius: 17, border: `1px solid ${LINE}`, background: "#fff", fontSize: 13, cursor: "pointer", marginRight: 8 }}>Mot de passe</button>
                  <button onClick={() => toggle(u)} style={{ height: 34, padding: "0 12px", borderRadius: 17, border: `1px solid ${LINE}`, background: "#fff", fontSize: 13, cursor: "pointer", marginRight: 8 }}>{u.active ? "Désactiver" : "Activer"}</button>
                  {u.role !== "admin" && <button onClick={() => remove(u)} style={{ height: 34, padding: "0 12px", borderRadius: 17, border: `1px solid ${LINE}`, background: "#fff", fontSize: 13, cursor: "pointer", color: "#b3261e" }}>Supprimer</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
