"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders, getUser, setAuth } from "@/lib/client";
import { PageHeader, Card, Badge, Field, champ, T, R, S, DateRange } from "@/components/ui";


type User = {
  id: number; email: string; name: string; role: "admin" | "responsable" | "collab";
  is_commercial?: boolean; is_teleprospector?: boolean; phone?: string; active?: boolean;
  commission_base?: number; commission_pct?: number;
  call_center_id?: number; agence_name?: string; call_center_name?: string; username?: string; last_seen_at?: string | null;
};
type CallCenter = { id: number; name: string; agence_only: boolean; responsable_email: string; responsable_email_2?: string | null; gestionnaire_email?: string; parent_id: number | null; parent_name: string | null; commercials_count: number; telepros_count: number; brand_primary?: string; brand_dark?: string; logo_url?: string; header_dark?: boolean; telepro_pay_mode?: "gestionnaire" | "responsable" };
type Assignment = { call_center_id: number; commercial_email: string };
type TeleproAssignment = { telepro_email: string; commercial_email: string };
type Accord = { id: number; call_center_id: number | null; payee_email: string; payee_kind: string; base_eur: number; pct_nego: number };
type PricingAgreement = { id: number; call_center_id: number; commercial_name: string; base_amount: number; gestionnaire_amount: number | null; call_center_amount: number | null; status: string; trigger_kind?: string };
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
  const [pricingAgreements, setPricingAgreements] = useState<PricingAgreement[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<{ kind: "agence" | "cc"; id: number } | null>(null);
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
  // Mini-form "ajouter un télépro à CE call center"

  const [type, setType] = useState<"commercial" | "telepro" | "callcenter" | "admin">("commercial");
  // Compte commercial / télépro
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const schemeKey = "60"; // barème par défaut des commerciaux : la page Barèmes est en cours de refonte
  const [teleBase, setTeleBase] = useState(60); // barème libre du télépro créé (€ fixe / RDV signé)
  const [telePct, setTelePct] = useState(0);    // + % de la négociation
  const [attachCC, setAttachCC] = useState<number>(1); // rattachement du nouveau compte (agence / call center)
  // Call center
  const [ccName, setCcName] = useState("");
  const [ccAgence, setCcAgence] = useState(true);
  const [ccParentId, setCcParentId] = useState<number>(1); // agence de rattachement du nouveau call center
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
        const r2 = await fetch("/api/callcenters", { headers: authHeaders() });
        const d2 = await r2.json();
        if (d2.ok) { setCallCenters(d2.callCenters); setAssignments(d2.assignments); setAccords(d2.accords ?? []); setTeleproAssignments(d2.teleproAssignments ?? []); }
        // Vue lecture seule de ce qui est réglé dans la partie Barèmes (pricing_agreements).
        const r3 = await fetch("/api/pricing-agreements", { headers: authHeaders() });
        const d3 = await r3.json();
        if (d3.ok) setPricingAgreements(d3.agreements ?? []);
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

  async function addUser() {
    if (!name.trim() || !username.trim() || !password.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/users", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({
        type: type === "commercial" || type === "admin" ? type : "telepro", name, username, email, password, phone, schemeKey, callCenterId: attachCC,
        ...(type === "telepro" ? { commissionBase: teleBase, commissionPct: telePct } : {}),
      }) });
      const d = await res.json();
      if (d.ok) { setName(""); setUsername(""); setEmail(""); setPassword(""); setPhone(""); setTeleBase(60); setTelePct(0); load(); }
      else alert(d.error ?? "Erreur");
    } finally { setBusy(false); }
  }

  async function addCallCenter() {
    if (!ccName.trim() || !rName.trim() || !rUsername.trim() || !rPass.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/callcenters", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ name: ccName, agenceOnly: ccAgence, parentId: ccParentId, responsable: { name: rName, username: rUsername, email: rEmail, password: rPass, phone: rPhone } }) });
      const d = await res.json();
      if (d.ok) { setCcName(""); setRName(""); setRUsername(""); setREmail(""); setRPass(""); setRPhone(""); load(); }
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
  async function saveTheme(ccId: number, primary: string, dark: string) {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, action: "setTheme", primary, dark }) });
    const d = await res.json();
    if (d.ok) { alert("Couleurs enregistrées. Elles s'appliquent à la prochaine connexion des utilisateurs de cette franchise."); load(); }
    else alert(d.error ?? "Erreur");
  }
  async function saveAccords(cc: CallCenter) {
    const callEur = Number((document.getElementById(`acc-call-${cc.id}`) as HTMLInputElement)?.value ?? 0);
    const gestEur = Number((document.getElementById(`acc-gest-${cc.id}`) as HTMLInputElement)?.value ?? 0);
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: cc.id, action: "setAccords", callEur, gestEur, respEmail: cc.responsable_email, gestEmail: cc.gestionnaire_email || "" }) });
    const d = await res.json();
    if (d.ok) { alert(`Accord enregistré : ${callEur} € call center + ${gestEur} € gestionnaire par RDV signé (total ${callEur + gestEur} €).`); load(); }
    else alert(d.error ?? "Erreur");
  }
  async function setGestionnaire(ccId: number, email: string) {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, action: "setGestionnaire", email }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  async function setPayMode(ccId: number, payMode: "gestionnaire" | "responsable") {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, action: "setPayMode", payMode }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
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
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: ccId, email: u.email, action: assigned ? "unassign" : "assign" }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
  }
  const isTeleproAssigned = (teleproEmail: string, commercialEmail: string) =>
    teleproAssignments.some((a) => a.telepro_email === teleproEmail.toLowerCase() && a.commercial_email === commercialEmail.toLowerCase());
  async function toggleTeleproAssign(teleproEmail: string, commercialEmail: string, assigned: boolean) {
    const res = await fetch("/api/callcenters", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ callCenterId: 1, teleproEmail, commercialEmail, action: assigned ? "unassignTelepro" : "assignTelepro" }) });
    const d = await res.json();
    if (d.ok) load(); else alert(d.error ?? "Erreur");
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
    if (!confirm(`Supprimer le compte de ${u.name} ?`)) return;
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

  // Sélection courante dans l'arborescence : une agence ou un call center.
  const noeud = selection?.kind === "cc"
    ? callCenters.find((c) => c.id === selection.id)
    : agences.find((a) => a.id === selection?.id) ?? agences[0];
  const estAgence = !noeud?.parent_id;

  /** Comptes rattachés au nœud sélectionné. */
  const comptesDuNoeud = (): User[] => {
    if (!noeud) return [];
    if (estAgence) {
      const coms = commercialsOfAgence(noeud.id);
      const teles = users.filter((u) => u.is_teleprospector && Number(u.call_center_id) === noeud.id);
      return [...coms, ...teles];
    }
    return users.filter((u) => Number(u.call_center_id) === noeud.id);
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
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        <span style={{ fontSize: 12, opacity: 0.75 }}>{c.telepros_count}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            <button
              onClick={addAgence} disabled={busy}
              style={{ width: "100%", height: 36, marginTop: 8, borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              + Créer une agence
            </button>
          </aside>

          {/* ── Colonne droite : le détail du nœud sélectionné ── */}
          <div style={{ minWidth: 0 }}>
            {!noeud ? (
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
        <Fenetre titre={`Réglages — ${noeud.name}`} onFermer={() => setReglagesOuverts(false)}>
          <div style={{ display: "grid", gap: S.lg }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => renameCC(noeud.id, noeud.name)} style={{ height: 34, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Renommer</button>
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
                  <div style={legendeSection}>Couleurs de la marque</div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.ink2 }}>
                      Accent <input type="color" defaultValue={noeud.brand_primary || "#DB407A"} id={`th-p-${noeud.id}`} style={{ width: 46, height: 32, border: `1px solid ${T.line}`, borderRadius: R.sm, padding: 2, cursor: "pointer" }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.ink2 }}>
                      Foncé <input type="color" defaultValue={noeud.brand_dark || "#1a273a"} id={`th-d-${noeud.id}`} style={{ width: 46, height: 32, border: `1px solid ${T.line}`, borderRadius: R.sm, padding: 2, cursor: "pointer" }} />
                    </label>
                    <button
                      onClick={() => {
                        const pr = (document.getElementById(`th-p-${noeud.id}`) as HTMLInputElement)?.value;
                        const dk = (document.getElementById(`th-d-${noeud.id}`) as HTMLInputElement)?.value;
                        if (pr && dk) saveTheme(noeud.id, pr, dk);
                      }}
                      style={{ height: 34, padding: "0 14px", borderRadius: R.sm, border: "none", background: T.brand, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                    >
                      Enregistrer les couleurs
                    </button>
                  </div>
                  <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 8 }}>Appliqué à tous les comptes de la franchise à leur connexion.</div>
                </section>

                <section>
                  <div style={legendeSection}>Fond du bandeau</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setHeaderDark(noeud.id, false)} style={{ height: 34, padding: "0 14px", borderRadius: R.sm, fontSize: 13, fontWeight: 700, cursor: "pointer", border: noeud.header_dark ? `1px solid ${T.line}` : "none", background: noeud.header_dark ? T.surface : T.ink, color: noeud.header_dark ? T.ink2 : "#fff" }}>Clair</button>
                    <button onClick={() => setHeaderDark(noeud.id, true)} style={{ height: 34, padding: "0 14px", borderRadius: R.sm, fontSize: 13, fontWeight: 700, cursor: "pointer", border: noeud.header_dark ? "none" : `1px solid ${T.line}`, background: noeud.header_dark ? T.ink : T.surface, color: noeud.header_dark ? "#fff" : T.ink2 }}>Foncé</button>
                    <span style={{ fontSize: 12.5, color: T.ink3, alignSelf: "center" }}>foncé = pour les logos à écriture blanche</span>
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
                  <div style={legendeSection}>Gestionnaire</div>
                  <select value={noeud.gestionnaire_email ?? ""} onChange={(e) => e.target.value && setGestionnaire(noeud.id, e.target.value)} style={{ ...champ, maxWidth: 320 }}>
                    <option value="">— choisir —</option>
                    {users.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
                  </select>
                  <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 8 }}>
                    Celui qui a apporté ce call center. Il touche la marge sur chaque rendez-vous signé.
                  </div>
                </section>

                <section>
                  <div style={legendeSection}>Mode de rémunération des téléprospecteurs</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setPayMode(noeud.id, "gestionnaire")} style={{ height: 34, padding: "0 14px", borderRadius: R.sm, fontSize: 13, fontWeight: 700, cursor: "pointer", border: (noeud.telepro_pay_mode ?? "gestionnaire") === "gestionnaire" ? "none" : `1px solid ${T.line}`, background: (noeud.telepro_pay_mode ?? "gestionnaire") === "gestionnaire" ? T.brand : T.surface, color: (noeud.telepro_pay_mode ?? "gestionnaire") === "gestionnaire" ? "#fff" : T.ink2 }}>
                      Gestionnaire direct
                    </button>
                    <button onClick={() => setPayMode(noeud.id, "responsable")} style={{ height: 34, padding: "0 14px", borderRadius: R.sm, fontSize: 13, fontWeight: 700, cursor: "pointer", border: noeud.telepro_pay_mode === "responsable" ? "none" : `1px solid ${T.line}`, background: noeud.telepro_pay_mode === "responsable" ? T.brand : T.surface, color: noeud.telepro_pay_mode === "responsable" ? "#fff" : T.ink2 }}>
                      Responsable
                    </button>
                  </div>
                  <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 8 }}>
                    {(noeud.telepro_pay_mode ?? "gestionnaire") === "gestionnaire"
                      ? "Le gestionnaire fixe lui-même le barème (€/RDV) de chaque téléprospecteur de ce call center."
                      : "Le gestionnaire donne un montant global au call center ; la redistribution interne est décidée par le responsable."}
                    {" "}Édition toujours réservée au super-admin — ce réglage sert de repère dans la vue Rémunération ci-dessous.
                  </div>
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
                  <div style={legendeSection}>Accord de rémunération (par rendez-vous signé)</div>
                  {(() => {
                    const accCall = accords.find((x) => Number(x.call_center_id) === noeud.id && x.payee_kind === "call_center");
                    const accGest = accords.find((x) => Number(x.call_center_id) === noeud.id && x.payee_kind === "gestionnaire");
                    return (
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <Field label="Call center (€)">
                          <input id={`acc-call-${noeud.id}`} type="number" defaultValue={accCall ? Number(accCall.base_eur) : 30} style={{ ...champ, width: 120, textAlign: "right" }} />
                        </Field>
                        <Field label="Gestionnaire (€)">
                          <input id={`acc-gest-${noeud.id}`} type="number" defaultValue={accGest ? Number(accGest.base_eur) : 20} style={{ ...champ, width: 120, textAlign: "right" }} />
                        </Field>
                        <button onClick={() => saveAccords(noeud)} style={{ height: 44, padding: "0 16px", borderRadius: R.sm, border: "none", background: T.brand, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                          Enregistrer l&apos;accord
                        </button>
                      </div>
                    );
                  })()}
                </section>
              </>
            )}

            <section>
              <div style={legendeSection}>Commerciaux liés</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {users.filter((u) => u.is_commercial).map((u) => {
                  const dansNoeud = estAgence && rootOf(Number(u.call_center_id)) === noeud.id;
                  const on = dansNoeud || isAssigned(u.email, noeud.id);
                  return (
                    <button
                      key={u.id} type="button" disabled={dansNoeud}
                      title={dansNoeud ? "Compte rattaché à cette agence" : ""}
                      onClick={() => toggleAssign(u, noeud.id, isAssigned(u.email, noeud.id))}
                      style={{ height: 32, padding: "0 12px", borderRadius: R.sm, fontSize: 12.5, fontWeight: 700, cursor: dansNoeud ? "default" : "pointer", border: on ? "none" : `1px solid ${T.line}`, background: on ? T.ink : T.surface, color: on ? "#fff" : T.ink2, opacity: dansNoeud ? 0.8 : 1 }}
                    >
                      {on ? `✓ ${u.name}` : `+ ${u.name}`}
                    </button>
                  );
                })}
              </div>
            </section>

            {!estAgence && (
              <section>
                <div style={legendeSection}>💰 Rémunération — vue Barèmes (lecture seule)</div>
                <p style={{ fontSize: 12.5, color: T.ink3, margin: "0 0 10px" }}>
                  Ce qui est réglé dans la page Barèmes pour ce call center. Pour modifier, va sur Barèmes.
                </p>
                {(() => {
                  const deals = pricingAgreements.filter((p) => Number(p.call_center_id) === noeud.id && p.status === "active");
                  const telepros = users.filter((u) => u.is_teleprospector && Number(u.call_center_id) === noeud.id);
                  return (
                    <div style={{ display: "grid", gap: 10 }}>
                      {deals.length === 0 ? (
                        <div style={{ fontSize: 13, color: T.ink3 }}>Aucun accord actif avec un commercial dans Barèmes.</div>
                      ) : deals.map((d) => (
                        <div key={d.id} style={{ background: T.surface2, borderRadius: R.sm, padding: "8px 12px", fontSize: 13 }}>
                          <strong>{d.commercial_name}</strong> — {Number(d.base_amount)} € / RDV signé
                          {d.gestionnaire_amount != null && <span style={{ color: T.ink3 }}> (dont gestionnaire {Number(d.gestionnaire_amount)} €, call center {Number(d.call_center_amount)} €)</span>}
                        </div>
                      ))}
                      {telepros.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink3, margin: "6px 0 4px" }}>Barème par téléprospecteur</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {telepros.map((t) => (
                              <span key={t.id} style={{ fontSize: 12.5, background: T.surface2, borderRadius: 999, padding: "4px 10px" }}>
                                {t.name} : {Number(t.commission_base ?? 0)} €{Number(t.commission_pct ?? 0) > 0 ? ` + ${t.commission_pct}%` : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
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
        <Fenetre titre="Créer un compte" onFermer={() => setCreationOuverte(false)}>
          <div style={{ display: "flex", gap: 8, marginBottom: S.md, flexWrap: "wrap" }}>
            {typeBtn("commercial", "Commercial", "réalise les RDV")}
            {typeBtn("telepro", "Téléprospecteur", "crée les RDV")}
            {typeBtn("callcenter", "Call center", "équipe + responsable")}
            {isAdmin && typeBtn("admin", "Super-admin", "accès total")}
          </div>

          {type === "admin" ? (
            <div style={{ display: "grid", gap: 10 }}>
              <Field label="Nom"><input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom complet" /></Field>
              <Field label="Pseudo (identifiant de connexion)"><input style={inp} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" /></Field>
              <Field label="Mot de passe"><input style={inp} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Field label="E-mail (facultatif)"><input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
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
              <div style={legendeSection}>Responsable du call center</div>
              <Field label="Nom"><input style={inp} value={rName} onChange={(e) => setRName(e.target.value)} /></Field>
              <Field label="Pseudo (identifiant)"><input style={inp} value={rUsername} onChange={(e) => setRUsername(e.target.value.toLowerCase())} autoCapitalize="none" /></Field>
              <Field label="Mot de passe"><input style={inp} value={rPass} onChange={(e) => setRPass(e.target.value)} /></Field>
              <Field label="E-mail (facultatif)"><input style={inp} type="email" value={rEmail} onChange={(e) => setREmail(e.target.value)} /></Field>
              <Field label="Téléphone (facultatif)"><input style={inp} value={rPhone} onChange={(e) => setRPhone(e.target.value)} /></Field>
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
              {type === "telepro" && (
                <Field label="Commission (€ / RDV signé + % négo)" hint="Ce qui lui est dû, visible dans son 'Mes paiements'.">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={inp} type="number" min={0} value={teleBase} onChange={(e) => setTeleBase(Number(e.target.value))} placeholder="€" />
                    <input style={inp} type="number" min={0} max={100} value={telePct} onChange={(e) => setTelePct(Number(e.target.value))} placeholder="%" />
                  </div>
                </Field>
              )}
              <Field label="Rattachement">
                <select style={inp} value={attachCC} onChange={(e) => setAttachCC(Number(e.target.value))}>
                  {agences.map((a) => (
                    <optgroup key={a.id} label={a.name}>
                      <option value={a.id}>{a.name} (agence)</option>
                      {callCenters.filter((c) => c.parent_id === a.id).map((c) => <option key={c.id} value={c.id}>↳ {c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </Field>
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
              </>
            )}
            {u.role !== "admin" && (
              <button onClick={() => del(u)} style={{ ...petit, border: `1px solid ${T.line}`, background: T.surface, color: T.danger }}>Supprimer</button>
            )}
          </div>
        </div>

        {isAdmin && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: S.sm, paddingTop: S.sm, borderTop: `1px solid ${T.line}` }}>
            <span style={{ fontSize: 12, color: T.ink3, alignSelf: "center", marginRight: 4 }}>Rôles :</span>
            <button onClick={() => patch(u.id, { isCommercial: !u.is_commercial })} style={bascule(!!u.is_commercial)}>Commercial</button>
            <button onClick={() => patch(u.id, { isTeleprospector: !u.is_teleprospector })} style={bascule(!!u.is_teleprospector)}>Téléprospecteur</button>
            <button onClick={() => patch(u.id, { active: u.active === false })} style={{ ...petit, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2 }}>{u.active === false ? "Réactiver" : "Désactiver"}</button>
          </div>
        )}

        {isAdmin && u.is_teleprospector && (() => {
          const agenceId = rootOf(Number(u.call_center_id));
          const coms = agenceId ? commercialsOfAgence(agenceId) : [];
          if (coms.length === 0) return null;
          return (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: S.sm, paddingTop: S.sm, borderTop: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 12, color: T.ink3, alignSelf: "center", marginRight: 4 }}>Commerciaux assignés (vide = tous) :</span>
              {coms.map((c) => {
                const on = isTeleproAssigned(u.email, c.email);
                return (
                  <button key={c.id} onClick={() => toggleTeleproAssign(u.email, c.email, on)} style={bascule(on)}>{c.name}</button>
                );
              })}
            </div>
          );
        })()}

        {isAdmin && u.is_teleprospector && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: S.sm, paddingTop: S.sm, borderTop: `1px solid ${T.line}` }}>
            <span style={{ fontSize: 12, color: T.ink3 }}>Commission (€ + % négo) :</span>
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
          </div>
        )}

        {/* Rémunération : barèmes retirés le temps de refaire la page Barèmes (chiffres non fiables). */}
      </div>
    );
  }
}

export default function Page() {
  return <Shell active="comptes"><Comptes /></Shell>;
}
