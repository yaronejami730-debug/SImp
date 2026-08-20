"use client";

import { useCallback, useEffect, useState } from "react";
import { DatePicker, TimePicker } from "./Pickers";
import Cadence from "./Cadence";
import Script from "./Script";
import Outils from "./Outils";
import { estCreneauValide, HORAIRES_TEXTE } from "@/lib/dde-horaires";
import { formatMobileEnCours, mobileFR } from "@/lib/telephone-fr";
import { INFOS_CLIENT, INK, BG, LINE, MUTED, SOFT, WHATSAPP_GROUP, input as inputStyle, label as labelStyle, pill } from "./theme";

type Me = { email: string; name: string; role: "admin" | "telepro" };
type Appointment = {
  id: number; nom: string; prenom: string; rdv_date: string; rdv_time: string; telephone: string;
  telepro_email: string; telepro_name: string; saisi_par_email: string; saisi_par_name: string;
  statut: string; facturation_statut: string; callcenter_statut: string; notes: string; created_at: string;
  crit_titre_sejour: boolean | null; crit_sans_diplome: boolean | null; crit_carte_vitale: boolean | null;
  crit_sans_dossier_prefecture: boolean | null; crit_moins_60_ans: boolean | null;
  whatsapp_sent_at: string | null; invoiced_at: string | null; callcenter_paid_at: string | null;
};
type DdeAcces = { ascLogin: string; ascPassword: string; ringoverLogin: string; ringoverPassword: string };
type DdeUser = { id: number; email: string; name: string; role: "admin" | "telepro"; phone: string; active: boolean; acces?: DdeAcces };

/** Statut unique du rendez-vous. Seul « honoré » ouvre la facturation et le paiement du call center. */
const STATUTS: { key: string; label: string }[] = [
  { key: "a_venir", label: "À venir" },
  { key: "honore", label: "Rendez-vous honoré" },
  { key: "absent", label: "Rendez-vous absent" },
  { key: "annule", label: "Rendez-vous annulé" },
  { key: "deplace", label: "Rendez-vous déplacé" },
  { key: "non_eligible", label: "Pas éligible" },
];

/** Facturation de l'entreprise cliente (argent entrant). Dernière étape = dossier clos. */
const FACTURATION: { key: string; label: string }[] = [
  { key: "a_facturer", label: "À facturer" },
  { key: "edition", label: "Édition de la facture" },
  { key: "facturee", label: "Facture envoyée" },
  { key: "encaissee", label: "Encaissée" },
];

/** Facture du call center puis son paiement (argent sortant). Dernière étape = dossier clos. */
const CALLCENTER: { key: string; label: string }[] = [
  { key: "appel_facture", label: "Appel à facturation" },
  { key: "facture_recue", label: "Facture reçue" },
  { key: "paye", label: "Payé" },
];

/** Critères posés pendant l'appel : éligible = chaque réponse égale la réponse attendue. */
const CRITERES = [
  { key: "crit_titre_sejour", question: "Avez-vous un titre de séjour valide ?", attendu: true },
  { key: "crit_sans_diplome", question: "Avez-vous un diplôme ?", attendu: false },
  { key: "crit_carte_vitale", question: "Avez-vous une carte Vitale ?", attendu: true },
  { key: "crit_sans_dossier_prefecture", question: "Avez-vous un dossier en cours à la préfecture ?", attendu: false },
  { key: "crit_moins_60_ans", question: "Avez-vous moins de 60 ans ?", attendu: true },
] as const;
type CritereKey = (typeof CRITERES)[number]["key"];

/** Critères manqués d'un rendez-vous : réponse différente de celle attendue. */
function critereRates(a: Appointment): string[] {
  return CRITERES.filter((c) => typeof a[c.key] === "boolean" && a[c.key] !== c.attendu).map((c) => c.question);
}

/** Durée d'un rendez-vous, utilisée pour savoir s'il est en train de se dérouler. */
const DUREE_RDV_MIN = 30;

/** Position du rendez-vous dans le temps, indépendante du statut commercial. */
function moment(a: Appointment, maintenant: number): "avenir" | "encours" | "passe" {
  const [y, m, d] = a.rdv_date.split("-").map(Number);
  const [h, min] = a.rdv_time.replace("h", ":").split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(h)) return "avenir";
  const debut = new Date(y, m - 1, d, h, min || 0).getTime();
  if (maintenant < debut) return "avenir";
  return maintenant < debut + DUREE_RDV_MIN * 60_000 ? "encours" : "passe";
}

const MOMENT_LABEL: Record<string, string> = { avenir: "À venir", encours: "En cours", passe: "Passé" };

/** Comparaison souple : sans accents, sans casse, sans espaces parasites. */
function normalise(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const libelle = (liste: { key: string; label: string }[], key: string) => liste.find((x) => x.key === key)?.label ?? key;
const estClos = (liste: { key: string; label: string }[], key: string) => liste[liste.length - 1].key === key;

function libelleStatut(key: string): string {
  return STATUTS.find((st) => st.key === key)?.label ?? key;
}

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
    `Telepro : ${a.telepro_name || a.telepro_email}`,
  ];
  if (a.notes.trim()) lignes.push(`Commentaire : ${a.notes.trim()}`);
  return lignes.join("\n");
}

/** Responsive : tableau classique sur écran large, fiches empilées sur mobile. */
const CSS_RESPONSIVE = `
  .dde-wrap { padding: 40px 24px 80px; }
  .dde-table tr.dde-encours td { background: #fdf6e3; }
  .dde-table tr.dde-encours td:first-child { box-shadow: inset 3px 0 0 ${INK}; }
  @keyframes dde-respire { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
  .dde-badge-encours { animation: dde-respire 2s ease-in-out infinite; }
  .dde-date-cell { justify-content: flex-start; }
  @media (prefers-reduced-motion: reduce) { .dde-badge-encours { animation: none; } }
  .dde-card { padding: 20px 12px; }
  @media (max-width: 860px) {
    .dde-wrap { padding: 24px 14px 60px; }
    .dde-card { padding: 12px; border: none !important; background: transparent !important; }
    .dde-table thead { display: none; }
    .dde-table, .dde-table tbody, .dde-table tr, .dde-table td { display: block; width: 100%; }
    .dde-table { min-width: 0 !important; }
    .dde-card { overflow-x: visible !important; }
    .dde-table tr { background: #fff; border: 1px solid ${LINE}; border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; }
    .dde-table tr.dde-encours { border-color: ${INK}; }
    .dde-table tr.dde-encours td { background: transparent; }
    .dde-table tr.dde-encours td:first-child { box-shadow: none; }
    .dde-date-cell { justify-content: flex-end !important; }
    .dde-table td { border-top: none !important; padding: 7px 0 !important; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    .dde-table td + td { border-top: 1px solid ${SOFT} !important; }
    .dde-table td::before {
      content: attr(data-label);
      font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: ${MUTED};
    }
  }
`;

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
    <div style={{ minHeight: "100vh", background: BG, display: "flex", justifyContent: "center", padding: "clamp(32px, 10vw, 80px) 20px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" }}>
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
  const [version, setVersion] = useState(0); // incrémenté à chaque saisie : la cadence se remet à jour
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
    <div className="dde-wrap" style={{ minHeight: "100vh", background: BG, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif", color: INK }}>
      <style dangerouslySetInnerHTML={{ __html: CSS_RESPONSIVE }} />
      <div style={{ maxWidth: tab === "table" ? 1500 : 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
          <div />
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: MUTED }}>{me.name}{me.role === "admin" ? " (admin)" : ""}</span>
            <Script />
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

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}><Outils /></div>

        {tab !== "comptes" && <Cadence me={me} version={version} />}

        {err && <div style={{ marginBottom: 24, fontSize: 15, fontWeight: 700, color: "#b3261e" }}>{err}</div>}

        {tab === "form" && <Formulaire me={me} onSaved={() => { load(); setVersion((v) => v + 1); }} />}
        {tab === "table" && <Tableau me={me} rows={appointments} reload={load} />}
        {tab === "comptes" && me.role === "admin" && <Comptes />}
      </div>
    </div>
  );
}

// ---------- Formulaire de rendez-vous ----------

function Formulaire({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [date, setDate] = useState("");
  const [heure, setHeure] = useState("");
  const [telephone, setTelephone] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Réponses aux critères d'éligibilité : undefined tant que la question n'a pas été posée.
  const [criteres, setCriteres] = useState<Partial<Record<CritereKey, boolean>>>({});
  const tousRepondus = CRITERES.every((c) => typeof criteres[c.key] === "boolean");
  const critereRate = CRITERES.some((c) => typeof criteres[c.key] === "boolean" && criteres[c.key] !== c.attendu);

  // L'admin peut saisir un RDV à la place d'une téléprospectrice : le RDV lui est alors rattaché.
  const [teleproEmail, setTeleproEmail] = useState(me.email);
  const [teleproOptions, setTeleproOptions] = useState<DdeUser[]>([]);
  useEffect(() => {
    if (me.role !== "admin") return;
    (async () => {
      const r = await fetch("/api/dde/users", { headers: headers() });
      const j = await r.json();
      if (r.ok) setTeleproOptions((j.users as DdeUser[]).filter((u) => u.active));
    })();
  }, [me.role]);

  const telephoneValide = mobileFR(telephone) !== null;
  const canSubmit = nom.trim() !== "" && prenom.trim() !== "" && date !== "" && heure !== "" && telephoneValide && tousRepondus && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/dde/appointments", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ nom, prenom, date, heure, telephone, notes, teleproEmail, criteres }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erreur.");
      setNom(""); setPrenom(""); setDate(""); setHeure(""); setTelephone(""); setNotes(""); setTeleproEmail(me.email); setCriteres({});
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
      <div style={{ marginBottom: 32 }}>
        <DatePicker
          value={date}
          onChange={(iso) => {
            setDate(iso);
            // Les horaires changent le vendredi : on oublie une heure devenue impossible.
            if (heure && !estCreneauValide(iso, heure)) setHeure("");
          }}
        />
      </div>

      <div style={labelStyle}>Heure de rendez-vous</div>
      <div style={{ marginBottom: 32 }}>
        <TimePicker value={heure} onChange={setHeure} date={date} />
        <div style={{ marginTop: 10, fontSize: 14, color: MUTED }}>{HORAIRES_TEXTE}</div>
      </div>

      <div style={{ marginBottom: 32, padding: "6px 18px", borderRadius: 12, background: SOFT, fontSize: 15, lineHeight: 1.5 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: MUTED, padding: "12px 0 4px" }}>
          À donner au client s’il pose la question
        </div>
        {INFOS_CLIENT.map((info, i) => (
          <div key={info.titre} style={{ padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${LINE}33` }}>
            <strong>{info.titre}</strong><br />
            {info.valeur}
          </div>
        ))}
      </div>

      <label htmlFor="tel" style={labelStyle}>Numéro de téléphone</label>
      <input
        id="tel" type="tel" inputMode="tel" placeholder="06 12 34 56 78"
        value={telephone}
        onChange={(e) => setTelephone(formatMobileEnCours(e.target.value))}
        style={{ ...inputStyle, marginBottom: telephone && !telephoneValide ? 10 : 32 }}
      />
      {telephone && !telephoneValide && (
        <div style={{ fontSize: 14, color: MUTED, marginBottom: 32 }}>
          Mobile français attendu : 10 chiffres commençant par 06 ou 07.
        </div>
      )}

      {me.role === "admin" && (
        <>
          <label htmlFor="telepro" style={labelStyle}>Rendez-vous pris par</label>
          <select
            id="telepro" value={teleproEmail} onChange={(e) => setTeleproEmail(e.target.value)}
            style={{ ...inputStyle, marginBottom: 32, cursor: "pointer" }}
          >
            <option value={me.email}>{me.name} (moi)</option>
            {teleproOptions
              .filter((u) => u.email.toLowerCase() !== me.email.toLowerCase())
              .map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
          </select>
        </>
      )}

      <div style={labelStyle}>Éligibilité</div>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: "#fff", padding: "6px 18px", marginBottom: critereRate ? 16 : 32 }}>
        {CRITERES.map((c, i) => (
          <div
            key={c.key}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
              padding: "14px 0", borderTop: i === 0 ? "none" : `1px solid ${SOFT}`,
            }}
          >
            <span style={{ fontSize: 16 }}>{c.question}</span>
            <div style={{ display: "flex", gap: 8 }}>
              {[true, false].map((v) => {
                const actif = criteres[c.key] === v;
                return (
                  <button
                    key={String(v)} type="button"
                    onClick={() => setCriteres((p) => ({ ...p, [c.key]: v }))}
                    style={{
                      height: 36, padding: "0 18px", borderRadius: 18, fontSize: 14, fontWeight: 700, cursor: "pointer",
                      border: actif ? "none" : `1px solid ${LINE}`,
                      background: actif ? INK : "#fff", color: actif ? "#fff" : MUTED,
                    }}
                  >{v ? "Oui" : "Non"}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {critereRate && (
        <div style={{ marginBottom: 32, padding: "14px 18px", borderRadius: 12, background: SOFT, fontSize: 15, lineHeight: 1.5 }}>
          <strong>Profil non éligible.</strong> Le rendez-vous sera enregistré avec le statut « Pas éligible ».
        </div>
      )}

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

/** Où en est le rendez-vous dans le temps : à venir, en cours (surligné), passé. */
function MomentRdv({ etat }: { etat: "avenir" | "encours" | "passe" }) {
  const style: React.CSSProperties = {
    display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap",
  };
  if (etat === "encours") {
    return <span className="dde-badge-encours" style={{ ...style, border: "none", background: INK, color: "#fff" }}>En cours</span>;
  }
  if (etat === "passe") {
    return <span style={{ ...style, border: `1px solid ${SOFT}`, background: SOFT, color: MUTED }}>Passé</span>;
  }
  return <span style={{ ...style, border: `1px solid ${LINE}`, background: "#fff", color: MUTED }}>À venir</span>;
}

/** Pastille en lecture seule (vue téléprospectrice) : étape atteinte. */
function Badge({ liste, valeur }: { liste: { key: string; label: string }[]; valeur: string }) {
  const clos = estClos(liste, valeur);
  return (
    <span
      style={{
        display: "inline-block", padding: "6px 14px", borderRadius: 16, fontSize: 13, fontWeight: 700,
        whiteSpace: "nowrap",
        border: clos ? "none" : `1px solid ${LINE}`,
        background: clos ? INK : "#fff", color: clos ? "#fff" : MUTED,
      }}
    >{clos ? `✓ ${libelle(liste, valeur)}` : libelle(liste, valeur)}</span>
  );
}

/** Sélecteur d'étape (admin) : l'étape finale passe en plein pour montrer que le dossier est clos. */
function Etape({ liste, valeur, onChange }: { liste: { key: string; label: string }[]; valeur: string; onChange: (v: string) => void }) {
  const clos = estClos(liste, valeur);
  return (
    <select
      value={valeur} onChange={(e) => onChange(e.target.value)}
      style={{
        height: 34, padding: "0 10px", borderRadius: 17, fontSize: 13, fontWeight: 700, cursor: "pointer",
        minWidth: 190, maxWidth: "100%",
        border: clos ? "none" : `1px solid ${LINE}`,
        background: clos ? INK : "#fff", color: clos ? "#fff" : INK,
      }}
    >
      {liste.map((x) => <option key={x.key} value={x.key} style={{ background: "#fff", color: INK }}>{x.label}</option>)}
    </select>
  );
}

/** Petit « ? » d'aide : explique la colonne au survol. */
function Aide({ texte }: { texte: string }) {
  return (
    <span
      title={texte}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16,
        marginLeft: 6, borderRadius: 8, border: `1px solid ${LINE}`, color: MUTED,
        fontSize: 11, fontWeight: 700, cursor: "help", verticalAlign: "middle",
      }}
    >?</span>
  );
}

/** Bouton WhatsApp : ouvre WhatsApp avec les infos du RDV, puis marque la ligne « Envoyé ». */
function BoutonWhatsApp({ appointment, onSent }: { appointment: Appointment; onSent: () => void }) {
  const envoye = !!appointment.whatsapp_sent_at;
  return (
    <button
      type="button"
      title={envoye ? "Renvoyer sur WhatsApp" : "Envoyer sur WhatsApp"}
      onClick={() => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(waMessage(appointment))}`, "_blank", "noopener");
        onSent();
      }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 16,
        border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
        background: envoye ? INK : WA_GREEN, color: "#fff",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z"/>
        <path d="M12.04 2.5C6.79 2.5 2.53 6.76 2.53 12c0 1.68.44 3.32 1.28 4.77L2.5 21.5l4.86-1.27a9.45 9.45 0 0 0 4.68 1.22h.01c5.24 0 9.5-4.26 9.5-9.5 0-2.54-.99-4.92-2.78-6.71a9.42 9.42 0 0 0-6.73-2.74zm0 17.09h-.01a7.9 7.9 0 0 1-4.02-1.1l-.29-.17-2.88.75.77-2.81-.19-.29a7.86 7.86 0 0 1-1.21-4.2c0-4.36 3.55-7.9 7.91-7.9 2.11 0 4.1.83 5.59 2.32a7.85 7.85 0 0 1 2.31 5.59c0 4.36-3.55 7.9-7.98 7.9z"/>
      </svg>
      {envoye ? "Envoyé" : "WhatsApp"}
    </button>
  );
}

function Tableau({ me, rows, reload }: { me: Me; rows: Appointment[]; reload: () => void }) {
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [filtreTelepro, setFiltreTelepro] = useState("");
  const [maintenant, setMaintenant] = useState(() => Date.now());

  // « En cours » ne dure qu'une demi-heure : l'affichage doit suivre tout seul.
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Liste des telepros apparaissant dans les rendez-vous, pour le filtre.
  const telepros = [...new Map(rows.map((a) => [a.telepro_email.toLowerCase(), a.telepro_name || a.telepro_email])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));

  // Recherche sur tout ce qui est lisible dans la ligne : client, téléphone, date, telepro, statuts, commentaire.
  const termes = normalise(q).split(" ").filter(Boolean);
  const filtrees = filtreTelepro ? rows.filter((a) => a.telepro_email.toLowerCase() === filtreTelepro) : rows;
  const visibles = termes.length === 0 ? filtrees : filtrees.filter((a) => {
    const foin = normalise([
      a.nom, a.prenom, a.telephone, a.telephone.replace(/\s/g, ""), a.rdv_date, frDate(a.rdv_date), a.rdv_time,
      a.telepro_name, a.telepro_email, a.saisi_par_name,
      libelleStatut(a.statut), libelle(FACTURATION, a.facturation_statut), libelle(CALLCENTER, a.callcenter_statut),
      critereRates(a).length === 0 ? "eligible" : `non eligible ${critereRates(a).join(" ")}`,
      MOMENT_LABEL[moment(a, maintenant)],
      a.notes,
    ].join(" "));
    return termes.every((t) => foin.includes(t));
  });

  async function patch(id: number, body: Record<string, unknown>) {
    const r = await fetch("/api/dde/appointments", { method: "PATCH", headers: headers(), body: JSON.stringify({ id, ...body }) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error || "Modification impossible.");
    } else {
      setErr("");
    }
    reload();
  }
  async function remove(id: number) {
    await fetch(`/api/dde/appointments?id=${id}`, { method: "DELETE", headers: headers() });
    reload();
  }

  if (!rows.length) return <div style={{ fontSize: 17, color: MUTED }}>Aucun rendez-vous enregistré pour le moment.</div>;

  const champRecherche = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
      <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 420 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2.4" strokeLinecap="round"
             style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-4.2-4.2" />
        </svg>
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un client, un téléphone, une date…"
          aria-label="Rechercher un rendez-vous"
          style={{ width: "100%", boxSizing: "border-box", height: 44, padding: "0 16px 0 42px", fontSize: 15, border: `1px solid ${LINE}`, borderRadius: 22, background: "#fff", color: INK }}
        />
      </div>
      {telepros.length > 1 && (
        <select
          value={filtreTelepro} onChange={(e) => setFiltreTelepro(e.target.value)}
          aria-label="Filtrer par telepro"
          style={{ height: 44, padding: "0 14px", borderRadius: 22, border: `1px solid ${LINE}`, background: "#fff", fontSize: 14, fontWeight: 700, color: INK, cursor: "pointer", maxWidth: 240 }}
        >
          <option value="">Toutes les telepros</option>
          {telepros.map(([email, nom]) => <option key={email} value={email}>{nom}</option>)}
        </select>
      )}

      <span style={{ fontSize: 14, color: MUTED }}>
        {termes.length === 0 && !filtreTelepro
          ? `${rows.length} rendez-vous`
          : `${visibles.length} résultat${visibles.length > 1 ? "s" : ""} sur ${rows.length}`}
      </span>
    </div>
  );

  const th: React.CSSProperties = { textAlign: "left", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: MUTED, padding: "0 14px 12px", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: 14, padding: "14px", borderTop: `1px solid ${SOFT}`, verticalAlign: "middle" };

  return (
    <div style={{ maxWidth: "100%" }}>
      {me.role === "admin" && (
        <div style={{ marginBottom: 16 }}>
          <a href={WHATSAPP_GROUP} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: MUTED }}>Ouvrir le groupe WhatsApp</a>
        </div>
      )}

      {champRecherche}

      {err && <div style={{ marginBottom: 16, fontSize: 15, fontWeight: 700, color: "#b3261e" }}>{err}</div>}

      <div className="dde-card" style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, maxWidth: "100%", overflowX: "auto" }}>
        <table className="dde-table" style={{ width: "100%", minWidth: 1320, borderCollapse: "collapse", tableLayout: "auto" }}>
          <thead>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Heure</th>
              <th style={th}>Client</th>
              <th style={th}>Téléphone</th>
              <th style={th}>Telepro</th>
              <th style={th}>
                Éligibilité
                <Aide texte="Réponses données pendant l'appel : titre de séjour valide, pas de diplôme, carte Vitale, pas de dossier en préfecture, moins de 60 ans." />
              </th>
              <th style={th}>Statut</th>
              {me.role === "admin" && <th style={th}>WhatsApp</th>}
              <th style={{ ...th, textAlign: "center" }}>
                Facturation client
                <Aide texte="Facture envoyée à l'entreprise pour laquelle nous travaillons (argent qui entre) : à facturer, édition de la facture, facture envoyée, encaissée." />
              </th>
              <th style={{ ...th, textAlign: "center" }}>
                {me.role === "admin" ? "Rémunération call center" : "Ma rémunération"}
                <Aide texte="Facture du call center puis son paiement (argent qui sort) : appel à facturation, facture reçue, payé." />
              </th>
              {me.role === "admin" && <th style={th} />}
            </tr>
          </thead>
          <tbody>
            {visibles.map((a) => (
              <tr key={a.id} title={a.notes || undefined} className={moment(a, maintenant) === "encours" ? "dde-encours" : undefined}>
                <td data-label="Date" style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }} className="dde-date-cell">
                    <span>{frDate(a.rdv_date)}</span>
                    <MomentRdv etat={moment(a, maintenant)} />
                  </div>
                </td>
                <td data-label="Heure" style={{ ...td, whiteSpace: "nowrap" }}>{a.rdv_time}</td>
                <td data-label="Client" style={td}>{a.nom.toUpperCase()} {a.prenom}</td>
                <td data-label="Téléphone" style={td}><a href={`tel:${a.telephone.replace(/\s/g, "")}`} style={{ color: INK, whiteSpace: "nowrap" }}>{a.telephone}</a></td>
                <td data-label="Telepro" style={td}>
                  <div style={{ textAlign: "right" }}>
                    {a.telepro_name || a.telepro_email}
                    {a.saisi_par_email && a.saisi_par_email.toLowerCase() !== a.telepro_email.toLowerCase() && (
                      <div style={{ fontSize: 12, color: MUTED }}>saisi par {a.saisi_par_name || a.saisi_par_email}</div>
                    )}
                  </div>
                </td>
                <td data-label="Éligibilité" style={td}>
                  {(() => {
                    const rates = critereRates(a);
                    const renseigne = CRITERES.some((c) => typeof a[c.key] === "boolean");
                    if (!renseigne) return <span style={{ color: MUTED }} title="Rendez-vous saisi avant l'ajout des critères.">Non renseignée</span>;
                    return rates.length === 0
                      ? <span style={{ display: "inline-block", padding: "6px 14px", borderRadius: 16, background: INK, color: "#fff", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>✓ 5/5</span>
                      : <span
                          title={`Critères manqués :\n— ${rates.join("\n— ")}`}
                          style={{ display: "inline-block", padding: "6px 14px", borderRadius: 16, border: `1px solid ${LINE}`, color: MUTED, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", cursor: "help" }}
                        >{5 - rates.length}/5</span>;
                  })()}
                </td>
                <td data-label="Statut" style={td}>
                  {me.role === "admin" ? (
                    <select value={a.statut} onChange={(e) => patch(a.id, { statut: e.target.value })} style={{ height: 34, padding: "0 10px", borderRadius: 17, border: `1px solid ${LINE}`, background: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", minWidth: 190, maxWidth: "100%" }}>
                      {STATUTS.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontWeight: 700 }}>{libelleStatut(a.statut)}</span>
                  )}
                </td>
                {me.role === "admin" && (
                  <td data-label="WhatsApp" style={td}>
                    <BoutonWhatsApp appointment={a} onSent={() => patch(a.id, { whatsappSent: true })} />
                  </td>
                )}
                <td data-label="Facturation client" style={{ ...td, textAlign: "center" }}>
                  {a.statut !== "honore" ? (
                    <span style={{ color: MUTED }} title="Seul un rendez-vous honoré se facture.">Sans objet</span>
                  ) : me.role === "admin" ? (
                    <Etape liste={FACTURATION} valeur={a.facturation_statut} onChange={(v) => patch(a.id, { facturationStatut: v })} />
                  ) : (
                    <Badge liste={FACTURATION} valeur={a.facturation_statut} />
                  )}
                </td>
                <td data-label={me.role === "admin" ? "Rémunération call center" : "Ma rémunération"} style={{ ...td, textAlign: "center" }}>
                  {a.statut !== "honore" ? (
                    <span style={{ color: MUTED }} title="Rien à payer : le rendez-vous n'a pas été honoré.">Sans objet</span>
                  ) : me.role === "admin" ? (
                    <Etape liste={CALLCENTER} valeur={a.callcenter_statut} onChange={(v) => patch(a.id, { callcenterStatut: v })} />
                  ) : (
                    <Badge liste={CALLCENTER} valeur={a.callcenter_statut} />
                  )}
                </td>
                {me.role === "admin" && (
                  <td data-label="" style={td}>
                    <button onClick={() => remove(a.id)} title="Supprimer le rendez-vous" style={{ height: 32, width: 32, borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff", fontSize: 14, cursor: "pointer", color: MUTED }}>✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {visibles.length === 0 && (
          <div style={{ padding: "28px 14px", textAlign: "center", fontSize: 15, color: MUTED }}>
            Aucun rendez-vous ne correspond{q.trim() ? ` à « ${q.trim()} »` : ""}
            {filtreTelepro ? " pour cette telepro" : ""}.
          </div>
        )}
      </div>
    </div>
  );
}

/** Accès outils d'un compte : l'admin saisit, la personne concernée les retrouve derrière l'œil. */
function EditeurAcces({ user, onSaved }: { user: DdeUser; onSaved: () => void }) {
  const [a, setA] = useState<DdeAcces>(user.acces ?? { ascLogin: "", ascPassword: "", ringoverLogin: "", ringoverPassword: "" });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  async function enregistrer() {
    setBusy(true); setOk(false);
    await fetch("/api/dde/users", { method: "PATCH", headers: headers(), body: JSON.stringify({ id: user.id, ...a }) });
    setBusy(false); setOk(true);
    setTimeout(() => setOk(false), 2000);
    onSaved();
  }

  const champ: React.CSSProperties = { ...inputStyle, height: 42, fontSize: 14, marginBottom: 0 };
  const legende: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 6, display: "block" };

  return (
    <div style={{ background: SOFT, borderRadius: 12, padding: 16, display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div>
          <span style={legende}>AS Classicall — identifiant</span>
          <input value={a.ascLogin} onChange={(e) => setA({ ...a, ascLogin: e.target.value })} style={champ} autoComplete="off" />
        </div>
        <div>
          <span style={legende}>AS Classicall — mot de passe</span>
          <input value={a.ascPassword} onChange={(e) => setA({ ...a, ascPassword: e.target.value })} style={champ} autoComplete="off" />
        </div>
        <div>
          <span style={legende}>Ringover — identifiant</span>
          <input value={a.ringoverLogin} onChange={(e) => setA({ ...a, ringoverLogin: e.target.value })} style={champ} autoComplete="off" />
        </div>
        <div>
          <span style={legende}>Ringover — mot de passe</span>
          <input value={a.ringoverPassword} onChange={(e) => setA({ ...a, ringoverPassword: e.target.value })} style={champ} autoComplete="off" />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          type="button" onClick={enregistrer} disabled={busy}
          style={{ height: 38, padding: "0 20px", borderRadius: 19, border: "none", background: INK, color: "#fff", fontSize: 14, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}
        >{busy ? "Enregistrement…" : "Enregistrer les accès"}</button>
        {ok && <span style={{ fontSize: 14, fontWeight: 700 }}>Accès enregistrés.</span>}
        <span style={{ fontSize: 13, color: MUTED }}>Chiffrés en base, visibles seulement par {user.name || user.email}.</span>
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
  const [accesOuvert, setAccesOuvert] = useState<number | null>(null);

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
  const bouton: React.CSSProperties = { height: 34, padding: "0 12px", borderRadius: 17, border: `1px solid ${LINE}`, background: "#fff", fontSize: 13, cursor: "pointer", marginRight: 8 };

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

      <div className="dde-card" style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, maxWidth: "100%", overflowX: "hidden" }}>
        <table className="dde-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr><th style={th}>Nom</th><th style={th}>E-mail</th><th style={th}>Rôle</th><th style={th}>Statut</th><th style={th}></th></tr>
          </thead>
          <tbody>
            {users.flatMap((u) => [
              <tr key={u.id}>
                <td data-label="Nom" style={{ ...td, fontWeight: 700 }}>{u.name}</td>
                <td data-label="E-mail" style={{ ...td, wordBreak: "break-word" }}>{u.email}</td>
                <td data-label="Rôle" style={td}>{u.role === "admin" ? "Administrateur" : "Téléprospectrice"}</td>
                <td data-label="Statut" style={{ ...td, color: u.active ? INK : MUTED }}>{u.active ? "Actif" : "Désactivé"}</td>
                <td data-label="" style={{ ...td, whiteSpace: "nowrap" }}>
                  <button onClick={() => setAccesOuvert((v) => (v === u.id ? null : u.id))} style={{ ...bouton, background: accesOuvert === u.id ? INK : "#fff", color: accesOuvert === u.id ? "#fff" : INK, borderColor: accesOuvert === u.id ? INK : LINE }}>Accès outils</button>
                  <button onClick={() => resetPassword(u)} style={bouton}>Mot de passe</button>
                  <button onClick={() => toggle(u)} style={bouton}>{u.active ? "Désactiver" : "Activer"}</button>
                  {u.role !== "admin" && <button onClick={() => remove(u)} style={{ ...bouton, marginRight: 0, color: "#b3261e" }}>Supprimer</button>}
                </td>
              </tr>,
              accesOuvert === u.id && (
                <tr key={`${u.id}-acces`}>
                  <td colSpan={5} style={{ ...td, padding: "0 14px 14px" }}>
                    <EditeurAcces user={u} onSaved={load} />
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}
