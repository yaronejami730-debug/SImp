"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import Sidebar from "@/components/layout/Sidebar";
import { authHeaders, getUser, setAuth } from "@/lib/client";
import { PageHeader, Card, Badge, Field, champ, T, R, S, DateRange } from "@/components/ui";


type User = {
  id: number; email: string; name: string; role: "admin" | "responsable" | "collab";
  is_commercial?: boolean; is_teleprospector?: boolean; phone?: string; active?: boolean;
  commission_base?: number; commission_pct?: number;
  call_center_id?: number; agence_name?: string; call_center_name?: string; username?: string; last_seen_at?: string | null;
  auto_assign?: boolean;
};
type CallCenter = { id: number; name: string; slug?: string | null; agence_only: boolean; responsable_email: string; responsable_email_2?: string | null; parent_id: number | null; parent_name: string | null; commercials_count: number; telepros_count: number; brand_primary?: string; brand_dark?: string; logo_url?: string; header_dark?: boolean; active?: boolean; pay_base_eur: number; pay_pct_nego: number };
type Assignment = { call_center_id: number; commercial_email: string };
type TeleproAssignment = { telepro_email: string; commercial_email: string; priority: number };
type Accord = { id: number; call_center_id: number | null; commercial_email: string; payee_email: string; payee_kind: string; base_eur: number; pct_nego: number; trigger_kind: string };
type Platform = { id: number; name: string; active: boolean };
/** Affiliation d'un téléprospecteur (voir /api/accords-telepro) : plateforme OU commercial précis. */
type AffiliationAccord = {
  id: number; commercial_email: string; platform: string | null; payee_email: string;
  base_eur: string; pct_nego: string; sold_eur: string; sold_pct: string; sold_pct_base: "negocie" | "plusvalue"; trigger_kind: string;
  commercial_name: string | null; telepro_name: string | null;
};
type TeleproEarning = { email: string; name: string; callCenter: string; base: number; pct: number; rdv: number; signes: number; du: number; paye: number; solde: number };
type TimeOff = { id: number; start_date: string; end_date: string; label: string };
type Delegation = { id: number; delegate_email: string; delegate_name: string; start_date: string; end_date: string };
type VacationRow = { email: string; name: string; timeOff: TimeOff[]; delegations: Delegation[] };

const inp: React.CSSProperties = { ...champ };

const legendeSection: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: T.ink3, marginBottom: 8,
};

/** Fenêtre modale simple : titre, contenu, fermeture au clic extérieur ou avec Échap. */
function Fenetre({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFermer]);

  return (
    <div onClick={onFermer} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(26,26,26,0.35)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: T.surface, borderRadius: R.lg, padding: S.lg, boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S.md, marginBottom: S.lg }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>{titre}</h2>
          <button onClick={onFermer} aria-label="Fermer" style={{ height: 32, width: 32, borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2, fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Comptes() {
  const [users, setUsers] = useState<User[]>([]);
  const [role, setRole] = useState<"admin" | "responsable" | "collab">("collab");
  const [callCenters, setCallCenters] = useState<CallCenter[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teleproAssignments, setTeleproAssignments] = useState<TeleproAssignment[]>([]);
  const [accords, setAccords] = useState<Accord[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [affiliations, setAffiliations] = useState<AffiliationAccord[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<{ kind: "agence" | "cc" | "utilisateurs"; id: number } | null>(null);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [recapOuvert, setRecapOuvert] = useState(false);
  const [teleproEarnings, setTeleproEarnings] = useState<TeleproEarning[] | null>(null);
  const [recapBusy, setRecapBusy] = useState(false);
  const [vacationsOuvert, setVacationsOuvert] = useState(false);
  const [vacationsBusy, setVacationsBusy] = useState(false);
  const [vacationRows, setVacationRows] = useState<VacationRow[] | null>(null);
  const [vacationCommercials, setVacationCommercials] = useState<{ email: string; name: string }[]>([]);
  const [delegatePick, setDelegatePick] = useState<Record<string, string>>({}); // email du commercial -> délégué choisi
  const [delegateDates, setDelegateDates] = useState<Record<string, { start: string; end: string }>>({});
  const [roleModalUser, setRoleModalUser] = useState<User | null>(null);
  const [assignModalUser, setAssignModalUser] = useState<User | null>(null);
  const [affModalUser, setAffModalUser] = useState<User | null>(null);
  const [affModalKind, setAffModalKind] = useState<"none" | "platform" | "commercial">("none");
  const [affModalPlatform, setAffModalPlatform] = useState("");
  const [affModalCommercial, setAffModalCommercial] = useState("");
  const [affModalBase, setAffModalBase] = useState(0);
  const [affModalPct, setAffModalPct] = useState(0);
  const [affModalTrigger, setAffModalTrigger] = useState<"signed" | "honored">("signed");
  const [affModalBusy, setAffModalBusy] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(true); // envoyer le mail "compte prêt" à la création
  const [showInactive, setShowInactive] = useState(false); // "Supprimer" désactive (historique gardé) -> masqué par défaut
  const [lierCommercialQuery, setLierCommercialQuery] = useState<string | null>(null); // null = picker fermé
  // Aperçu live des couleurs de marque (Réglages > agence) — mêmes valeurs que noeud tant que
  // rien n'est modifié, mais suit chaque changement de couleur AVANT d'enregistrer.
  const [previewPrimary, setPreviewPrimary] = useState("#DB407A");
  const [previewDark, setPreviewDark] = useState("#1a273a");
  const [previewHeaderDark, setPreviewHeaderDark] = useState(false);
  // Mini-form "ajouter un télépro à CE call center"

  const [type, setType] = useState<"commercial" | "telepro" | "callcenter" | "admin">("commercial");
  // Compte commercial / télépro — RIEN par défaut, c'est l'admin qui fixe chaque montant.
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [commBase, setCommBase] = useState(0); // barème du commercial créé (€ fixe / RDV + % négo)
  const [commPct, setCommPct] = useState(0);
  const [teleBase, setTeleBase] = useState(0); // barème par défaut du télépro créé — fallback sans affiliation
  const [telePct, setTelePct] = useState(0);
  const [attachCC, setAttachCC] = useState<number>(1); // rattachement du nouveau compte (agence / call center)
  // Affiliation du télépro créé (voir /api/accords-telepro) : aucune / plateforme / commercial précis.
  const [affKind, setAffKind] = useState<"none" | "platform" | "commercial">("none");
  const [affPlatform, setAffPlatform] = useState("");
  const [affCommercial, setAffCommercial] = useState("");
  const [affBase, setAffBase] = useState(0);
  const [affPct, setAffPct] = useState(0);
  const [affTrigger, setAffTrigger] = useState<"signed" | "honored">("signed");
  // Call center
  const [ccName, setCcName] = useState("");
  const [ccAgence, setCcAgence] = useState(true);
  const [ccParentId, setCcParentId] = useState<number>(1); // agence de rattachement du nouveau call center
  const [ccPayBase, setCcPayBase] = useState(0); // combien on paie ce call center par RDV (fixe)
  const [ccPayPct, setCcPayPct] = useState(0);
  const [ccPayTrigger, setCcPayTrigger] = useState<"signed" | "honored">("signed");
  // Combien un commercial précis paye pour un call center donné, au moment de l'y assigner.
  const [assignAmountFor, setAssignAmountFor] = useState<{ user: User; ccId: number } | null>(null);
  const [assignBase, setAssignBase] = useState(0);
  const [assignPct, setAssignPct] = useState(0);
  const [assignTrigger, setAssignTrigger] = useState<"signed" | "honored">("signed");
  const [assignBusy, setAssignBusy] = useState(false);
  const [rName, setRName] = useState("");
  const [rUsername, setRUsername] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPass, setRPass] = useState("");
  const [rPhone, setRPhone] = useState("");

  // Première agence sélectionnée d'office : la page n'est jamais vide.
  useEffect(() => {
    if (!selection && callCenters.length > 0) {
      const racine = callCenters.find((c) => c.parent_id == null);
      if (racine) setSelection({ kind: "agence", id: racine.id });
    }
  }, [callCenters, selection]);

  async function load() {
    setErr("");
    try {
      const res = await fetch("/api/users", { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) { setUsers(d.users); setRole(d.role ?? "collab"); }
      else { setErr(d.error ?? "Erreur"); return; }
      if (d.role === "admin") {
        // Indépendants -> en parallèle plutôt qu'en série (page la plus lourde du CRM).
        const [r2, r3, r4] = await Promise.all([
          fetch("/api/callcenters", { headers: authHeaders() }),
          fetch("/api/platforms", { headers: authHeaders() }),
          fetch("/api/accords-telepro", { headers: authHeaders() }),
        ]);
        const [d2, d3, d4] = await Promise.all([r2.json(), r3.json(), r4.json()]);
        // Call centers/agences retirés (soft-delete) : disparaissent de cette vue de gestion,
        // mais leur historique (accords, factures) reste intact ailleurs — voir deleteCallCenter.
        if (d2.ok) { setCallCenters((d2.callCenters as CallCenter[]).filter((c) => c.active !== false)); setAssignments(d2.assignments); setAccords(d2.accords ?? []); setTeleproAssignments(d2.teleproAssignments ?? []); }
        if (d3.ok) setPlatforms(d3.platforms ?? []);
        if (d4.ok) setAffiliations(d4.accords ?? []);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
  }
  useEffect(() => { load(); }, []);
  // Présence en temps réel : re-fetch léger toutes les 20s pour rafraîchir les pastilles "en ligne".
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/users", { headers: authHeaders() }).then((r) => r.json()).then((d) => { if (d.ok) setUsers(d.users); }).catch(() => {});
    }, 20000);
    return () => clearInterval(id);
  }, []);
  const estEnLigne = (u: User) => !!u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < 2 * 60 * 1000;

  // Un responsable ne peut créer que des télépros.
  const isAdmin = role === "admin";
  useEffect(() => { if (!isAdmin && type !== "telepro") setType("telepro"); }, [isAdmin, type]);
  // Charge les vacances au démarrage (admin) pour afficher le point rouge sans avoir à ouvrir la fenêtre.
  useEffect(() => { if (isAdmin) chargerVacations(); }, [isAdmin]);
  const todayISO = new Date().toISOString().slice(0, 10);

  async function ouvrirRecap() {
    setRecapOuvert(true);
    setRecapBusy(true);
    try {
      const res = await fetch("/api/telepro-earnings", { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) setTeleproEarnings(d.telepros); else alert(d.error ?? "Erreur");
    } finally { setRecapBusy(false); }
  }

  async function chargerVacations() {
    setVacationsBusy(true);
    try {
      const res = await fetch("/api/admin/vacations", { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) { setVacationRows(d.rows); setVacationCommercials(d.commercials); } else alert(d.error ?? "Erreur");
    } finally { setVacationsBusy(false); }
  }
  async function ouvrirVacations() {
    setVacationsOuvert(true);
    await chargerVacations();
  }
  async function assignerDelegue(delegatorEmail: string) {
    const delegateEmail = delegatePick[delegatorEmail];
    const dates = delegateDates[delegatorEmail];
    if (!delegateEmail || !dates?.start || !dates?.end) { alert("Choisis un délégué et une période."); return; }
    const res = await fetch("/api/admin/vacations", {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ action: "addDelegation", delegatorEmail, delegateEmail, start: dates.start, end: dates.end }),
    });
    const d = await res.json();
    if (!d.ok) { alert(d.error ?? "Erreur"); return; }
    setDelegatePick((m) => ({ ...m, [delegatorEmail]: "" }));
    setDelegateDates((m) => ({ ...m, [delegatorEmail]: { start: "", end: "" } }));
    chargerVacations();
  }
  async function retirerDelegation(delegatorEmail: string, id: number) {
    await fetch("/api/admin/vacations", {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ action: "removeDelegation", delegatorEmail, id }),
    });
    chargerVacations();
  }

  // Super-admin : identité "libre", sans rattachement organisationnel.
  const SANS_RATTACHEMENT = ["admin"] as const;

  async function addUser() {
    // Échec silencieux corrigé : avant, un champ manquant ne faisait rien du tout, sans dire
    // pourquoi — on ne savait jamais si le clic avait été pris en compte.
    if (!name.trim()) { alert("Le nom est requis."); return; }
    if (!username.trim()) { alert("Le pseudo est requis."); return; }
    if (!password.trim()) { alert("Le mot de passe est requis."); return; }
    const typePreview = ["commercial", "admin"].includes(type) ? type : "telepro";
    if (!(SANS_RATTACHEMENT as readonly string[]).includes(typePreview) && !attachCC) {
      alert("Choisis l'agence ou le call center de rattachement.");
      return;
    }
    if (type === "telepro" && affKind !== "none" && affBase <= 0 && affPct <= 0) {
      alert("Indique un montant fixe ou un pourcentage pour l'affiliation.");
      return;
    }
    setBusy(true);
    try {
      const typeEnvoye = ["commercial", "admin"].includes(type) ? type : "telepro";
      const sansRattachement = (SANS_RATTACHEMENT as readonly string[]).includes(type);
      const res = await fetch("/api/users", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({
        type: typeEnvoye, name, username, email, password, phone, callCenterId: sansRattachement ? 1 : attachCC, notifyEmail,
        ...(type === "telepro" ? { commissionBase: teleBase, commissionPct: telePct } : {}),
        ...(type === "commercial" ? { commissionBase: commBase, commissionPct: commPct } : {}),
      }) });
      const d = await res.json();
      if (!d.ok) { alert(d.error ?? "Erreur"); return; }
      // Affiliation (plateforme ou commercial précis) : un second appel, une fois le compte créé.
      if (type === "telepro" && affKind !== "none" && d.user?.email) {
        const ar = await fetch("/api/accords-telepro", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({
          teleproEmail: d.user.email,
          platform: affKind === "platform" ? affPlatform : undefined,
          commercialEmail: affKind === "commercial" ? affCommercial : undefined,
          baseEur: affBase, pctNego: affPct, trigger: affTrigger,
        }) });
        const ad = await ar.json();
        if (!ad.ok) alert(`Compte créé, mais l'affiliation a échoué : ${ad.error ?? "erreur"}`);
      }
      setName(""); setUsername(""); setEmail(""); setPassword(""); setPhone(""); setTeleBase(0); setTelePct(0); setCommBase(0); setCommPct(0);
      setAffKind("none"); setAffPlatform(""); setAffCommercial(""); setAffBase(0); setAffPct(0); setAffTrigger("signed");
      load();
      if (d.connexionUrl) copierLien(d.connexionUrl, `Compte créé pour ${d.user?.name ?? "cette personne"}`);
    } finally { setBusy(false); }
  }

  // Lien PERMANENT de connexion d'une agence (agenda-rdv.vercel.app/<slug>) — pas un lien
  // d'activation à usage unique : tout le monde chez cette agence s'y connecte, toujours pareil.
  function copierLien(url: string, intro: string) {
    navigator.clipboard?.writeText(url).then(
      () => alert(`${intro}\n\nLien de connexion (permanent) copié :\n${url}`),
      () => alert(`${intro}\n\nLien de connexion (permanent, copie manuelle) :\n${url}`),
    );
  }

  function copierLienDe(ccId: number | undefined, intro: string) {
    if (!ccId) { alert("Ce compte n'a pas de call center rattaché."); return; }
    let cur = callCenters.find((c) => c.id === ccId);
    while (cur && cur.parent_id != null && !cur.slug) cur = callCenters.find((c) => c.id === cur!.parent_id);
    if (!cur?.slug) { alert("Cette agence n'a pas encore de slug."); return; }
    copierLien(`${window.location.origin}/${cur.slug}`, intro);
  }

  async function addCallCenter() {
    if (!ccName.trim() || !rName.trim() || !rUsername.trim() || !rPass.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/callcenters", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({
        name: ccName, agenceOnly: ccAgence, parentId: ccParentId, notifyEmail, payBaseEur: ccPayBase, payPctNego: ccPayPct, payTrigger: ccPayTrigger,
        responsable: { name: rName, username: rUsername, email: rEmail, password: rPass, phone: rPhone },
      }) });
      const d = await res.json();
      if (d.ok) {
        setCcName(""); setRName(""); setRUsername(""); setREmail(""); setRPass(""); setRPhone(""); setCcPayBase(0); setCcPayPct(0); setCcPayTrigger("signed"); load();
        if (d.connexionUrl) copierLien(d.connexionUrl, `Call center créé, responsable ${rName}`);
      }
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
    if (!confirm(`Retirer ${label} ? Le call center disparaît des listes actives ; son historique (accords, factures, RDV) reste intact.`)) return;
    const res = await fetch(`/api/callcenters?id=${id}`, { method: "DELETE", headers: authHeaders() });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  async function saveTheme(ccId: number, primary: string, dark: string) {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, action: "setTheme", primary, dark }) });
    const d = await res.json();
    if (d.ok) { alert("Couleurs enregistrées. Elles s'appliquent à la prochaine connexion des utilisateurs de cette franchise."); load(); }
    else alert(d.error ?? "Erreur");
  }
  async function saveAccords(cc: CallCenter) {
    const baseEur = Number((document.getElementById(`acc-base-${cc.id}`) as HTMLInputElement)?.value ?? 0);
    const pctNego = Number((document.getElementById(`acc-pct-${cc.id}`) as HTMLInputElement)?.value ?? 0);
    const trigger = (document.getElementById(`acc-trig-${cc.id}`) as HTMLSelectElement)?.value === "honored" ? "honored" : "signed";
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: cc.id, action: "setAccords", baseEur, pctNego, trigger, email: cc.responsable_email }) });
    const d = await res.json();
    if (d.ok) { alert(`Barème enregistré : ${baseEur} € + ${pctNego} % du négocié, ${trigger === "honored" ? "au RDV honoré" : "au mandat signé"}.`); load(); }
    else alert(d.error ?? "Erreur");
  }
  async function setResponsable2(ccId: number, email: string) {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, action: "setResponsable2", email }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  async function renameCC(ccId: number, current: string) {
    const name = prompt("Nouveau nom (affiché au milieu du bandeau) :", current);
    if (!name?.trim() || name.trim() === current) return;
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, action: "rename", name: name.trim() }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  async function setSlugCC(ccId: number, current?: string) {
    const slug = prompt("Slug d'URL de cette agence (ex: simplicicar-romainville) — accessible via agenda-rdv.vercel.app/<slug>/... :", current ?? "");
    if (slug == null || slug.trim() === (current ?? "")) return;
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, action: "setSlug", slug: slug.trim() }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  async function setHeaderDark(ccId: number, headerDark: boolean) {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, action: "setTheme", headerDark }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  // Upload du logo (PNG) de la franchise -> affiché en haut à gauche pour tous ses comptes.
  async function uploadLogo(ccId: number, file?: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "logos");
      const up = await fetch("/api/upload", { method: "POST", headers: authHeaders(), body: fd });
      const u = await up.json();
      if (!u.ok) { alert(u.error ?? "Erreur upload logo"); return; }
      const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, action: "setTheme", logo: u.url }) });
      const d = await res.json();
      if (d.ok) { alert("Logo enregistré. Il s'affiche à la prochaine connexion des utilisateurs de cette franchise."); load(); }
      else alert(d.error ?? "Erreur");
    } finally { setBusy(false); }
  }
  async function setAgence(ccId: number, parentId: number) {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, parentId, action: "setAgence" }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }


  async function toggleAssign(u: User, ccId: number, assigned: boolean) {
    if (assigned) {
      const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, email: u.email, action: "unassign" }) });
      const d = await res.json();
      if (d.ok) load(); else alert(d.error ?? "Erreur");
      return;
    }
    // Nouvelle affectation : on demande tout de suite combien ce commercial paye pour ce call center.
    ouvrirMontantAssignation(u, ccId);
  }
  function ouvrirMontantAssignation(u: User, ccId: number) {
    setAssignBase(0); setAssignPct(0); setAssignTrigger("signed");
    setAssignAmountFor({ user: u, ccId });
  }
  async function confirmerAssignation() {
    if (!assignAmountFor) return;
    const { user: u, ccId } = assignAmountFor;
    const cc = callCenters.find((c) => c.id === ccId);
    setAssignBusy(true);
    try {
      const r1 = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, email: u.email, action: "assign" }) });
      const d1 = await r1.json();
      if (!d1.ok) { alert(d1.error ?? "Erreur"); return; }
      if ((assignBase > 0 || assignPct > 0) && cc?.responsable_email) {
        const r2 = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({
          callCenterId: ccId, action: "setCommercialAccord", commercialEmail: u.email, email: cc.responsable_email,
          baseEur: assignBase, pctNego: assignPct, trigger: assignTrigger,
        }) });
        const d2 = await r2.json();
        if (!d2.ok) alert(`Rattaché, mais le montant n'a pas pu être enregistré : ${d2.error ?? "erreur"}`);
      }
      setAssignAmountFor(null);
      load();
    } finally { setAssignBusy(false); }
  }
  async function toggleTeleproAssign(teleproEmail: string, commercialEmail: string, assigned: boolean) {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: 1, teleproEmail, commercialEmail, action: assigned ? "unassignTelepro" : "assignTelepro" }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  async function setTeleproPriority(teleproEmail: string, commercialEmail: string, priority: number) {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: 1, teleproEmail, commercialEmail, priority, action: "assignTelepro" }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }

  function ouvrirAffiliation(u: User) {
    const aff = affiliations.find((a) => a.payee_email.toLowerCase() === u.email.toLowerCase());
    setAffModalKind(aff ? (aff.platform ? "platform" : "commercial") : "none");
    setAffModalPlatform(aff?.platform ?? "");
    setAffModalCommercial(aff?.commercial_email ?? "");
    setAffModalBase(aff ? Number(aff.base_eur) : 0);
    setAffModalPct(aff ? Number(aff.pct_nego) : 0);
    setAffModalTrigger(aff?.trigger_kind === "honored" ? "honored" : "signed");
    setAffModalUser(u);
  }
  async function enregistrerAffiliation() {
    if (!affModalUser) return;
    setAffModalBusy(true);
    try {
      if (affModalKind === "none") {
        const aff = affiliations.find((a) => a.payee_email.toLowerCase() === affModalUser.email.toLowerCase());
        if (aff) await fetch(`/api/accords-telepro?id=${aff.id}`, { method: "DELETE", headers: authHeaders() });
      } else {
        if (affModalBase <= 0 && affModalPct <= 0) { alert("Indique un montant fixe ou un pourcentage."); return; }
        const res = await fetch("/api/accords-telepro", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({
          teleproEmail: affModalUser.email,
          platform: affModalKind === "platform" ? affModalPlatform : undefined,
          commercialEmail: affModalKind === "commercial" ? affModalCommercial : undefined,
          baseEur: affModalBase, pctNego: affModalPct, trigger: affModalTrigger,
        }) });
        const d = await res.json();
        if (!d.ok) { alert(d.error ?? "Erreur"); return; }
      }
      setAffModalUser(null);
      load();
    } finally { setAffModalBusy(false); }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    const res = await fetch("/api/users", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ id, ...body }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  /** Prise en main d'un compte : l'admin voit l'app comme la personne, et peut revenir. */
  async function seConnecterComme(u: User) {
    if (!confirm(`Ouvrir l'application en tant que ${u.name} ?\n\nTu verras exactement ce qu'il voit. Un bouton « Revenir à mon compte » restera affiché en haut.`)) return;
    const res = await fetch("/api/users/impersonate", {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ id: u.id }),
    });
    const d = await res.json();
    if (!d.ok) { alert(d.error ?? "Erreur"); return; }
    // Sauvegarde de la session admin (+ son thème) pour pouvoir revenir en un clic.
    localStorage.setItem("auth_backup", JSON.stringify({
      token: localStorage.getItem("auth_token"), user: localStorage.getItem("auth_user"), theme: localStorage.getItem("auth_theme"), name: getUser()?.name ?? "mon compte",
    }));
    setAuth(d.token, d.user, d.theme ?? null);
    window.location.href = "/agenda";
  }

  /** Les mots de passe sont hachés : impossible de les lire. L'admin peut en poser un nouveau. */
  async function definirMotDePasse(u: User) {
    const pw = prompt(`Nouveau mot de passe pour ${u.name} (6 caractères minimum).\n\nLes mots de passe existants sont chiffrés et ne peuvent pas être affichés.`);
    if (!pw) return;
    const res = await fetch("/api/users", {
      method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ id: u.id, password: pw }),
    });
    const d = await res.json();
    if (d.ok) alert(`Mot de passe mis à jour.\n\nIdentifiant : ${u.username ? `@${u.username}` : u.email}\nMot de passe : ${pw}`);
    else alert(d.error ?? "Erreur");
  }

  async function del(u: User) {
    if (!confirm(`Retirer le compte de ${u.name} ? Il disparaît des listes actives (plus de login) ; son historique de facturation reste intact.`)) return;
    const res = await fetch(`/api/users?id=${u.id}`, { method: "DELETE", headers: authHeaders() });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }

  const isAssigned = (email: string, ccId: number) => assignments.some((a) => a.commercial_email === email.toLowerCase() && a.call_center_id === ccId);
  // Racine (agence/franchise) d'un call center via la hiérarchie.
  const rootOf = (ccId?: number): number | undefined => {
    let cur = callCenters.find((c) => c.id === ccId);
    for (let i = 0; cur && i < 6; i++) {
      if (cur.parent_id == null) return cur.id;
      cur = callCenters.find((c) => c.id === cur!.parent_id);
    }
    return cur?.id;
  };
  // Commerciaux appartenant à une agence : compte rattaché à l'agence (ou à un enfant) OU lié explicitement à l'agence.
  const commercialsOfAgence = (agenceId: number) =>
    users.filter((u) => u.is_commercial && (rootOf(Number(u.call_center_id)) === agenceId || isAssigned(u.email, agenceId)));
  const agences = callCenters.filter((c) => c.parent_id == null); // racines = agences


  const typeBtn = (v: typeof type, label: string, sub: string) => (
    <button onClick={() => setType(v)} style={{ flex: "1 1 140px", padding: "10px 12px", borderRadius: R.sm, fontSize: 13.5, fontWeight: 700, cursor: "pointer", border: type === v ? "none" : `1px solid ${T.line}`, background: type === v ? T.ink : T.surface, color: type === v ? "#fff" : T.ink2 }}>{label}<br /><span style={{ fontWeight: 400, fontSize: 11.5, opacity: 0.8 }}>{sub}</span></button>
  );

  // Sélection courante dans l'arborescence : une agence ou un call center (rien si "Utilisateurs").
  const noeud = selection?.kind === "cc"
    ? callCenters.find((c) => c.id === selection.id)
    : selection?.kind === "utilisateurs" ? undefined
    : agences.find((a) => a.id === selection?.id) ?? agences[0];
  const estAgence = !noeud?.parent_id;

  // Aperçu couleurs : se resynchronise sur les valeurs enregistrées à chaque ouverture des
  // Réglages ou changement de nœud sélectionné.
  useEffect(() => {
    if (reglagesOuverts && noeud) {
      setPreviewPrimary(noeud.brand_primary || "#DB407A");
      setPreviewDark(noeud.brand_dark || "#1a273a");
      setPreviewHeaderDark(!!noeud.header_dark);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reglagesOuverts, noeud?.id]);

  // Comptes libres : sans rattachement organisationnel — super-admins.
  const utilisateursLibres = users.filter((u) => u.role === "admin" && (showInactive || u.active !== false));

  /** Comptes rattachés au nœud sélectionné. "Supprimer" désactive (historique gardé) plutôt que
   *  d'effacer -> masqués de la liste par défaut, sinon "Supprimer" semble ne rien faire. */
  const comptesDuNoeud = (): User[] => {
    if (!noeud) return [];
    if (estAgence) {
      const coms = commercialsOfAgence(noeud.id).filter((u) => showInactive || u.active !== false);
      const teles = users.filter((u) => u.is_teleprospector && Number(u.call_center_id) === noeud.id && (showInactive || u.active !== false));
      return [...coms, ...teles];
    }
    return users.filter((u) => Number(u.call_center_id) === noeud.id && (showInactive || u.active !== false));
  };

  const lienArbre = (actif: boolean, decale: boolean): React.CSSProperties => ({
    width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
    padding: decale ? "9px 12px 9px 26px" : "10px 12px", borderRadius: R.sm, cursor: "pointer",
    border: "none", background: actif ? T.brand : "transparent", color: actif ? "#fff" : T.ink,
    fontSize: decale ? 13.5 : 14.5, fontWeight: actif ? 700 : decale ? 500 : 600,
  });

  return (
    <>
      <PageHeader
        title="Comptes"
        subtitle={isAdmin
          ? "Une agence regroupe des call centers ; chaque call center a son responsable et ses téléprospecteurs ; les commerciaux réalisent les rendez-vous."
          : "Ajoute et rémunère les téléprospecteurs de ton call center."}
        actions={isAdmin ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={ouvrirVacations} style={{ height: 38, padding: "0 16px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: "pointer", position: "relative" }}>
              🏖️ Vacances & délégations
              {vacationRows?.some((r) => r.timeOff.some((t) => t.end_date >= todayISO)) && (
                <span style={{ position: "absolute", top: -4, right: -4, width: 10, height: 10, borderRadius: "50%", background: T.danger, border: "2px solid #fff" }} />
              )}
            </button>
            <button onClick={ouvrirRecap} style={{ height: 38, padding: "0 16px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
              💰 Récap télépros
            </button>
            <button onClick={() => setCreationOuverte(true)} style={{ height: 38, padding: "0 16px", borderRadius: R.sm, border: "none", background: T.brand, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
              + Créer un utilisateur
            </button>
          </div>
        ) : undefined}
      />

      {err && <Card><div style={{ color: T.danger, fontWeight: 700 }}>{err}</div></Card>}

      {!isAdmin ? (
        <div style={{ display: "grid", gap: 10 }}>{users.map(renderUser)}</div>
      ) : (
        <div className="comptes-grille" style={{ display: "grid", gridTemplateColumns: "minmax(210px, 250px) minmax(0, 1fr)", gap: S.md, alignItems: "start" }}>
          {/* ── Colonne gauche : l'organisation ── */}
          <aside style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: R.lg, padding: S.sm, position: "sticky", top: 12 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: T.ink3, padding: "6px 12px 10px" }}>
              Organisation
            </div>

            {agences.map((a) => {
              const enfants = callCenters.filter((c) => c.parent_id === a.id);
              const actif = selection?.kind === "agence" && selection.id === a.id;
              return (
                <div key={a.id} style={{ marginBottom: 4 }}>
                  <button onClick={() => setSelection({ kind: "agence", id: a.id })} style={lienArbre(actif, false)}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                    <span style={{ fontSize: 12, opacity: 0.75 }}>{commercialsOfAgence(a.id).length}</span>
                  </button>
                  {enfants.map((c) => {
                    const actifCc = selection?.kind === "cc" && selection.id === c.id;
                    return (
                      <button key={c.id} onClick={() => setSelection({ kind: "cc", id: c.id })} style={lienArbre(actifCc, true)}>
                        <span style={{ overflow: "hidden", minWidth: 0 }}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                          <span style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", opacity: actifCc ? 0.85 : 0.55 }}>Call center</span>
                        </span>
                        <span style={{ fontSize: 12, opacity: 0.75, flexShrink: 0 }}>{c.telepros_count}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: T.ink3, padding: "10px 12px 6px" }}>
              Utilisateurs
            </div>
            <button onClick={() => setSelection({ kind: "utilisateurs", id: 0 })} style={lienArbre(selection?.kind === "utilisateurs", false)}>
              <span>Super-admins</span>
              <span style={{ fontSize: 12, opacity: 0.75 }}>{utilisateursLibres.length}</span>
            </button>

            <button
              onClick={addAgence} disabled={busy}
              style={{ width: "100%", height: 36, marginTop: 8, borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              + Créer une agence
            </button>
          </aside>

          {/* ── Colonne droite : le détail du nœud sélectionné ── */}
          <div style={{ minWidth: 0 }}>
            {selection?.kind === "utilisateurs" ? (
              <Card
                title={`Super-admins (${utilisateursLibres.length})`}
                description="Sans rattachement à une agence ou un call center — accès total."
                actions={
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.ink2, cursor: "pointer" }}>
                      <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Afficher les comptes désactivés
                    </label>
                    <button onClick={() => { setType("admin"); setCreationOuverte(true); }} style={{ height: 36, padding: "0 14px", borderRadius: R.sm, border: "none", background: T.brand, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>+ Créer un utilisateur</button>
                  </div>
                }
              >
                {utilisateursLibres.length === 0 ? (
                  <div style={{ color: T.ink2, fontSize: 15 }}>Aucun pour l&apos;instant.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {utilisateursLibres.map((u) => (
                      <div key={u.id}>
                        <div style={{ marginBottom: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Badge ton="danger">Super-admin</Badge>
                        </div>
                        {renderUser(u)}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ) : !noeud ? (
              <Card><div style={{ color: T.ink2 }}>Crée une première agence pour commencer.</div></Card>
            ) : (
              <>
                <Card>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S.md, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>{noeud.name}</h2>
                        <Badge ton={estAgence ? "neutre" : "info"}>{estAgence ? "Agence" : "Call center"}</Badge>
                      </div>
                      <div style={{ fontSize: 14, color: T.ink2, marginTop: 4 }}>
                        {estAgence
                          ? `${commercialsOfAgence(noeud.id).length} commerciaux · ${callCenters.filter((c) => c.parent_id === noeud.id).length} call center(s)`
                          : `Responsable : ${noeud.responsable_email || "—"}${noeud.responsable_email_2 ? ` + ${noeud.responsable_email_2} (50/50)` : ""} · ${noeud.telepros_count} téléprospecteur(s)`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => setReglagesOuverts(true)} style={{ height: 36, padding: "0 14px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                        Réglages
                      </button>
                      <button onClick={() => { setAttachCC(noeud.id); setCreationOuverte(true); }} style={{ height: 36, padding: "0 14px", borderRadius: R.sm, border: "none", background: T.brand, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                        + Créer un compte
                      </button>
                    </div>
                  </div>
                </Card>

                <Card
                  title={`Comptes (${comptesDuNoeud().length})`}
                  description={estAgence
                    ? "Les commerciaux liés à cette agence et les téléprospecteurs rattachés directement."
                    : "L'équipe de ce call center."}
                  actions={
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.ink2, cursor: "pointer" }}>
                      <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Afficher les comptes désactivés
                    </label>
                  }
                >
                  {comptesDuNoeud().length === 0 ? (
                    <div style={{ color: T.ink2, fontSize: 15 }}>Aucun compte ici pour l&apos;instant.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>{comptesDuNoeud().map(renderUser)}</div>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `@media (max-width: 860px) { .comptes-grille { grid-template-columns: 1fr !important; } }` }} />

      {/* ── Fenêtre : réglages du nœud sélectionné ── */}
      {reglagesOuverts && noeud && (
        <Fenetre titre={`Réglages — ${noeud.name}`} onFermer={() => { setReglagesOuverts(false); setLierCommercialQuery(null); }}>
          <div style={{ display: "grid", gap: S.lg }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => renameCC(noeud.id, noeud.name)} style={{ height: 34, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Renommer</button>
              <button onClick={() => setSlugCC(noeud.id, noeud.slug ?? "")} title="URL dédiée : agenda-rdv.vercel.app/<slug>/..." style={{ height: 34, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Slug{noeud.slug ? ` : /${noeud.slug}` : ""}
              </button>
              <button
                onClick={() => { setReglagesOuverts(false); delCallCenter(noeud.id, estAgence ? `l'agence ${noeud.name}` : `le call center ${noeud.name} ?\n\nSes comptes seront DÉSACTIVÉS, mais RDV, bilan et facturation sont conservés`); }}
                style={{ height: 34, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.danger, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                Supprimer
              </button>
            </div>

            {estAgence ? (
              <>
                <section>
                  <div style={legendeSection}>Logo affiché en haut du CRM</div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    {noeud.logo_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={noeud.logo_url} alt={noeud.name} style={{ height: 40, maxWidth: 160, objectFit: "contain", border: `1px solid ${T.line}`, borderRadius: R.sm, padding: 4, background: "#fff" }} />
                    ) : (
                      <span style={{ fontSize: 13.5, color: T.ink3 }}>Aucun logo — logo Simplicicar par défaut</span>
                    )}
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => uploadLogo(noeud.id, e.target.files?.[0])} style={{ fontSize: 13 }} />
                  </div>
                </section>

                <section>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ flex: "1 1 260px", minWidth: 240 }}>
                      <div style={legendeSection}>Couleurs de la marque</div>
                      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.ink2 }}>
                          Accent <input type="color" value={previewPrimary} onChange={(e) => setPreviewPrimary(e.target.value)} style={{ width: 46, height: 32, border: `1px solid ${T.line}`, borderRadius: R.sm, padding: 2, cursor: "pointer" }} />
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.ink2 }}>
                          Foncé <input type="color" value={previewDark} onChange={(e) => setPreviewDark(e.target.value)} style={{ width: 46, height: 32, border: `1px solid ${T.line}`, borderRadius: R.sm, padding: 2, cursor: "pointer" }} />
                        </label>
                      </div>
                      <button
                        onClick={() => saveTheme(noeud.id, previewPrimary, previewDark)}
                        style={{ marginTop: 10, height: 34, padding: "0 14px", borderRadius: R.sm, border: "none", background: T.brand, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                      >
                        Enregistrer les couleurs
                      </button>
                      <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 8 }}>Appliqué à tous les comptes de la franchise à leur connexion.</div>

                      <div style={{ ...legendeSection, marginTop: 18 }}>Fond du bandeau (page client)</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => { setPreviewHeaderDark(false); setHeaderDark(noeud.id, false); }} style={{ height: 34, padding: "0 14px", borderRadius: R.sm, fontSize: 13, fontWeight: 700, cursor: "pointer", border: previewHeaderDark ? `1px solid ${T.line}` : "none", background: previewHeaderDark ? T.surface : T.ink, color: previewHeaderDark ? T.ink2 : "#fff" }}>Clair</button>
                        <button onClick={() => { setPreviewHeaderDark(true); setHeaderDark(noeud.id, true); }} style={{ height: 34, padding: "0 14px", borderRadius: R.sm, fontSize: 13, fontWeight: 700, cursor: "pointer", border: previewHeaderDark ? "none" : `1px solid ${T.line}`, background: previewHeaderDark ? T.ink : T.surface, color: previewHeaderDark ? "#fff" : T.ink2 }}>Foncé</button>
                        <span style={{ fontSize: 12, color: T.ink3, alignSelf: "center" }}>pour les logos à écriture blanche</span>
                      </div>
                    </div>

                    {/* Aperçu live : la VRAIE Sidebar du CRM (mêmes menus, même composant), couleurs
                        scopées ici via variables CSS locales — n'affecte que cet aperçu, pas le
                        thème global tant que "Enregistrer" n'a pas été cliqué. */}
                    <div style={{ flex: "0 0 220px" }}>
                      <div style={legendeSection}>Aperçu — vraie sidebar CRM</div>
                      <div style={{ width: 220, height: 340, border: `1px solid ${T.line}`, borderRadius: R.md, overflow: "hidden", pointerEvents: "none" }}>
                        <div style={{ "--brand-primary": previewPrimary, "--brand-dark": previewDark, height: "100%" } as React.CSSProperties}>
                          <Sidebar active="agenda" user={{ role: "admin" }} marque={noeud.name} logo={noeud.logo_url || "/logo.png"} />
                        </div>
                      </div>
                      <div style={{ marginTop: 8, width: 220, borderRadius: R.md, overflow: "hidden", border: `1px solid ${previewHeaderDark ? "transparent" : T.line}` }}>
                        <div style={{ padding: "9px 12px", background: previewHeaderDark ? previewDark : "#fff", fontSize: 12, fontWeight: 700, color: previewHeaderDark ? "#fff" : "#1a273a" }}>
                          {noeud.name}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: T.ink3, marginTop: 6 }}>Sidebar CRM (haut) · en-tête page client (bas)</div>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <>
                <section>
                  <div style={legendeSection}>Agence de rattachement</div>
                  <select value={noeud.parent_id ?? ""} onChange={(e) => e.target.value && setAgence(noeud.id, Number(e.target.value))} style={{ ...champ, maxWidth: 320 }}>
                    <option value="">— choisir —</option>
                    {agences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </section>

                <section>
                  <div style={legendeSection}>Deuxième responsable (50/50)</div>
                  <select value={noeud.responsable_email_2 ?? ""} onChange={(e) => setResponsable2(noeud.id, e.target.value)} style={{ ...champ, maxWidth: 320 }}>
                    <option value="">— aucun —</option>
                    {users.filter((u) => u.email !== noeud.responsable_email).map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
                  </select>
                  <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 8 }}>
                    Marque ce call center comme partagé 50/50. L'affichage du solde partagé reste à brancher.
                  </div>
                </section>

                <section>
                  <div style={legendeSection}>Combien on paie ce call center (par rendez-vous)</div>
                  {(() => {
                    const accCall = accords.find((x) => Number(x.call_center_id) === noeud.id && x.payee_kind === "call_center" && !x.commercial_email);
                    return (
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <Field label="Fixe (€)">
                          <input id={`acc-base-${noeud.id}`} type="number" defaultValue={accCall ? Number(accCall.base_eur) : (noeud.pay_base_eur ?? 0)} style={{ ...champ, width: 120, textAlign: "right" }} />
                        </Field>
                        <Field label="+ % du négocié">
                          <input id={`acc-pct-${noeud.id}`} type="number" defaultValue={accCall ? Number(accCall.pct_nego) : (noeud.pay_pct_nego ?? 0)} style={{ ...champ, width: 90, textAlign: "right" }} />
                        </Field>
                        <Field label="Déclencheur">
                          <select id={`acc-trig-${noeud.id}`} defaultValue={accCall?.trigger_kind === "honored" ? "honored" : "signed"} style={{ ...champ, width: 160 }}>
                            <option value="signed">Au mandat signé</option>
                            <option value="honored">Dès que le client est venu</option>
                          </select>
                        </Field>
                        <button onClick={() => saveAccords(noeud)} style={{ height: 44, padding: "0 16px", borderRadius: R.sm, border: "none", background: T.brand, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                          Enregistrer
                        </button>
                      </div>
                    );
                  })()}
                </section>
              </>
            )}

            <section>
              <div style={legendeSection}>Commerciaux liés</div>
              <p style={{ margin: "0 0 8px", fontSize: 12.5, color: T.ink2 }}>
                Les commerciaux rattachés à cette agence sont gérés automatiquement (voir « Comptes »). Ici : lier en plus un commercial d&apos;une AUTRE agence (rare — ex. un commercial qui dépanne plusieurs agences).
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {users.filter((u) => u.is_commercial && !(estAgence && rootOf(Number(u.call_center_id)) === noeud.id) && isAssigned(u.email, noeud.id)).map((u) => {
                  const acc = accords.find((a) => a.call_center_id === noeud.id && a.payee_kind === "call_center" && a.commercial_email === u.email.toLowerCase());
                  return (
                    <span key={u.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <button
                        type="button" onClick={() => toggleAssign(u, noeud.id, true)}
                        style={{ height: 32, padding: "0 12px", borderRadius: `${R.sm}px 0 0 ${R.sm}px`, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "none", background: T.ink, color: "#fff" }}
                        title={`${u.agence_name ? `Agence : ${u.agence_name} · ` : ""}retirer ce lien`}
                      >
                        ✓ {u.name}{u.agence_name ? ` (${u.agence_name})` : ""}{acc ? ` — ${Number(acc.base_eur)}€${Number(acc.pct_nego) > 0 ? `+${acc.pct_nego}%` : ""}` : ""}
                      </button>
                      <button
                        type="button" onClick={() => { setAssignBase(acc ? Number(acc.base_eur) : 0); setAssignPct(acc ? Number(acc.pct_nego) : 0); setAssignTrigger(acc?.trigger_kind === "honored" ? "honored" : "signed"); setAssignAmountFor({ user: u, ccId: noeud.id }); }}
                        style={{ height: 32, padding: "0 10px", borderRadius: `0 ${R.sm}px ${R.sm}px 0`, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${T.line}`, borderLeft: "none", background: T.surface, color: T.ink2 }}
                        title="Combien ce commercial paye par RDV pour ce call center"
                      >
                        €
                      </button>
                    </span>
                  );
                })}
                {users.filter((u) => u.is_commercial && !(estAgence && rootOf(Number(u.call_center_id)) === noeud.id) && isAssigned(u.email, noeud.id)).length === 0 && (
                  <span style={{ fontSize: 12.5, color: T.ink3 }}>Aucun lien externe pour l&apos;instant.</span>
                )}
              </div>
              <button onClick={() => setLierCommercialQuery("")} type="button" style={{ height: 32, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                + Lier un commercial d&apos;une autre agence
              </button>
              {lierCommercialQuery !== null && (
                <div style={{ marginTop: 10, padding: 12, border: `1px solid ${T.line}`, borderRadius: R.md, background: T.surface }}>
                  <input
                    autoFocus value={lierCommercialQuery} onChange={(e) => setLierCommercialQuery(e.target.value)}
                    placeholder="Chercher un commercial par nom…" style={{ ...champ, marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 220, overflowY: "auto" }}>
                    {users
                      .filter((u) => u.is_commercial && !(estAgence && rootOf(Number(u.call_center_id)) === noeud.id) && !isAssigned(u.email, noeud.id))
                      .filter((u) => !lierCommercialQuery.trim() || u.name.toLowerCase().includes(lierCommercialQuery.trim().toLowerCase()))
                      .slice(0, 30)
                      .map((u) => (
                        <button
                          key={u.id} type="button" onClick={() => { toggleAssign(u, noeud.id, false); setLierCommercialQuery(null); }}
                          style={{ height: 32, padding: "0 12px", borderRadius: R.sm, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${T.line}`, background: T.surface, color: T.ink2 }}
                        >
                          + {u.name}{u.agence_name ? ` — ${u.agence_name}` : ""}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </section>

            {!estAgence && (
              <section>
                <div style={legendeSection}>💰 Téléprospecteurs de ce call center</div>
                <p style={{ fontSize: 12.5, color: T.ink3, margin: "0 0 10px" }}>
                  Barème par défaut, ou affiliation (plateforme / commercial précis) si réglée — voir la fiche du compte.
                </p>
                {(() => {
                  const telepros = users.filter((u) => u.is_teleprospector && Number(u.call_center_id) === noeud.id);
                  if (telepros.length === 0) return <div style={{ fontSize: 13, color: T.ink3 }}>Aucun téléprospecteur dans ce call center.</div>;
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {telepros.map((t) => {
                        const aff = affiliations.find((a) => a.payee_email.toLowerCase() === t.email.toLowerCase());
                        return (
                          <span key={t.id} style={{ fontSize: 12.5, background: T.surface2, borderRadius: 999, padding: "4px 10px" }}>
                            {t.name} : {aff
                              ? `${aff.platform ? `plateforme ${aff.platform}` : aff.commercial_name ?? aff.commercial_email} — ${Number(aff.base_eur)} €${Number(aff.pct_nego) > 0 ? ` + ${aff.pct_nego}%` : ""}`
                              : `${Number(t.commission_base ?? 0)} €${Number(t.commission_pct ?? 0) > 0 ? ` + ${t.commission_pct}%` : ""} (par défaut)`}
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>
            )}
          </div>
        </Fenetre>
      )}

      {/* ── Fenêtre : création d'un compte ou d'un call center ── */}
      {creationOuverte && (
        <Fenetre titre="Créer un utilisateur" onFermer={() => setCreationOuverte(false)}>
          {isAdmin && (
            <>
              <div style={legendeSection}>Identité libre</div>
              <div style={{ display: "flex", gap: 8, marginBottom: S.sm, flexWrap: "wrap" }}>
                {typeBtn("admin", "Super-admin", "accès total")}
              </div>
            </>
          )}
          <div style={legendeSection}>Comptes rattachés à une organisation</div>
          <div style={{ display: "flex", gap: 8, marginBottom: S.md, flexWrap: "wrap" }}>
            {typeBtn("commercial", "Commercial", "réalise les RDV")}
            {typeBtn("telepro", "Téléprospecteur", "crée les RDV")}
            {typeBtn("callcenter", "Call center", "équipe + responsable")}
          </div>

          {type === "admin" ? (
            <div style={{ display: "grid", gap: 10 }}>
              <Field label="Nom"><input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom complet" /></Field>
              <Field label="Pseudo (identifiant de connexion)"><input style={inp} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" /></Field>
              <Field label="Mot de passe"><input style={inp} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Field label="E-mail (facultatif)"><input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.ink2 }}>
                <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} /> Envoyer un mail avec l&apos;identifiant et le mot de passe
              </label>
              <button onClick={addUser} disabled={busy || !name.trim() || !username.trim() || !password.trim()} style={{ height: 44, borderRadius: R.sm, border: "none", background: busy ? T.surface3 : T.brand, color: busy ? T.ink3 : "#fff", fontWeight: 700, fontSize: 14.5, cursor: busy ? "not-allowed" : "pointer" }}>
                {busy ? "…" : "Créer le super-admin"}
              </button>
            </div>
          ) : type === "callcenter" ? (
            <div style={{ display: "grid", gap: 10 }}>
              <Field label="Nom du call center"><input style={inp} value={ccName} onChange={(e) => setCcName(e.target.value)} placeholder="Call Center Hanan" /></Field>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: T.ink }}>
                <input type="checkbox" checked={ccAgence} onChange={(e) => setCcAgence(e.target.checked)} /> Agence uniquement (pas de déplacement)
              </label>
              <Field label="Agence de rattachement" hint="Détermine le logo et les couleurs affichés à ce call center.">
                <select style={inp} value={ccParentId} onChange={(e) => setCcParentId(Number(e.target.value))}>
                  {agences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Combien on paie ce call center (€ / RDV + % négo)">
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={inp} type="number" min={0} value={ccPayBase} onChange={(e) => setCcPayBase(Number(e.target.value))} placeholder="€" />
                  <input style={inp} type="number" min={0} max={100} value={ccPayPct} onChange={(e) => setCcPayPct(Number(e.target.value))} placeholder="%" />
                </div>
              </Field>
              {(ccPayBase > 0 || ccPayPct > 0) && (
                <Field label="Déclencheur">
                  <select style={inp} value={ccPayTrigger} onChange={(e) => setCcPayTrigger(e.target.value as "signed" | "honored")}>
                    <option value="signed">Au mandat signé</option>
                    <option value="honored">Dès que le client est venu</option>
                  </select>
                </Field>
              )}
              <div style={legendeSection}>Responsable du call center</div>
              <Field label="Nom"><input style={inp} value={rName} onChange={(e) => setRName(e.target.value)} /></Field>
              <Field label="Pseudo (identifiant)"><input style={inp} value={rUsername} onChange={(e) => setRUsername(e.target.value.toLowerCase())} autoCapitalize="none" /></Field>
              <Field label="Mot de passe"><input style={inp} value={rPass} onChange={(e) => setRPass(e.target.value)} /></Field>
              <Field label="E-mail (facultatif)"><input style={inp} type="email" value={rEmail} onChange={(e) => setREmail(e.target.value)} /></Field>
              <Field label="Téléphone (facultatif)"><input style={inp} value={rPhone} onChange={(e) => setRPhone(e.target.value)} /></Field>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.ink2 }}>
                <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} /> Envoyer un mail avec l&apos;identifiant et le mot de passe
              </label>
              <button onClick={addCallCenter} disabled={busy || !ccName.trim() || !rName.trim() || !rUsername.trim() || !rPass.trim()} style={{ height: 44, borderRadius: R.sm, border: "none", background: busy ? T.surface3 : T.brand, color: busy ? T.ink3 : "#fff", fontWeight: 700, fontSize: 14.5, cursor: busy ? "not-allowed" : "pointer" }}>
                {busy ? "…" : "Créer le call center"}
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <Field label="Nom"><input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "commercial" ? "Jérémy Bonamy" : "Sarah"} /></Field>
              <Field label="Pseudo (identifiant de connexion)"><input style={inp} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" /></Field>
              <Field label="Mot de passe"><input style={inp} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Field label="E-mail (facultatif)"><input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              {type === "commercial" && <Field label="Téléphone" hint="Utilisé dans les mails et SMS envoyés aux clients."><input style={inp} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>}
              {type === "commercial" && (
                <Field label="Barème (€ / RDV signé + % négo)" hint="Ce que ce commercial paye par RDV — 0 par défaut, c'est à toi de le fixer.">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={inp} type="number" min={0} value={commBase} onChange={(e) => setCommBase(Number(e.target.value))} placeholder="€" />
                    <input style={inp} type="number" min={0} max={100} value={commPct} onChange={(e) => setCommPct(Number(e.target.value))} placeholder="%" />
                  </div>
                </Field>
              )}
              {type === "telepro" && (
                <Field label="Barème par défaut (€ / RDV signé + % négo)" hint="Utilisé tant qu'aucune affiliation plateforme/commercial n'est réglée ci-dessous.">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={inp} type="number" min={0} value={teleBase} onChange={(e) => setTeleBase(Number(e.target.value))} placeholder="€" />
                    <input style={inp} type="number" min={0} max={100} value={telePct} onChange={(e) => setTelePct(Number(e.target.value))} placeholder="%" />
                  </div>
                </Field>
              )}
              {type === "commercial" && (
                <Field label="Rattachement" hint="Un commercial se rattache à une agence entière, jamais à un call center précis.">
                  <select style={inp} value={attachCC} onChange={(e) => setAttachCC(Number(e.target.value))}>
                    {agences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </Field>
              )}
              {type === "telepro" && (
                <Field label="Rattachement" hint="Une agence entière (indépendant qui travaille pour elle), ou un call center précis.">
                  <select style={inp} value={attachCC} onChange={(e) => setAttachCC(Number(e.target.value))}>
                    {agences.map((a) => (
                      <optgroup key={a.id} label={a.name}>
                        <option value={a.id}>{a.name} (agence)</option>
                        {callCenters.filter((c) => c.parent_id === a.id).map((c) => <option key={c.id} value={c.id}>↳ {c.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Field>
              )}
              {type === "telepro" && (
                <Field label="Affiliation (facultatif)" hint="Rattache ce téléprospecteur à une plateforme (payé par la structure) ou à un commercial précis (qui le paie directement) — remplace le barème par défaut ci-dessus.">
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <button type="button" onClick={() => setAffKind("none")} style={{ height: 32, padding: "0 12px", borderRadius: R.sm, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: affKind === "none" ? "none" : `1px solid ${T.line}`, background: affKind === "none" ? T.ink : T.surface, color: affKind === "none" ? "#fff" : T.ink2 }}>Aucune</button>
                    <button type="button" onClick={() => setAffKind("platform")} style={{ height: 32, padding: "0 12px", borderRadius: R.sm, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: affKind === "platform" ? "none" : `1px solid ${T.line}`, background: affKind === "platform" ? T.ink : T.surface, color: affKind === "platform" ? "#fff" : T.ink2 }}>Plateforme</button>
                    <button type="button" onClick={() => setAffKind("commercial")} style={{ height: 32, padding: "0 12px", borderRadius: R.sm, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: affKind === "commercial" ? "none" : `1px solid ${T.line}`, background: affKind === "commercial" ? T.ink : T.surface, color: affKind === "commercial" ? "#fff" : T.ink2 }}>Commercial précis</button>
                  </div>
                  {affKind === "platform" && (
                    <select style={{ ...inp, marginBottom: 8 }} value={affPlatform} onChange={(e) => setAffPlatform(e.target.value)}>
                      <option value="">— choisir —</option>
                      {platforms.filter((p) => p.active).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  )}
                  {affKind === "commercial" && (
                    <select style={{ ...inp, marginBottom: 8 }} value={affCommercial} onChange={(e) => setAffCommercial(e.target.value)}>
                      <option value="">— choisir —</option>
                      {users.filter((u) => u.is_commercial).map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
                    </select>
                  )}
                  {affKind !== "none" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input style={inp} type="number" min={0} value={affBase} onChange={(e) => setAffBase(Number(e.target.value))} placeholder="€ fixe" />
                      <input style={inp} type="number" min={0} max={100} value={affPct} onChange={(e) => setAffPct(Number(e.target.value))} placeholder="% négo" />
                      <select style={inp} value={affTrigger} onChange={(e) => setAffTrigger(e.target.value as "signed" | "honored")}>
                        <option value="signed">Au signé</option>
                        <option value="honored">À l'honoré</option>
                      </select>
                    </div>
                  )}
                </Field>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.ink2 }}>
                <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} /> Envoyer un mail avec l&apos;identifiant et le mot de passe
              </label>
              <button onClick={addUser} disabled={busy || !name.trim() || !username.trim() || !password.trim()} style={{ height: 44, borderRadius: R.sm, border: "none", background: busy ? T.surface3 : T.brand, color: busy ? T.ink3 : "#fff", fontWeight: 700, fontSize: 14.5, cursor: busy ? "not-allowed" : "pointer" }}>
                {busy ? "…" : type === "commercial" ? "Créer le commercial" : "Créer le téléprospecteur"}
              </button>
            </div>
          )}
        </Fenetre>
      )}

      {recapOuvert && (
        <Fenetre titre="Récap télépros — combien on leur doit" onFermer={() => setRecapOuvert(false)}>
          {recapBusy ? (
            <div style={{ color: T.ink2, fontSize: 14 }}>Calcul en cours…</div>
          ) : !teleproEarnings || teleproEarnings.length === 0 ? (
            <div style={{ color: T.ink2, fontSize: 14 }}>Aucun téléprospecteur actif.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: T.ink3, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    <th style={{ padding: "6px 8px" }}>Télépro</th>
                    <th style={{ padding: "6px 8px" }}>Call center</th>
                    <th style={{ padding: "6px 8px" }}>Barème</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>RDV signés</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Dû</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Payé</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {teleproEarnings.map((t) => (
                    <tr key={t.email} style={{ borderTop: `1px solid ${T.line}` }}>
                      <td style={{ padding: "8px" }}>{t.name}</td>
                      <td style={{ padding: "8px", color: T.ink2 }}>{t.callCenter}</td>
                      <td style={{ padding: "8px", color: T.ink2 }}>{t.base}€{t.pct > 0 ? ` + ${t.pct}%` : ""}</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>{t.signes}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: 700 }}>{t.du.toFixed(0)} €</td>
                      <td style={{ padding: "8px", textAlign: "right", color: T.ink2 }}>{t.paye.toFixed(0)} €</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: t.solde > 0 ? T.danger : T.ink2 }}>{t.solde.toFixed(0)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Fenetre>
      )}

      {vacationsOuvert && (
        <Fenetre titre="🏖️ Vacances & délégations" onFermer={() => setVacationsOuvert(false)}>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: T.ink2, lineHeight: 1.5 }}>
            Chaque commercial règle ses propres vacances (page Paramètres). Ici tu vois qui est indisponible
            et tu décides qui opère à sa place — le RDV reste enregistré au nom du commercial titulaire,
            la commission ne change pas.
          </p>
          {vacationsBusy ? (
            <div style={{ color: T.ink2, fontSize: 14 }}>Chargement…</div>
          ) : !vacationRows || vacationRows.length === 0 ? (
            <div style={{ color: T.ink2, fontSize: 14 }}>Aucun commercial actif.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {vacationRows.filter((r) => r.timeOff.length > 0 || r.delegations.length > 0).length === 0 ? (
                <div style={{ color: T.ink2, fontSize: 14 }}>Aucune vacance déclarée pour l&apos;instant.</div>
              ) : vacationRows.filter((r) => r.timeOff.length > 0 || r.delegations.length > 0).map((r) => {
                const enCours = r.timeOff.some((t) => t.end_date >= todayISO);
                const dates = delegateDates[r.email] ?? { start: "", end: "" };
                return (
                  <div key={r.email} style={{ background: enCours ? "#fef2f2" : T.surface2, border: `1px solid ${T.line}`, borderRadius: R.md, padding: S.md }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <strong style={{ fontSize: 14.5 }}>{r.name}</strong>
                      {enCours && <Badge ton="danger">Indisponible</Badge>}
                    </div>
                    {r.timeOff.map((t) => (
                      <div key={t.id} style={{ fontSize: 13, color: T.ink2, marginBottom: 2 }}>
                        🏖️ Du <strong>{t.start_date.split("-").reverse().join("/")}</strong> au <strong>{t.end_date.split("-").reverse().join("/")}</strong>{t.label ? ` · ${t.label}` : ""}
                      </div>
                    ))}
                    {r.delegations.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {r.delegations.map((dg) => (
                          <div key={dg.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: T.surface, borderRadius: R.sm, padding: "6px 10px", marginBottom: 4, fontSize: 13 }}>
                            <span><strong>{dg.delegate_name}</strong> opère du <strong>{dg.start_date.split("-").reverse().join("/")}</strong> au <strong>{dg.end_date.split("-").reverse().join("/")}</strong></span>
                            <button onClick={() => retirerDelegation(r.email, dg.id)} style={{ border: "none", background: "none", color: T.danger, cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>Retirer</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                      <Field label="Opéré par">
                        <select value={delegatePick[r.email] ?? ""} onChange={(e) => setDelegatePick((m) => ({ ...m, [r.email]: e.target.value }))} style={{ ...champ, minWidth: 180 }}>
                          <option value="">— Choisir —</option>
                          {vacationCommercials.filter((c) => c.email.toLowerCase() !== r.email.toLowerCase()).map((c) => <option key={c.email} value={c.email}>{c.name}</option>)}
                        </select>
                      </Field>
                      <div style={{ minWidth: 320, flex: "1 1 320px" }}>
                        <DateRange from={dates.start} to={dates.end} onChange={(v) => setDelegateDates((m) => ({ ...m, [r.email]: { start: v.from, end: v.to } }))} />
                      </div>
                      <button onClick={() => assignerDelegue(r.email)} style={{ height: 38, padding: "0 14px", borderRadius: R.sm, border: "none", background: T.brand, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                        + Assigner
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Fenetre>
      )}

      {roleModalUser && (
        <Fenetre titre={`Rôles de ${roleModalUser.name}`} onFermer={() => setRoleModalUser(null)}>
          <div style={{ display: "grid", gap: 8 }}>
            {([
              { patchKey: "isCommercial", userKey: "is_commercial", label: "Commercial", desc: "Réalise les RDV, reçoit les leads." },
              { patchKey: "isTeleprospector", userKey: "is_teleprospector", label: "Téléprospecteur", desc: "Crée les RDV pour le compte de commerciaux." },
            ] as const).map((r) => {
              const on = !!roleModalUser[r.userKey];
              return (
                <label key={r.patchKey} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: R.md, border: `1px solid ${on ? T.brand : T.line}`, background: on ? "rgba(0,0,0,0.02)" : T.surface, cursor: "pointer" }}>
                  <input
                    type="checkbox" checked={on} style={{ marginTop: 3, width: 16, height: 16 }}
                    onChange={() => {
                      patch(roleModalUser.id, { [r.patchKey]: !on });
                      setRoleModalUser((u) => (u ? { ...u, [r.userKey]: !on } : u));
                    }}
                  />
                  <span>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: T.ink }}>{r.label}</div>
                    <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 1 }}>{r.desc}</div>
                  </span>
                </label>
              );
            })}
          </div>
          <p style={{ marginTop: S.md, marginBottom: S.md, fontSize: 12, color: T.ink3 }}>Les rôles sont cumulables : un même compte peut être plusieurs choses à la fois.</p>
          <button
            onClick={() => { patch(roleModalUser.id, { active: roleModalUser.active === false }); setRoleModalUser((u) => (u ? { ...u, active: u.active === false } : u)); }}
            style={{ width: "100%", height: 40, borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: roleModalUser.active === false ? T.brand : T.danger, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            {roleModalUser.active === false ? "Réactiver ce compte" : "Désactiver ce compte"}
          </button>
        </Fenetre>
      )}

      {assignModalUser && (() => {
        const u = assignModalUser;
        const agenceId = rootOf(Number(u.call_center_id));
        const coms = agenceId ? commercialsOfAgence(agenceId) : [];
        const mine = teleproAssignments.filter((a) => a.telepro_email === u.email.toLowerCase());
        const isOn = (ce: string) => mine.some((a) => a.commercial_email === ce.toLowerCase());
        const prioOf = (ce: string) => mine.find((a) => a.commercial_email === ce.toLowerCase())?.priority ?? 0;
        return (
          <Fenetre titre={`Commerciaux assignés — ${u.name}`} onFermer={() => setAssignModalUser(null)}>
            <p style={{ marginTop: 0, fontSize: 13, color: T.ink2, lineHeight: 1.5 }}>
              Aucune case cochée = tous les commerciaux de l&apos;agence sont proposés. Coche pour restreindre à certains, et donne une priorité (1 = en premier) pour l&apos;attribution automatique ci-dessous.
            </p>
            {coms.length === 0 ? (
              <div style={{ color: T.ink2, fontSize: 14 }}>Aucun commercial dans cette agence pour l&apos;instant.</div>
            ) : (
              <div style={{ display: "grid", gap: 6, marginBottom: S.md }}>
                {coms.map((c) => {
                  const on = isOn(c.email);
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: R.sm, border: `1px solid ${on ? T.brand : T.line}` }}>
                      <input type="checkbox" checked={on} onChange={() => toggleTeleproAssign(u.email, c.email, on)} style={{ width: 16, height: 16 }} />
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.ink }}>{c.name}</span>
                      {on && (
                        <>
                          <span style={{ fontSize: 12, color: T.ink3 }}>Priorité</span>
                          <input
                            type="number" min={0} defaultValue={prioOf(c.email)}
                            onBlur={(e) => setTeleproPriority(u.email, c.email, Number(e.target.value))}
                            style={{ width: 56, height: 30, padding: "0 8px", borderRadius: R.sm, border: `1px solid ${T.line}`, fontSize: 13 }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: R.md, border: `1px solid ${u.auto_assign ? T.brand : T.line}`, cursor: "pointer" }}>
              <input
                type="checkbox" checked={!!u.auto_assign} style={{ marginTop: 3, width: 16, height: 16 }}
                onChange={() => { patch(u.id, { autoAssign: !u.auto_assign }); setAssignModalUser((x) => (x ? { ...x, auto_assign: !x.auto_assign } : x)); }}
              />
              <span>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: T.ink }}>🤖 Attribution automatique</div>
                <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 1 }}>Le système choisit seul le commercial (ordre de priorité ci-dessus) à la prise de RDV. Décoché : {u.name.split(" ")[0]} choisit lui-même.</div>
              </span>
            </label>
          </Fenetre>
        );
      })()}

      {affModalUser && (
        <Fenetre titre={`Affiliation — ${affModalUser.name}`} onFermer={() => setAffModalUser(null)}>
          <p style={{ marginTop: 0, fontSize: 13, color: T.ink2, lineHeight: 1.5 }}>
            Une seule affiliation à la fois : plateforme (payé par la structure) ou commercial précis (qui le paie directement). Sans affiliation, ce téléprospecteur reste sur son barème par défaut.
          </p>
          <div style={{ display: "flex", gap: 6, marginBottom: S.md }}>
            <button type="button" onClick={() => setAffModalKind("none")} style={{ height: 32, padding: "0 12px", borderRadius: R.sm, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: affModalKind === "none" ? "none" : `1px solid ${T.line}`, background: affModalKind === "none" ? T.ink : T.surface, color: affModalKind === "none" ? "#fff" : T.ink2 }}>Aucune</button>
            <button type="button" onClick={() => setAffModalKind("platform")} style={{ height: 32, padding: "0 12px", borderRadius: R.sm, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: affModalKind === "platform" ? "none" : `1px solid ${T.line}`, background: affModalKind === "platform" ? T.ink : T.surface, color: affModalKind === "platform" ? "#fff" : T.ink2 }}>Plateforme</button>
            <button type="button" onClick={() => setAffModalKind("commercial")} style={{ height: 32, padding: "0 12px", borderRadius: R.sm, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: affModalKind === "commercial" ? "none" : `1px solid ${T.line}`, background: affModalKind === "commercial" ? T.ink : T.surface, color: affModalKind === "commercial" ? "#fff" : T.ink2 }}>Commercial précis</button>
          </div>
          {affModalKind === "platform" && (
            <Field label="Plateforme">
              <select style={inp} value={affModalPlatform} onChange={(e) => setAffModalPlatform(e.target.value)}>
                <option value="">— choisir —</option>
                {platforms.filter((p) => p.active).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </Field>
          )}
          {affModalKind === "commercial" && (
            <Field label="Commercial">
              <select style={inp} value={affModalCommercial} onChange={(e) => setAffModalCommercial(e.target.value)}>
                <option value="">— choisir —</option>
                {users.filter((u) => u.is_commercial).map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
              </select>
            </Field>
          )}
          {affModalKind !== "none" && (
            <Field label="€ fixe / RDV + % négo">
              <div style={{ display: "flex", gap: 8 }}>
                <input style={inp} type="number" min={0} value={affModalBase} onChange={(e) => setAffModalBase(Number(e.target.value))} placeholder="€" />
                <input style={inp} type="number" min={0} max={100} value={affModalPct} onChange={(e) => setAffModalPct(Number(e.target.value))} placeholder="%" />
              </div>
            </Field>
          )}
          {affModalKind !== "none" && (
            <Field label="Déclencheur">
              <select style={inp} value={affModalTrigger} onChange={(e) => setAffModalTrigger(e.target.value as "signed" | "honored")}>
                <option value="signed">Au mandat signé</option>
                <option value="honored">Dès que le client est venu</option>
              </select>
            </Field>
          )}
          <button onClick={enregistrerAffiliation} disabled={affModalBusy} style={{ marginTop: S.md, height: 44, width: "100%", borderRadius: R.sm, border: "none", background: affModalBusy ? T.surface3 : T.brand, color: affModalBusy ? T.ink3 : "#fff", fontWeight: 700, fontSize: 14.5, cursor: affModalBusy ? "not-allowed" : "pointer" }}>
            {affModalBusy ? "…" : "Enregistrer"}
          </button>
        </Fenetre>
      )}

      {assignAmountFor && (
        <Fenetre titre={`${assignAmountFor.user.name} — combien il paye pour ce call center`} onFermer={() => setAssignAmountFor(null)}>
          <p style={{ marginTop: 0, fontSize: 13, color: T.ink2, lineHeight: 1.5 }}>
            Facultatif — laisse à 0 si ce commercial ne paye rien de spécifique pour ce call center.
          </p>
          <Field label="€ fixe / RDV + % négo">
            <div style={{ display: "flex", gap: 8 }}>
              <input style={inp} type="number" min={0} value={assignBase} onChange={(e) => setAssignBase(Number(e.target.value))} placeholder="€" />
              <input style={inp} type="number" min={0} max={100} value={assignPct} onChange={(e) => setAssignPct(Number(e.target.value))} placeholder="%" />
            </div>
          </Field>
          <Field label="Ça se déclenche quand ?">
            <select style={inp} value={assignTrigger} onChange={(e) => setAssignTrigger(e.target.value as "signed" | "honored")}>
              <option value="signed">Au mandat signé</option>
              <option value="honored">Dès que le client est venu</option>
            </select>
          </Field>
          <button onClick={confirmerAssignation} disabled={assignBusy} style={{ marginTop: S.md, height: 44, width: "100%", borderRadius: R.sm, border: "none", background: assignBusy ? T.surface3 : T.brand, color: assignBusy ? T.ink3 : "#fff", fontWeight: 700, fontSize: 14.5, cursor: assignBusy ? "not-allowed" : "pointer" }}>
            {assignBusy ? "…" : "Enregistrer"}
          </button>
        </Fenetre>
      )}
    </>
  );

  // Carte d'un compte (badges, rémunération, actions).
  function renderUser(u: User) {
    // Un compte tient sur une ligne : identité à gauche, actions à droite.
    const petit: React.CSSProperties = { height: 32, padding: "0 12px", borderRadius: R.sm, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
    const bascule = (actif: boolean): React.CSSProperties => ({
      ...petit,
      border: actif ? "none" : `1px solid ${T.line}`,
      background: actif ? T.ink : T.surface,
      color: actif ? "#fff" : T.ink2,
    });
    return (
      <div key={u.id} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: R.md, padding: S.md }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: S.md, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, color: T.ink, fontSize: 15.5 }}>{u.name}</span>
              {estEnLigne(u) && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: "3px 9px", borderRadius: 999 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
                  En ligne
                </span>
              )}
              {u.is_commercial && <Badge ton="succes">Commercial</Badge>}
              {u.is_teleprospector && <Badge ton="info">Téléprospecteur</Badge>}
              {u.role === "responsable" && <Badge ton="neutre">Responsable</Badge>}
              {u.active === false && <Badge ton="danger">Désactivé</Badge>}
            </div>
            <div style={{ fontSize: 13.5, color: T.ink2, marginTop: 3 }}>
              {u.username ? `@${u.username}` : ""}{u.email && !u.email.endsWith("no-mail.local") ? ` · ${u.email}` : ""}{u.phone ? ` · ${u.phone}` : ""}
            </div>
            {u.call_center_name && u.call_center_name !== u.agence_name && (
              <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 2 }}>{u.call_center_name}</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {isAdmin && u.role !== "admin" && (
              <>
                <button onClick={() => seConnecterComme(u)} style={{ ...petit, border: "none", background: T.brand, color: "#fff" }}>Voir son compte</button>
                <button onClick={() => definirMotDePasse(u)} style={{ ...petit, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2 }}>Mot de passe</button>
                <button onClick={() => copierLienDe(u.call_center_id, `Lien de connexion pour ${u.name}`)} title="Copie le lien de connexion permanent de son agence" style={{ ...petit, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2 }}>Copier le lien</button>
              </>
            )}
            {isAdmin && (
              <button onClick={() => setRoleModalUser(u)} style={{ ...petit, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2 }}>Rôles</button>
            )}
            {u.role !== "admin" && (
              <button onClick={() => del(u)} style={{ ...petit, border: `1px solid ${T.line}`, background: T.surface, color: T.danger }}>Supprimer</button>
            )}
          </div>
        </div>

        {isAdmin && u.is_teleprospector && (() => {
          const agenceId = rootOf(Number(u.call_center_id));
          const coms = agenceId ? commercialsOfAgence(agenceId) : [];
          if (coms.length === 0) return null;
          const mine = teleproAssignments.filter((a) => a.telepro_email === u.email.toLowerCase());
          return (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: S.sm, paddingTop: S.sm, borderTop: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 12, color: T.ink3 }}>
                {mine.length === 0 ? "Commerciaux assignés : tous" : `Commerciaux assignés : ${mine.length} (${mine.map((a) => coms.find((c) => c.email.toLowerCase() === a.commercial_email)?.name ?? a.commercial_email).join(", ")})`}
                {u.auto_assign ? " · 🤖 attribution automatique" : ""}
              </span>
              <button onClick={() => setAssignModalUser(u)} style={{ ...petit, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2 }}>Assigner des commerciaux</button>
            </div>
          );
        })()}

        {isAdmin && u.is_teleprospector && (() => {
          const aff = affiliations.find((a) => a.payee_email.toLowerCase() === u.email.toLowerCase());
          return (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: S.sm, paddingTop: S.sm, borderTop: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 12, color: T.ink3 }}>Barème par défaut (€ + % négo) :</span>
              <input id={`tb-${u.id}`} type="number" min={0} defaultValue={u.commission_base ?? 0} style={{ width: 70, height: 30, padding: "0 8px", borderRadius: R.sm, border: `1px solid ${T.line}`, fontSize: 13 }} />
              <input id={`tp-${u.id}`} type="number" min={0} max={100} defaultValue={u.commission_pct ?? 0} style={{ width: 60, height: 30, padding: "0 8px", borderRadius: R.sm, border: `1px solid ${T.line}`, fontSize: 13 }} />
              <button
                onClick={() => {
                  const base = Number((document.getElementById(`tb-${u.id}`) as HTMLInputElement)?.value ?? 0);
                  const pct = Number((document.getElementById(`tp-${u.id}`) as HTMLInputElement)?.value ?? 0);
                  patch(u.id, { commissionBase: base, commissionPct: pct });
                }}
                style={{ height: 30, padding: "0 12px", borderRadius: R.sm, border: "none", background: T.brand, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
              >
                Enregistrer
              </button>
              <span style={{ fontSize: 12, color: T.ink3, marginLeft: 8 }}>
                Affiliation : {aff ? (aff.platform ? `plateforme ${aff.platform}` : aff.commercial_name ?? aff.commercial_email) : "aucune"}
              </span>
              <button onClick={() => ouvrirAffiliation(u)} style={{ height: 30, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                Modifier
              </button>
            </div>
          );
        })()}

        {/* Rémunération : barèmes retirés le temps de refaire la page Barèmes (chiffres non fiables). */}
      </div>
    );
  }
}

export default function Page() {
  return <AppShell active="comptes"><Comptes /></AppShell>;
}
