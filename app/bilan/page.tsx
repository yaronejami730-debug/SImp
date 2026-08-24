"use client";

import { useEffect, useMemo, useState } from "react";
import { setCached } from "@/lib/cache";
import { PageHeader, Card, StatCard, StatRow, Badge, T, S, R } from "@/components/ui";
import Shell from "@/components/Shell";
import { authHeaders, getUser } from "@/lib/client";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";
const GREEN = "#16a34a";
const GREEN_DARK = "#15803d";
const ORANGE = "#ea580c";
const YELLOW = "#ca8a04";
const GRAY = "#6b7280";
const RED = "#dc2626";
const CYAN = "#0891b2"; // annonce en ligne — mandat en cours

const DEFAULT_SCHEME = { base: 50, pct: 10 }; // repli si le commercial n'a pas de compte / barème
const LATE_DAYS = 30; // une facture émise non payée depuis +30 j = retard

type Sign = "" | "signed" | "listed" | "thinking" | "unsigned";
type InvStatus = "" | "requested" | "invoiced" | "paid";

type Appt = {
  id: string; startDateTime: string | null; createdAt: string | null;
  firstName: string; lastName: string; email: string; phone: string;
  platform: string; carBrand: string; carModel: string; carFinish: string;
  immatriculation: string; commercial: string; commercialEmail: string; teleprospector: string;
  type: string; present: boolean; presence: "present" | "absent" | "unknown"; signStatus: Sign; signStatusAt: string | null;
  note: string; negotiation: number; owner: string; cancelled: boolean;
  bcSigned: boolean; bcSignedAt: string | null; vehicleSold: boolean; soldAt: string | null;
  parkingRequested: boolean; parkingSent: boolean;
  ffStatus: InvStatus; ffNo: string; ffDate: string | null; ffPaidDate: string | null; ffComment: string;
  commStatus: InvStatus; commNo: string; commDate: string | null; commPaidDate: string | null; commComment: string;
  mandatRemoved: boolean; mandatRemovedAt: string | null; mandatRemovedReason: string;
  history: { t: string; at: string; info?: string }[];
};

type MsgStat = { event_id: string; emails: number; sms: number; last_sent: string };

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const eur = (n: number) => (n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const vehicleLabel = (a: Appt) => [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" ");
// Clé de fusion d'un nom : sans accents, minuscules, mots triés → "Jérémy Bonamy" == "Bonamy jeremy".
const nameKey = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).sort().join(" ");
// Nb de caractères accentués (pour préférer la variante la mieux orthographiée comme affichage canonique).
const accentScore = (s: string) => ((s || "").match(/[À-ÿ]/g) || []).length;
// Alias d'affichage (clé = nameKey de la valeur stockée en base) → nom affiché voulu.
// Ne modifie PAS les données, juste l'affichage/fusion dans le bilan.
const COMMERCIAL_ALIAS: Record<string, string> = {
  // (aucun alias actif — les noms s'affichent tels qu'en base)
};
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const fmtDateTime = (iso: string | null) => iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const daysSince = (iso: string | null) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0;

// ───────── Logique métier : dérive l'état de facturation d'un dossier ─────────
type FFState = "none" | "to_invoice" | "requested" | "invoiced" | "paid";
type CommState = "pending_bc" | "to_invoice" | "requested" | "invoiced" | "paid";
type Row = {
  a: Appt;
  mandatSigned: boolean;
  mandatRemoved: boolean; // mandat signé puis retiré (client plus sous mandat)
  ffBillable: boolean;    // frais fixes encore dus (mandat actif, ou déjà facturés avant retrait)
  bc: boolean;
  ffAmount: number; ffState: FFState;
  commAmount: number; commState: CommState;
  ffToInvoice: number; commToInvoice: number;
  ffInvoiced: number; commInvoiced: number;
  ffPaid: number; commPaid: number;
  global: { key: string; label: string; ton: string };
  late: boolean;
  cancelled: boolean;
  reprogrammed: boolean; reprogrammedAt: string | null;
  noStatus: boolean; // RDV passé, non annulé, présent/non-décidé, AUCUN statut de signature
  absent: boolean;   // client absent au RDV -> état terminal, rien à faire
};

function derive(a: Appt, scheme: { base: number; pct: number } = DEFAULT_SCHEME): Row {
  const cancelled = a.cancelled;
  const reschedEntries = (a.history || []).filter((h) => h.t === "rescheduled");
  const reprogrammed = reschedEntries.length > 0;
  const reprogrammedAt = reprogrammed ? reschedEntries[reschedEntries.length - 1].at : null;
  const past = a.startDateTime ? new Date(a.startDateTime) < new Date() : false;
  // Client absent = état terminal, rien à faire. (présence marquée "0")
  const absent = !cancelled && a.presence === "absent";
  // Sans statut = présent (ou présence non décidée) MAIS aucun statut de signature posé.
  // L'absent N'EST PAS "sans statut" : il n'y a rien à statuer.
  const noStatus = !cancelled && !absent && past && (a.signStatus ?? "") === "";

  const mandatWasSigned = !cancelled && a.signStatus === "signed";
  const mandatRemoved = mandatWasSigned && a.mandatRemoved;
  const mandatSigned = mandatWasSigned && !mandatRemoved; // mandat actif
  // Frais fixes encore dus : mandat actif, OU déjà facturés/payés avant le retrait (on les garde).
  const ffBillable = mandatWasSigned && (!mandatRemoved || a.ffStatus === "invoiced" || a.ffStatus === "paid");
  const bc = !cancelled && a.bcSigned;
  const ffAmount = ffBillable ? scheme.base : 0;
  const commAmount = bc ? Math.round((scheme.pct / 100) * (a.negotiation || 0)) : 0;
  // « requested » = le commercial a demandé la facture ; elle n'est pas encore émise.
  const ffState: FFState = !ffBillable ? "none"
    : a.ffStatus === "paid" ? "paid" : a.ffStatus === "invoiced" ? "invoiced" : a.ffStatus === "requested" ? "requested" : "to_invoice";
  const commState: CommState = !bc ? "pending_bc"
    : a.commStatus === "paid" ? "paid" : a.commStatus === "invoiced" ? "invoiced" : a.commStatus === "requested" ? "requested" : "to_invoice";

  const ffToInvoice = ffState === "to_invoice" || ffState === "requested" ? scheme.base : 0;
  const commToInvoice = commState === "to_invoice" || commState === "requested" ? commAmount : 0;
  const ffInvoiced = (ffState === "invoiced" || ffState === "paid") ? scheme.base : 0;
  const commInvoiced = (commState === "invoiced" || commState === "paid") ? commAmount : 0;
  const ffPaid = ffState === "paid" ? scheme.base : 0;
  const commPaid = commState === "paid" ? commAmount : 0;

  let global: Row["global"];
  if (cancelled) {
    global = { key: "cancelled", label: reprogrammed ? "Annulé (reprogrammé)" : "Annulé", ton: "danger" };
  } else if (absent) {
    global = { key: "absent", label: "Client absent", ton: "danger" };
  } else if (noStatus) {
    global = { key: "no_status", label: "Sans statut — à statuer", ton: "attente" };
  } else if (mandatRemoved) {
    global = ffState === "paid" || ffState === "invoiced"
      ? { key: "mandat_removed", label: "Mandat retiré (frais gardés)", ton: "danger" }
      : { key: "mandat_removed", label: "Mandat retiré", ton: "danger" };
  } else if (!mandatSigned) {
    global = a.signStatus === "listed"
      ? { key: "listed", label: "Annonce en ligne — mandat en cours", ton: "info" }
      : { key: "open", label: a.signStatus === "thinking" ? "Réfléchit" : a.signStatus === "unsigned" ? "Non signé" : "Mandat non signé / en cours", ton: "neutre" };
  } else if (!bc) {
    global = (ffState === "invoiced" || ffState === "paid")
      ? { key: "wait_bc", label: "En attente du bon de commande", ton: "attente" }
      : { key: "wait_sale", label: "En attente de vente", ton: "neutre" };
  } else if (ffState === "paid" && commState === "paid") {
    global = { key: "closed", label: "Clôturé", ton: "succes" };
  } else if (commState === "to_invoice") {
    global = { key: "comm_todo", label: "Part variable à facturer", ton: "danger" };
  } else if (ffState === "to_invoice") {
    global = { key: "ff_todo", label: "Frais fixe à facturer", ton: "danger" };
  } else {
    global = { key: "invoiced", label: "Facturé", ton: "info" };
  }

  // Retard : une facture émise (non payée) depuis +30 j.
  const ffLate = ffState === "invoiced" && daysSince(a.ffDate) > LATE_DAYS;
  const commLate = commState === "invoiced" && daysSince(a.commDate) > LATE_DAYS;
  const late = ffLate || commLate;

  return { a, mandatSigned, mandatRemoved, ffBillable, bc, ffAmount, ffState, commAmount, commState, ffToInvoice, commToInvoice, ffInvoiced, commInvoiced, ffPaid, commPaid, global, late, cancelled, reprogrammed, reprogrammedAt, noStatus, absent };
}

const ffLabel: Record<FFState, string> = { none: "—", to_invoice: "À facturer", requested: "Appel à facturation", invoiced: "Facturée", paid: "Payée" };
const commLabel: Record<CommState, string> = { pending_bc: "En attente du BC", to_invoice: "À facturer", requested: "Appel à facturation", invoiced: "Facturée", paid: "Payée" };
const ffTon: Record<FFState, string> = { none: "neutre", to_invoice: "danger", requested: "attente", invoiced: "info", paid: "succes" };
const commTon: Record<CommState, string> = { pending_bc: "neutre", to_invoice: "danger", requested: "attente", invoiced: "info", paid: "succes" };

/** Couleur d'impression associée à un ton (les PDF n'ont pas nos jetons CSS). */
const TON_IMPRESSION: Record<string, string> = {
  neutre: "#6f6a62", succes: "#4c7551", attente: "#a8722a", danger: "#a94436", info: "#4a6b82",
};

function Bilan() {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [msgStats, setMsgStats] = useState<Map<string, MsgStat>>(new Map());
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  // Plage de mois [mFrom..mTo] dans l'année choisie (ex: Juin → Août).
  const [mFrom, setMFrom] = useState<number>(now.getMonth());
  const [mTo, setMTo] = useState<number>(now.getMonth());

  const [search, setSearch] = useState("");
  const [fCommercial, setFCommercial] = useState("");
  const [fTele, setFTele] = useState("");
  const [fPlatform, setFPlatform] = useState("");
  const [fMandat, setFMandat] = useState("");   // "", "yes", "no"
  const [fBc, setFBc] = useState("");           // "", "yes", "no"
  const [fStatus, setFStatus] = useState("");   // "", to_invoice, non_invoiced, invoiced, paid, pending_bc
  const [fRdv, setFRdv] = useState("");         // "", signed, thinking, unsigned, no_status, cancelled, reprogrammed, present, absent
  const [openId, setOpenId] = useState("");
  const [busyPay, setBusyPay] = useState(""); // id+kind en cours de maj paiement
  const [role, setRole] = useState("");
  const [schemeByEmail, setSchemeByEmail] = useState<Map<string, { base: number; pct: number }>>(new Map());
  const [schemeByName, setSchemeByName] = useState<Map<string, { base: number; pct: number }>>(new Map());
  const [busyInvoice, setBusyInvoice] = useState(false);
  const [invoiceMsg, setInvoiceMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { load(); }, []);

  // Marque (ou dé-marque) une ligne payée en 1 clic depuis le tableau, date du jour.
  async function quickPay(a: Appt, kind: "ff" | "comm", paid: boolean) {
    setBusyPay(a.id + kind);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const body: Record<string, string> = { eid: a.id };
      if (kind === "ff") { body.ffStatus = paid ? "paid" : ""; body.ffPaidDate = paid ? today : ""; }
      else { body.commStatus = paid ? "paid" : ""; body.commPaidDate = paid ? today : ""; }
      await fetch("/api/invoicing", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) });
      await load();
    } catch { /* silencieux : rechargement suivant corrigera */ }
    finally { setBusyPay(""); }
  }

  async function load() {
    // Page financière : jamais de chiffres issus du cache. Les commissions dépendent
    // des barèmes par commercial (/api/users), qui arrivent après la liste des RDV :
    // afficher les RDV avant les barèmes donnerait un total faux pendant un instant.
    setLoading(true); setErr("");
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch("/api/appointments?all=1", { headers: authHeaders() }),
        fetch("/api/messages-stats", { headers: authHeaders() }).catch(() => null),
        fetch("/api/users", { headers: authHeaders() }).catch(() => null), // barème perso (frais fixe / % nego) par commercial
      ]);
      const d = await r1.json();
      if (d.ok) { setAppts(d.appointments); setCached("appointments:all", d.appointments); setRole(d.role ?? ""); }
      else setErr(d.error ?? "Erreur");
      if (r2) {
        const m = await r2.json();
        if (m?.ok) setMsgStats(new Map((m.stats as MsgStat[]).map((s) => [s.event_id, s])));
      }
      if (r3) {
        const u = await r3.json();
        if (u?.ok) {
          const byEmail = new Map<string, { base: number; pct: number }>();
          const byName = new Map<string, { base: number; pct: number }>();
          for (const usr of u.users as { email: string; name: string; commission_base: number; commission_pct: number }[]) {
            const scheme = { base: Number(usr.commission_base), pct: Number(usr.commission_pct) };
            if (usr.email) byEmail.set(usr.email.toLowerCase(), scheme);
            if (usr.name) byName.set(nameKey(usr.name), scheme);
          }
          setSchemeByEmail(byEmail); setSchemeByName(byName);
        }
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  // Années disponibles (depuis les RDV) + année courante.
  const years = useMemo(() => {
    const s = new Set<number>([now.getFullYear()]);
    for (const a of appts) if (a.startDateTime) s.add(new Date(a.startDateTime).getFullYear());
    return [...s].sort((x, y) => y - x);
  }, [appts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fusionne les doublons de commerciaux (accents / ordre du nom) → un seul affichage canonique.
  const groupKey = (name: string) => { const nk = nameKey(name); const al = COMMERCIAL_ALIAS[nk]; return al ? nameKey(al) : nk; };
  const commCanon = useMemo(() => {
    const best = new Map<string, string>(); // groupKey -> nom affiché
    for (const a of appts) {
      const c = a.commercial?.trim();
      if (!c) continue;
      const nk = nameKey(c);
      const alias = COMMERCIAL_ALIAS[nk];
      const gk = alias ? nameKey(alias) : nk;
      if (alias) { best.set(gk, alias); continue; } // alias : affichage forcé
      const cur = best.get(gk);
      // Préfère la variante la mieux orthographiée : + d'accents, puis la plus longue.
      if (!cur || accentScore(c) > accentScore(cur) || (accentScore(c) === accentScore(cur) && c.length > cur.length)) best.set(gk, c);
    }
    return best;
  }, [appts]);
  const canonComm = (name: string) => commCanon.get(groupKey(name)) ?? COMMERCIAL_ALIAS[nameKey(name)] ?? name;
  const commercials = useMemo(() => [...new Set(commCanon.values())].sort((x, y) => x.localeCompare(y, "fr")), [commCanon]);
  const teles = useMemo(() => [...new Set(appts.map((a) => a.teleprospector).filter(Boolean))].sort(), [appts]);
  const platforms = useMemo(() => [...new Set(appts.map((a) => a.platform).filter(Boolean))].sort(), [appts]);

  // Barème d'un RDV : celui du compte du commercial (email, puis nom en repli), sinon le défaut.
  const schemeFor = (a: Appt) => {
    const byEmail = a.commercialEmail ? schemeByEmail.get(a.commercialEmail.toLowerCase()) : undefined;
    return byEmail ?? schemeByName.get(nameKey(a.commercial)) ?? DEFAULT_SCHEME;
  };

  // Dossiers de la période choisie.
  const periodRows: Row[] = useMemo(() => {
    return appts
      .filter((a) => a.startDateTime) // annulés inclus : on veut les voir dans le bilan
      .filter((a) => {
        const d = new Date(a.startDateTime as string);
        if (d.getFullYear() !== year) return false;
        const lo = Math.min(mFrom, mTo), hi = Math.max(mFrom, mTo);
        const mo = d.getMonth();
        if (mo < lo || mo > hi) return false;
        return true;
      })
      .map((a) => derive(a, schemeFor(a)))
      .sort((x, y) => (x.a.startDateTime! < y.a.startDateTime! ? 1 : -1));
  }, [appts, year, mFrom, mTo, schemeByEmail, schemeByName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtres + recherche cumulables.
  const rows: Row[] = useMemo(() => {
    let list = periodRows;
    if (fCommercial) list = list.filter((r) => groupKey(r.a.commercial) === groupKey(fCommercial));
    if (fTele) list = list.filter((r) => r.a.teleprospector === fTele);
    if (fPlatform) list = list.filter((r) => r.a.platform === fPlatform);
    if (fMandat) list = list.filter((r) => (fMandat === "yes" ? r.mandatSigned : !r.mandatSigned));
    if (fBc) list = list.filter((r) => (fBc === "yes" ? r.bc : !r.bc));
    if (fRdv === "signed") list = list.filter((r) => r.mandatSigned);
    else if (fRdv === "listed") list = list.filter((r) => !r.cancelled && r.a.signStatus === "listed");
    else if (fRdv === "thinking") list = list.filter((r) => !r.cancelled && r.a.signStatus === "thinking");
    else if (fRdv === "unsigned") list = list.filter((r) => !r.cancelled && r.a.signStatus === "unsigned");
    else if (fRdv === "no_status") list = list.filter((r) => r.noStatus);
    else if (fRdv === "cancelled") list = list.filter((r) => r.cancelled);
    else if (fRdv === "reprogrammed") list = list.filter((r) => r.reprogrammed);
    else if (fRdv === "present") list = list.filter((r) => !r.cancelled && r.a.presence === "present");
    else if (fRdv === "absent") list = list.filter((r) => r.absent);
    if (fStatus === "to_invoice") list = list.filter((r) => r.ffState === "to_invoice" || r.commState === "to_invoice");
    else if (fStatus === "non_invoiced") list = list.filter((r) => r.ffInvoiced === 0 && r.commInvoiced === 0);
    else if (fStatus === "invoiced") list = list.filter((r) => r.ffInvoiced > 0 || r.commInvoiced > 0);
    else if (fStatus === "paid") list = list.filter((r) => r.ffPaid > 0 || r.commPaid > 0);
    else if (fStatus === "pending_bc") list = list.filter((r) => r.commState === "pending_bc");
    const q = search.trim().toLowerCase();
    if (q) {
      const qd = onlyDigits(q);
      const qa = q.replace(/[^a-z0-9]/g, "");
      list = list.filter((r) => {
        const a = r.a;
        return `${a.firstName} ${a.lastName}`.toLowerCase().includes(q)
          || (qd && onlyDigits(a.phone).includes(qd))
          || vehicleLabel(a).toLowerCase().includes(q)
          || (qa && a.immatriculation && a.immatriculation.toLowerCase().replace(/[^a-z0-9]/g, "").includes(qa))
          || (a.ffNo && a.ffNo.toLowerCase().includes(q))
          || (a.commNo && a.commNo.toLowerCase().includes(q));
      });
    }
    return list;
  }, [periodRows, fCommercial, fTele, fPlatform, fMandat, fBc, fStatus, fRdv, search]);

  // Totaux automatiques (sur les lignes filtrées).
  const [filtresAvances, setFiltresAvances] = useState(false);

  // Même page pour tous : seul le sens de l'argent change.
  const moi = getUser();
  const recoit = moi?.role !== "admin" && !moi?.isCommercial && !!moi?.isTeleprospector;
  const MOT = recoit
    ? { reste: "Reste à percevoir", facture: "Facturé, en attente", regle: "Déjà encaissé", ffCol: "Mon frais fixe", commCol: "Ma part variable", titre: "Ma rémunération" }
    : { reste: "Reste à facturer", facture: "Déjà facturé", regle: "Déjà encaissé", ffCol: "Frais fixes", commCol: "Part variable", titre: "Bilan de facturation" };

  const totals = useMemo(() => {
    const t = {
      n: rows.length, mandat: 0, bc: 0, fully: 0, partial: 0, none: 0,
      ffRemaining: 0, commRemaining: 0, invoiced: 0, paid: 0,
      noStatus: 0, cancelled: 0, reprogrammed: 0, absent: 0,
    };
    for (const r of rows) {
      if (r.cancelled) t.cancelled++;
      if (r.reprogrammed) t.reprogrammed++;
      if (r.noStatus) t.noStatus++;
      if (r.absent) t.absent++;
      if (r.mandatSigned) t.mandat++;
      if (r.bc) t.bc++;
      const inv = r.ffInvoiced + r.commInvoiced;
      const remaining = r.ffToInvoice + r.commToInvoice;
      const fullyInvoiced = r.mandatSigned && r.bc && (r.ffState === "invoiced" || r.ffState === "paid") && (r.commState === "invoiced" || r.commState === "paid");
      if (fullyInvoiced) t.fully++;
      else if (inv > 0) t.partial++;
      else t.none++;
      t.ffRemaining += r.ffToInvoice;
      t.commRemaining += r.commToInvoice;
      t.invoiced += inv;
      t.paid += r.ffPaid + r.commPaid;
    }
    return { ...t, totalRemaining: t.ffRemaining + t.commRemaining };
  }, [rows]);

  const _lo = Math.min(mFrom, mTo), _hi = Math.max(mFrom, mTo);
  const periodLabel = _lo === 0 && _hi === 11 ? `Année ${year}` : _lo === _hi ? `${MONTHS[_lo]} ${year}` : `${MONTHS[_lo]} – ${MONTHS[_hi]} ${year}`;

  function clearFilters() {
    setSearch(""); setFCommercial(""); setFTele(""); setFPlatform("");
    setFMandat(""); setFBc(""); setFStatus(""); setFRdv("");
  }

  // Dossiers filtrés à l'écran qui ont encore un montant à facturer (frais fixe et/ou commission).
  const billableRows = useMemo(() => rows.filter((r) => r.ffToInvoice > 0 || r.commToInvoice > 0), [rows]);

  // Génère une facture BROUILLON Abby pour le commercial sélectionné, à partir des dossiers
  // actuellement filtrés/affichés (période + commercial + statut). Jamais finalisée automatiquement.
  async function generateInvoice() {
    if (!fCommercial || billableRows.length === 0) return;
    setBusyInvoice(true); setInvoiceMsg(null);
    try {
      const r = await fetch("/api/abby/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ commercial: fCommercial, apptIds: billableRows.map((r) => r.a.id) }),
      });
      const d = await r.json();
      if (!r.ok) { setInvoiceMsg({ ok: false, text: d.error ?? "Erreur." }); return; }
      if (d.empty) { setInvoiceMsg({ ok: true, text: "Rien à facturer sur cette sélection." }); return; }
      setInvoiceMsg({ ok: true, text: `${d.reused ? "Lignes ajoutées au brouillon Abby existant" : "Facture brouillon créée dans Abby"}${d.invoiceNumber ? ` (n° ${d.invoiceNumber})` : ""} — +${d.count} ligne(s), total ${eur(d.totalEur)}. À vérifier/finaliser dans Abby.` });
      await load();
    } catch (e) {
      setInvoiceMsg({ ok: false, text: e instanceof Error ? e.message : "Erreur." });
    } finally {
      setBusyInvoice(false);
    }
  }

  // ───────── Exports ─────────
  const COLS = [
    "Nom", "Prénom", "Téléphone", "Véhicule", "Immatriculation", "Date RDV", "Créé le",
    "Commercial", "Téléprospecteur", "Société/Plateforme", "Mandat signé", "Date mandat",
    "BC signé", "Date BC", "Négociation", "Frais fixes", "Statut FF", "N° facture FF", "Date FF", "Payé FF le",
    "Commission", "Statut commission", "N° facture comm.", "Date comm.", "Payé comm. le",
    "Statut global", "Mails envoyés", "SMS envoyés", "Parking", "Note",
  ];
  function rowValues(r: Row): string[] {
    const a = r.a; const ms = msgStats.get(a.id);
    const parking = a.parkingRequested ? "Parking sécurisé demandé" : a.parkingSent ? "Instructions envoyées" : "—";
    return [
      a.lastName, a.firstName, a.phone, vehicleLabel(a), a.immatriculation, fmtDate(a.startDateTime), fmtDate(a.createdAt),
      canonComm(a.commercial), a.teleprospector, a.platform, r.mandatRemoved ? "Retiré" : r.mandatSigned ? "Oui" : "Non", r.mandatSigned || r.mandatRemoved ? fmtDate(a.signStatusAt) : "",
      r.bc ? "Oui" : "Non", r.bc ? fmtDate(a.bcSignedAt) : "", a.negotiation ? String(a.negotiation) : "0",
      r.ffBillable ? String(r.ffAmount) : "0", ffLabel[r.ffState], a.ffNo, fmtDate(a.ffDate), fmtDate(a.ffPaidDate),
      r.bc ? String(r.commAmount) : "0", commLabel[r.commState], a.commNo, fmtDate(a.commDate), fmtDate(a.commPaidDate),
      r.global.label, ms ? String(ms.emails) : "0", ms ? String(ms.sms) : "0", parking, a.note,
    ];
  }
  function download(name: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function exportCSV() {
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const lines = [COLS.map(esc).join(";"), ...rows.map((r) => rowValues(r).map(esc).join(";"))];
    download(`bilan-${periodLabel.replace(/\s/g, "-")}.csv`, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  }
  function exportExcel() {
    const esc = (v: string) => (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const head = `<tr>${COLS.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
    const body = rows.map((r) => `<tr>${rowValues(r).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><thead>${head}</thead><tbody>${body}</tbody></table></body></html>`;
    download(`bilan-${periodLabel.replace(/\s/g, "-")}.xls`, html, "application/vnd.ms-excel");
  }
  function exportPDF() {
    const esc = (v: string) => (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const card = (label: string, val: string, color = NAVY) => `<div class="kpi"><div class="kv" style="color:${color}">${val}</div><div class="kl">${esc(label)}</div></div>`;
    const detail = (r: Row) => {
      const a = r.a; const ms = msgStats.get(a.id);
      const hist = (a.history || []).slice().reverse().map((h) => `<li>${esc(fmtDateTime(h.at))} — ${esc(h.t)}${h.info ? ` : ${esc(h.info)}` : ""}</li>`).join("");
      const parking = a.parkingRequested ? "🅿️ Parking sécurisé demandé" : a.parkingSent ? "Instructions parking envoyées" : "Aucun parking";
      return `<div class="doc">
        <div class="doc-h"><b>${esc(a.lastName.toUpperCase())} ${esc(a.firstName)}</b> <span class="pill" style="background:${TON_IMPRESSION[r.global.ton] ?? "#6f6a62"}">${esc(r.global.label)}</span>${r.late ? '<span class="pill" style="background:#dc2626">PAIEMENT EN RETARD</span>' : ""}</div>
        <table class="kv-tbl"><tbody>
          <tr><td>Véhicule</td><td>${esc(vehicleLabel(a) || "—")} ${a.immatriculation ? `(${esc(a.immatriculation)})` : ""}</td></tr>
          <tr><td>Téléphone</td><td>${esc(a.phone || "—")}</td></tr>
          <tr><td>Commercial (a signé)</td><td><b>${esc(canonComm(a.commercial) || "—")}</b></td></tr>
          <tr><td>Téléprospecteur</td><td>${esc(a.teleprospector || "—")}</td></tr>
          <tr><td>Date RDV</td><td>${esc(fmtDateTime(a.startDateTime))}</td></tr>
          <tr><td>Mandat</td><td>${r.mandatSigned ? `✅ Signé${a.signStatusAt ? ` le ${esc(fmtDate(a.signStatusAt))}` : ""}` : a.signStatus === "listed" ? "📢 Annonce en ligne — mandat en cours" : a.signStatus === "thinking" ? "🤔 Réfléchit" : a.signStatus === "unsigned" ? "❌ Non signé" : "— En cours"}</td></tr>
          <tr><td>Bon de commande</td><td>${r.bc ? `✅ Signé${a.bcSignedAt ? ` le ${esc(fmtDate(a.bcSignedAt))}` : ""}` : "❌ Non signé (commission non facturable)"}</td></tr>
          <tr><td>Négociation</td><td>${esc(eur(a.negotiation))}</td></tr>
          <tr><td>Frais fixes${r.ffBillable ? ` (${esc(eur(r.ffAmount))})` : ""}</td><td>${esc(ffLabel[r.ffState])}${a.ffNo ? ` · n° ${esc(a.ffNo)}` : ""}${a.ffDate ? ` · ${esc(fmtDate(a.ffDate))}` : ""}${a.ffPaidDate ? ` · payé ${esc(fmtDate(a.ffPaidDate))}` : ""}${a.ffComment ? ` · ${esc(a.ffComment)}` : ""}</td></tr>
          <tr><td>Commission</td><td>${r.bc ? esc(eur(r.commAmount)) : "—"} · ${esc(commLabel[r.commState])}${a.commNo ? ` · n° ${esc(a.commNo)}` : ""}${a.commDate ? ` · ${esc(fmtDate(a.commDate))}` : ""}${a.commPaidDate ? ` · payé ${esc(fmtDate(a.commPaidDate))}` : ""}${a.commComment ? ` · ${esc(a.commComment)}` : ""}</td></tr>
          <tr><td>Véhicule / parking</td><td>${esc(parking)}</td></tr>
          <tr><td>Relances envoyées</td><td>📧 ${ms?.emails ?? 0} mail(s) · 📱 ${ms?.sms ?? 0} SMS${ms?.last_sent ? ` · dernier ${esc(fmtDate(ms.last_sent))}` : ""}</td></tr>
          ${a.note ? `<tr><td>Note / raison</td><td>${esc(a.note)}</td></tr>` : ""}
        </tbody></table>
        ${hist ? `<div class="hist"><b>Historique :</b><ul>${hist}</ul></div>` : ""}
      </div>`;
    };
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bilan ${esc(periodLabel)}</title>
      <style>
        :root{--brand-primary:#DB407A;--brand-dark:#1a273a} *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1a273a;margin:24px;font-size:12px}
        h1{font-size:20px;margin:0 0 2px} .sub{color:#6b7280;margin:0 0 16px;font-size:12px}
        .kpis{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
        .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;min-width:120px}
        .kv{font-size:18px;font-weight:700} .kl{font-size:10px;color:#6b7280;text-transform:uppercase}
        .doc{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:10px;page-break-inside:avoid}
        .doc-h{font-size:14px;margin-bottom:6px} .pill{color:#fff;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;margin-left:6px}
        .kv-tbl{width:100%;border-collapse:collapse} .kv-tbl td{padding:2px 6px;vertical-align:top;border-bottom:1px solid #f0f1f3}
        .kv-tbl td:first-child{color:#6b7280;width:170px} .hist{margin-top:6px;color:#374151} .hist ul{margin:4px 0;padding-left:18px}
        @media print{body{margin:10mm}}
      </style></head><body>
      <h1>Bilan de facturation — ${esc(periodLabel)}</h1>
      <p class="sub">${totals.n} dossier(s) · édité le ${esc(fmtDateTime(new Date().toISOString()))}${fCommercial ? ` · Commercial : ${esc(fCommercial)}` : ""}${fTele ? ` · Téléprospecteur : ${esc(fTele)}` : ""}</p>
      <div class="kpis">
        ${card("Dossiers", String(totals.n))}
        ${card("Mandats signés", String(totals.mandat))}
        ${card("BC signés", String(totals.bc))}
        ${card("Frais fixes à facturer", eur(totals.ffRemaining), ORANGE)}
        ${card("Commissions à facturer", eur(totals.commRemaining), ORANGE)}
        ${card("Total à encaisser", eur(totals.totalRemaining), RED)}
        ${card("Déjà facturé", eur(totals.invoiced), GREEN)}
        ${card("Déjà payé", eur(totals.paid), GREEN_DARK)}
      </div>
      <h2 style="font-size:15px">Détail des dossiers & signatures</h2>
      ${rows.map(detail).join("")}
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("Autorisez les pop-ups pour générer le PDF."); return; }
    w.document.write(html); w.document.close();
  }

  // PDF simple : 1 page de synthèse + tableau clair, sans détail ni historique.
  function exportSimplePDF() {
    const esc = (v: string) => (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const card = (label: string, val: string, color = NAVY) =>
      `<div class="kpi"><div class="kv" style="color:${color}">${esc(val)}</div><div class="kl">${esc(label)}</div></div>`;
    const statut = (r: Row) =>
      `<span class="pill" style="background:${TON_IMPRESSION[r.global.ton] ?? "#6f6a62"}">${esc(r.global.label)}</span>`
      + `${r.reprogrammed && !r.cancelled ? ' <span class="pill" style="background:#2563eb">🔁 Reprogrammé</span>' : ""}`
      + `${r.late ? ' <span class="pill" style="background:#dc2626">RETARD</span>' : ""}`;
    const mandatCell = (r: Row) => {
      const a = r.a;
      if (r.mandatSigned) return `<span style="color:${GREEN};font-weight:700">✅ Signé</span>${a.signStatusAt ? `<div class="muted">le ${esc(fmtDate(a.signStatusAt))}</div>` : ""}`;
      if (a.signStatus === "listed") return `<span style="color:${CYAN};font-weight:700">📢 Annonce en ligne</span>`;
      if (a.signStatus === "thinking") return `<span style="color:${YELLOW};font-weight:700">🤔 Réfléchit</span>`;
      if (a.signStatus === "unsigned") return `<span style="color:${RED};font-weight:700">❌ Non signé</span>`;
      return `<span class="muted">— En cours</span>`;
    };
    const body = rows.map((r) => {
      const a = r.a; const ms = msgStats.get(a.id);
      return `<tr>
        <td><b>${esc(a.lastName.toUpperCase())} ${esc(a.firstName)}</b><div class="muted">${esc(a.phone || "—")}</div></td>
        <td>${a.immatriculation ? `<b>${esc(a.immatriculation)}</b>` : "—"}<div class="muted">${esc(vehicleLabel(a) || "")}</div></td>
        <td>${esc(fmtDate(a.startDateTime))}</td>
        <td>${esc(canonComm(a.commercial) || "—")}</td>
        <td>${mandatCell(r)}</td>
        <td class="r">${r.mandatSigned ? esc(eur(r.ffAmount)) : "—"}</td>
        <td class="r">${r.bc ? esc(eur(r.commAmount)) : "—"}</td>
        <td class="c">📧 ${ms?.emails ?? 0}<br>📱 ${ms?.sms ?? 0}</td>
        <td>${statut(r)}</td>
      </tr>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bilan ${esc(periodLabel)}</title>
      <style>
        :root{--brand-primary:#DB407A;--brand-dark:#1a273a} *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1a273a;margin:24px;font-size:12px}
        h1{font-size:22px;margin:0 0 2px} .sub{color:#6b7280;margin:0 0 18px;font-size:12px}
        .kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}
        .kpi{border:1px solid #e5e7eb;border-radius:10px;padding:10px 16px;min-width:140px}
        .kv{font-size:22px;font-weight:700} .kl{font-size:10px;color:#6b7280;text-transform:uppercase;margin-top:2px}
        table{width:100%;border-collapse:collapse} th{text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;padding:8px 6px}
        td{padding:8px 6px;border-bottom:1px solid #f0f1f3;font-size:12px} tr{page-break-inside:avoid}
        td.c,th.c{text-align:center} td.r,th.r{text-align:right;white-space:nowrap}
        .muted{color:#9aa6b8;font-size:10px;margin-top:1px}
        .pill{display:inline-block;color:#fff;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700}
        tfoot td{font-weight:700;border-top:2px solid #e5e7eb;background:#f8fafc}
        @media print{body{margin:8mm} @page{size:landscape}}
      </style></head><body>
      <h1>Bilan — ${esc(periodLabel)}</h1>
      <p class="sub">${totals.n} dossier(s) · édité le ${esc(fmtDate(new Date().toISOString()))}${fCommercial ? ` · Commercial : ${esc(fCommercial)}` : ""}${fTele ? ` · Téléprospecteur : ${esc(fTele)}` : ""}</p>
      <div class="kpis">
        ${card("Dossiers", String(totals.n))}
        ${card("Mandats signés", String(totals.mandat), GREEN)}
        ${card("⚠️ Sans statut", String(totals.noStatus), "#9333ea")}
        ${card("Client absent", String(totals.absent), "#78716c")}
        ${card("Annulés", String(totals.cancelled), RED)}
        ${card("Reprogrammés", String(totals.reprogrammed), "#2563eb")}
        ${card("À encaisser", eur(totals.totalRemaining), RED)}
        ${card("Déjà facturé", eur(totals.invoiced), GREEN)}
        ${card("Déjà payé", eur(totals.paid), GREEN_DARK)}
      </div>
      <table>
        <thead><tr>
          <th>Client</th><th>Immatriculation</th><th>RDV</th><th>Commercial</th>
          <th>Mandat</th>
          <th class="r">Comm. rentrée<br>(50 €)</th><th class="r">Comm. sortie<br>(10 %)</th>
          <th class="c">Relances</th><th>Statut global</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="9" style="text-align:center;color:#6b7280;padding:20px">Aucun dossier</td></tr>`}</tbody>
        <tfoot><tr>
          <td colspan="5">TOTAUX — ${rows.length} dossier(s)</td>
          <td class="r">${esc(eur(totals.ffRemaining))}</td>
          <td class="r">${esc(eur(totals.commRemaining))}</td>
          <td colspan="2">À encaisser ${esc(eur(totals.totalRemaining))}</td>
        </tr></tfoot>
      </table>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("Autorisez les pop-ups pour générer le PDF."); return; }
    w.document.write(html); w.document.close();
  }

  // ───────── UI ─────────
  const card = (label: string, val: string, color = NAVY, bg = "#fff") => (
    <div style={{ background: bg, border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", minWidth: 150, flex: "1 1 150px" }}>
      <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 22, fontWeight: 700, color }}>{val}</div>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>{label}</div>
    </div>
  );
  // Une seule façon d'afficher un état : fond doux, texte lisible, pas d'aplat de couleur vive.
  const TONS: Record<string, { bg: string; fg: string }> = {
    neutre: { bg: T.surface3, fg: T.ink2 },
    succes: { bg: T.successSoft, fg: T.success },
    attente: { bg: T.warningSoft, fg: T.warning },
    danger: { bg: T.dangerSoft, fg: T.danger },
    info: { bg: T.infoSoft, fg: T.info },
  };
  const pill = (ton: string, label: string) => {
    const c = TONS[ton] ?? TONS.neutre;
    return (
      <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, background: c.bg, color: c.fg, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>
    );
  };
  // Bouton paiement rapide (dans le tableau, sans ouvrir la modale).
  const payBtn = (kind: "ff" | "comm", r: Row) => {
    const state = kind === "ff" ? r.ffState : r.commState;
    const busy = busyPay === r.a.id + kind;
    const paid = state === "paid";
    return (
      <button
        type="button"
        disabled={busy}
        title={paid ? "Annuler le paiement" : "Marquer payé (date du jour)"}
        onClick={(e) => { e.stopPropagation(); quickPay(r.a, kind, !paid); }}
        style={{
          marginTop: 3, padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: busy ? "default" : "pointer",
          border: `1px solid ${paid ? GREEN_DARK : "#cbd5e1"}`, background: paid ? "#f0fdf4" : "#fff", color: paid ? GREEN_DARK : "#475569",
        }}
      >
        {busy ? "…" : paid ? "↩︎ Payé" : "✓ Payé"}
      </button>
    );
  };
  const boutonSecondaire: React.CSSProperties = {
    height: 36, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${T.line}`,
    background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
  };
  const sel = (val: string, set: (v: string) => void, opts: { v: string; l: string }[], width = "auto") => (
    <select value={val} onChange={(e) => set(e.target.value)} style={{ height: 38, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${T.line}`, fontSize: 13.5, background: T.surface, color: T.ink, minWidth: width, cursor: "pointer" }}>
      {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
  const th: React.CSSProperties = { textAlign: "left", padding: "10px 10px", fontSize: 11.5, fontWeight: 700, color: T.ink3, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, background: T.surface2 };
  const td: React.CSSProperties = { padding: "11px 10px", fontSize: 13, borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap", color: T.ink };

  return (
    <>
      <PageHeader
        title={MOT.titre}
        subtitle={`${periodLabel} · ${totals.n} dossier${totals.n > 1 ? "s" : ""} · ${recoit ? "ce qui t'est dû, de la demande de facture jusqu'à l'encaissement" : "frais fixe et part variable, de ce qui reste à facturer jusqu'à l'encaissement"}.`}
        actions={
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={exportSimplePDF} style={boutonSecondaire}>PDF simple</button>
            <button onClick={exportPDF} style={boutonSecondaire}>PDF détaillé</button>
            <button onClick={exportExcel} style={boutonSecondaire}>Excel</button>
            <button onClick={exportCSV} style={boutonSecondaire}>CSV</button>
          </div>
        }
      />

      <Card title="Période" description="Le bilan porte sur les rendez-vous de la période choisie.">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13.5, color: T.ink2 }}>De</span>
          {sel(String(mFrom), (v) => setMFrom(Number(v)), MONTHS.map((m, i) => ({ v: String(i), l: m })))}
          <span style={{ fontSize: 13.5, color: T.ink2 }}>à</span>
          {sel(String(mTo), (v) => setMTo(Number(v)), MONTHS.map((m, i) => ({ v: String(i), l: m })))}
          {sel(String(year), (v) => setYear(Number(v)), years.map((y) => ({ v: String(y), l: String(y) })))}
          <button
            onClick={() => { setMFrom(0); setMTo(11); }}
            style={{ ...boutonSecondaire, background: _lo === 0 && _hi === 11 ? T.brand : T.surface, color: _lo === 0 && _hi === 11 ? "#fff" : T.ink, border: _lo === 0 && _hi === 11 ? "none" : `1px solid ${T.line}` }}
          >
            Toute l&apos;année
          </button>
        </div>
      </Card>

      {err && <Card><div style={{ color: T.danger, fontWeight: 700 }}>{err}</div></Card>}
      {loading && <div style={{ padding: S.md, color: T.ink2 }}>Chargement…</div>}

      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: T.ink3, margin: `${S.md}px 0 8px` }}>
        Argent
      </div>
      <StatRow>
        <StatCard label={MOT.reste} value={eur(totals.totalRemaining)} hint={`${eur(totals.ffRemaining)} de frais fixe · ${eur(totals.commRemaining)} de part variable`} onClick={() => setFStatus("to_invoice")} actif={fStatus === "to_invoice"} />
        <StatCard label={MOT.facture} value={eur(totals.invoiced)} hint="factures émises, en attente de règlement" onClick={() => setFStatus("invoiced")} actif={fStatus === "invoiced"} />
        <StatCard label={MOT.regle} value={eur(totals.paid)} hint="règlements constatés" onClick={() => setFStatus("paid")} actif={fStatus === "paid"} />
      </StatRow>

      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: T.ink3, margin: `${S.md}px 0 8px` }}>
        Dossiers
      </div>
      <StatRow>
        <StatCard label="Dossiers" value={totals.n} hint="sur la période" onClick={clearFilters} actif={!fStatus && !fRdv} />
        <StatCard label="Mandats signés" value={totals.mandat} onClick={() => setFRdv("signed")} actif={fRdv === "signed"} />
        <StatCard label="Bons de commande" value={totals.bc} onClick={() => setFBc("yes")} actif={fBc === "yes"} />
        <StatCard label="Sans statut" value={totals.noStatus} hint="à qualifier après le RDV" onClick={() => setFRdv("no_status")} actif={fRdv === "no_status"} />
        <StatCard label="Clients absents" value={totals.absent} onClick={() => setFRdv("absent")} actif={fRdv === "absent"} />
        <StatCard label="Annulés" value={totals.cancelled} onClick={() => setFRdv("cancelled")} actif={fRdv === "cancelled"} />
      </StatRow>

      <Card
        title="Rechercher et filtrer"
        actions={
          role === "admin" ? (
            <button
              onClick={generateInvoice}
              disabled={!fCommercial || billableRows.length === 0 || busyInvoice}
              title={!fCommercial ? "Choisis d'abord un commercial" : billableRows.length === 0 ? "Rien à facturer dans cette sélection" : `Facturer ${billableRows.length} ligne(s)`}
              style={{
                height: 36, padding: "0 14px", borderRadius: R.sm, border: "none", fontSize: 13.5, fontWeight: 700,
                background: !fCommercial || billableRows.length === 0 || busyInvoice ? T.surface3 : T.brand,
                color: !fCommercial || billableRows.length === 0 || busyInvoice ? T.ink3 : "#fff",
                cursor: !fCommercial || billableRows.length === 0 || busyInvoice ? "not-allowed" : "pointer",
              }}
            >
              {busyInvoice ? "Génération…" : `Facturer${fCommercial ? ` ${fCommercial}` : ""}${billableRows.length ? ` (${billableRows.length})` : ""}`}
            </button>
          ) : undefined
        }
      >
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Nom, téléphone, véhicule, immatriculation, numéro de facture…"
          style={{ width: "100%", boxSizing: "border-box", height: 46, padding: "0 16px", fontSize: 15, borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, marginBottom: S.md }}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {sel(fCommercial, setFCommercial, [{ v: "", l: "Tous les commerciaux" }, ...commercials.map((c) => ({ v: c, l: c }))])}
          {sel(fStatus, setFStatus, [
            { v: "", l: "Facturation : tout" },
            { v: "to_invoice", l: "À facturer" },
            { v: "invoiced", l: "Facturé, non payé" },
            { v: "paid", l: "Payé" },
            { v: "pending_bc", l: "En attente du bon de commande" },
          ])}
          {sel(fRdv, setFRdv, [
            { v: "", l: "Rendez-vous : tout" },
            { v: "signed", l: "Mandat signé" },
            { v: "thinking", l: "En réflexion" },
            { v: "unsigned", l: "Non signé" },
            { v: "no_status", l: "Sans statut" },
            { v: "present", l: "Client venu" },
            { v: "absent", l: "Absent" },
            { v: "cancelled", l: "Annulé" },
            { v: "reprogrammed", l: "Reprogrammé" },
          ])}
          <button onClick={() => setFiltresAvances((v) => !v)} style={boutonSecondaire}>
            {filtresAvances ? "Moins de filtres" : "Plus de filtres"}
          </button>
          <button onClick={clearFilters} style={{ ...boutonSecondaire, color: T.ink2 }}>Tout effacer</button>
        </div>

        {filtresAvances && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
            {sel(fTele, setFTele, [{ v: "", l: "Tous les téléprospecteurs" }, ...teles.map((c) => ({ v: c, l: c }))])}
            {sel(fPlatform, setFPlatform, [{ v: "", l: "Toutes les plateformes" }, ...platforms.map((c) => ({ v: c, l: c }))])}
            {sel(fMandat, setFMandat, [{ v: "", l: "Mandat : tous" }, { v: "yes", l: "Mandat signé" }, { v: "no", l: "Mandat non signé" }])}
            {sel(fBc, setFBc, [{ v: "", l: "Bon de commande : tous" }, { v: "yes", l: "BC signé" }, { v: "no", l: "BC non signé" }])}
          </div>
        )}

        {invoiceMsg && (
          <div style={{ marginTop: S.md, padding: "12px 14px", borderRadius: R.sm, fontSize: 14, background: invoiceMsg.ok ? T.successSoft : T.dangerSoft, color: invoiceMsg.ok ? T.success : T.danger }}>
            {invoiceMsg.text}
          </div>
        )}
      </Card>

      {/* Tableau */}
      <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: R.lg, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={th}>Client</th>
              <th style={th}>Véhicule / Immat</th>
              <th style={th}>RDV</th>
              <th style={th}>Commercial</th>
              <th style={th}>Télépros.</th>
              <th style={th}>Mandat</th>
              <th style={th}>BC</th>
              <th style={th}>{MOT.ffCol}</th>
              <th style={th}>{MOT.commCol}</th>
              <th style={th}>Statut global</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const a = r.a; const ms = msgStats.get(a.id);
              return (
                <tr key={a.id} onClick={() => setOpenId(a.id)} style={{ cursor: "pointer", background: r.cancelled ? "#fff1f2" : r.noStatus ? "#faf5ff" : r.late ? "#fef2f2" : undefined, opacity: r.cancelled ? 0.85 : 1 }}>
                  <td style={td}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(a.id); }} title="Voir la fiche (sans quitter le bilan)" style={{ color: NAVY, fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, textAlign: "left", borderBottom: `1px dotted ${PINK}` }}>
                      {a.lastName.toUpperCase()} {a.firstName}
                    </button>
                    <div style={{ color: "#9aa6b8", fontSize: 11 }}>{a.phone || "—"}{r.reprogrammed && <span title={`Reprogrammé le ${fmtDate(r.reprogrammedAt)}`} style={{ marginLeft: 5 }}>🔁</span>}</div>
                  </td>
                  <td style={td}>{vehicleLabel(a) || "—"}<div style={{ color: "#9aa6b8", fontSize: 11 }}>{a.immatriculation || "—"}</div></td>
                  <td style={td}>{fmtDate(a.startDateTime)}</td>
                  <td style={td}>{canonComm(a.commercial) || "—"}</td>
                  <td style={td}>{a.teleprospector || "—"}</td>
                  <td style={td}>{r.mandatRemoved ? <span title={`Mandat retiré${a.mandatRemovedAt ? ` le ${fmtDate(a.mandatRemovedAt)}` : ""}${a.mandatRemovedReason ? ` — ${a.mandatRemovedReason}` : ""}`}>{pill("danger", "Retiré")}</span> : r.mandatSigned ? pill("succes", "Signé") : a.signStatus === "listed" ? pill("info", "En ligne") : a.signStatus === "thinking" ? pill("attente", "Réflexion") : a.signStatus === "unsigned" ? pill("neutre", "Non signé") : pill("neutre", "—")}</td>
                  <td style={td}>{r.bc ? pill("info", "Signé") : pill("neutre", "—")}</td>
                  <td style={td}>{r.ffBillable ? <>{eur(r.ffAmount)} {pill(ffTon[r.ffState], ffLabel[r.ffState])}{a.ffNo && <div style={{ color: "#9aa6b8", fontSize: 10 }}>n° {a.ffNo}</div>}<div>{payBtn("ff", r)}</div></> : "—"}</td>
                  <td style={td}>{r.bc ? <>{eur(r.commAmount)} {pill(commTon[r.commState], commLabel[r.commState])}{a.commNo && <div style={{ color: "#9aa6b8", fontSize: 10 }}>n° {a.commNo}</div>}<div>{payBtn("comm", r)}</div></> : pill("attente", "Attente BC")}</td>
                  <td style={td}>{pill(r.global.ton, r.global.label)}{r.late && <div style={{ marginTop: 3 }}>{pill("danger", "En retard")}</div>}</td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={11} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>Aucun dossier pour cette période / ces filtres.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
                <td style={{ ...td, fontWeight: 700 }} colSpan={7}>TOTAUX — {rows.length} dossier(s)</td>
                <td style={{ ...td, fontWeight: 700, color: ORANGE }}>FF à fact. {eur(totals.ffRemaining)}</td>
                <td style={{ ...td, fontWeight: 700, color: ORANGE }}>Comm. à fact. {eur(totals.commRemaining)}</td>
                <td style={{ ...td, fontWeight: 700, color: RED }}>À encaisser {eur(totals.totalRemaining)}</td>
                <td style={{ ...td, fontWeight: 700, color: GREEN }}>Payé {eur(totals.paid)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {openId && (
        <EditModal
          row={rows.find((r) => r.a.id === openId) || periodRows.find((r) => r.a.id === openId)!}
          msg={msgStats.get(openId)}
          onClose={() => setOpenId("")}
          onSaved={() => { setOpenId(""); load(); }}
        />
      )}
    </>
  );
}

// ───────── Modale d'édition de la facturation d'un dossier ─────────
function EditModal({ row, msg, onClose, onSaved }: { row: Row; msg?: MsgStat; onClose: () => void; onSaved: () => void }) {
  const a = row.a;
  const [ffStatus, setFfStatus] = useState<InvStatus>(a.ffStatus);
  const [ffNo, setFfNo] = useState(a.ffNo);
  const [ffDate, setFfDate] = useState(a.ffDate ? a.ffDate.slice(0, 10) : "");
  const [ffPaidDate, setFfPaidDate] = useState(a.ffPaidDate ? a.ffPaidDate.slice(0, 10) : "");
  const [ffComment, setFfComment] = useState(a.ffComment);
  const [commStatus, setCommStatus] = useState<InvStatus>(a.commStatus);
  const [commNo, setCommNo] = useState(a.commNo);
  const [commDate, setCommDate] = useState(a.commDate ? a.commDate.slice(0, 10) : "");
  const [commPaidDate, setCommPaidDate] = useState(a.commPaidDate ? a.commPaidDate.slice(0, 10) : "");
  const [commComment, setCommComment] = useState(a.commComment);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Suppression DÉFINITIVE d'un dossier (nettoyage test/erreur). Irréversible, pas de mail.
  async function del() {
    if (!confirm(`Supprimer DÉFINITIVEMENT le dossier de ${a.firstName} ${a.lastName} (${vehicleLabel(a) || "véhicule —"}) ?\n\n⚠️ Irréversible : le RDV est effacé de l'agenda Google. Aucun mail n'est envoyé.`)) return;
    setDeleting(true); setError("");
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ eid: a.id }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? "Erreur");
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); setDeleting(false); }
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/invoicing", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          eid: a.id,
          ffStatus, ffNo, ffDate: ffDate || "", ffPaidDate: ffPaidDate || "", ffComment,
          commStatus, commNo, commDate: commDate || "", commPaidDate: commPaidDate || "", commComment,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? "Erreur");
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); setSaving(false); }
  }

  const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 13, width: "100%", boxSizing: "border-box" };
  const lbl: React.CSSProperties = { fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3, display: "block" };
  const statusSel = (v: InvStatus, set: (x: InvStatus) => void) => (
    <select value={v} onChange={(e) => set(e.target.value as InvStatus)} style={inp}>
      <option value="">À facturer</option>
      <option value="invoiced">Facturée</option>
      <option value="paid">Payée</option>
    </select>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, zIndex: 50, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, maxWidth: 640, width: "100%", margin: "30px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 19, color: NAVY }}>{a.lastName.toUpperCase()} {a.firstName}</h2>
          <button onClick={onClose} style={{ border: "none", background: "#f3f4f6", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: 13 }}>
          {vehicleLabel(a) || "Véhicule —"}{a.immatriculation ? ` · ${a.immatriculation}` : ""} · {a.phone || "—"}
          {" · "}
          <a href={`/client/${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer" style={{ color: PINK, fontWeight: 600, textDecoration: "none" }}>Fiche complète ↗</a>
        </p>

        {/* Récap signatures / suivi */}
        <div style={{ background: "#f8fafc", borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, lineHeight: 1.7 }}>
          <div><b>Commercial :</b> {a.commercial || "—"} · <b>Téléprospecteur :</b> {a.teleprospector || "—"}</div>
          <div><b>Mandat :</b> {row.mandatSigned ? `✅ signé${a.signStatusAt ? ` le ${fmtDate(a.signStatusAt)}` : ""}` : a.signStatus === "listed" ? "📢 annonce en ligne — mandat en cours" : a.signStatus === "thinking" ? "🤔 réfléchit" : a.signStatus === "unsigned" ? "❌ non signé" : "— en cours"}</div>
          <div><b>Bon de commande :</b> {row.bc ? `✅ signé${a.bcSignedAt ? ` le ${fmtDate(a.bcSignedAt)}` : ""} → commission facturable` : "❌ non signé → commission en attente"}</div>
          <div><b>Négociation :</b> {eur(a.negotiation)} · <b>Commission :</b> {row.bc ? eur(row.commAmount) : "—"}</div>
          <div><b>Véhicule / parking :</b> {a.parkingRequested ? "🅿️ parking sécurisé demandé" : a.parkingSent ? "instructions envoyées" : "—"}</div>
          <div><b>Relances :</b> 📧 {msg?.emails ?? 0} mail(s) · 📱 {msg?.sms ?? 0} SMS{msg?.last_sent ? ` · dernier ${fmtDate(msg.last_sent)}` : ""}</div>
          {a.note && <div><b>Note :</b> {a.note}</div>}
        </div>

        {/* Frais fixes */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: 8 }}>💶 Frais fixes — {eur(row.ffAmount)} {!row.mandatSigned && <span style={{ color: ORANGE, fontWeight: 400, fontSize: 12 }}>(mandat non signé)</span>}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>Statut</label>{statusSel(ffStatus, setFfStatus)}</div>
            <div><label style={lbl}>N° de facture</label><input style={inp} value={ffNo} onChange={(e) => setFfNo(e.target.value)} /></div>
            <div><label style={lbl}>Date de facture</label><input style={inp} type="date" value={ffDate} onChange={(e) => setFfDate(e.target.value)} /></div>
            <div><label style={lbl}>Date de paiement</label><input style={inp} type="date" value={ffPaidDate} onChange={(e) => setFfPaidDate(e.target.value)} /></div>
            <div style={{ gridColumn: "1 / 3" }}><label style={lbl}>Commentaire</label><input style={inp} value={ffComment} onChange={(e) => setFfComment(e.target.value)} /></div>
          </div>
        </div>

        {/* Commission */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12, opacity: row.bc ? 1 : 0.6 }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: 8 }}>📈 Commission — {row.bc ? eur(row.commAmount) : "en attente du bon de commande"}</div>
          {!row.bc && <p style={{ margin: "0 0 8px", fontSize: 12, color: YELLOW }}>⚠️ Le bon de commande n'est pas signé : la commission n'est pas encore facturable.</p>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>Statut</label>{statusSel(commStatus, setCommStatus)}</div>
            <div><label style={lbl}>N° de facture</label><input style={inp} value={commNo} onChange={(e) => setCommNo(e.target.value)} /></div>
            <div><label style={lbl}>Date de facture</label><input style={inp} type="date" value={commDate} onChange={(e) => setCommDate(e.target.value)} /></div>
            <div><label style={lbl}>Date de paiement</label><input style={inp} type="date" value={commPaidDate} onChange={(e) => setCommPaidDate(e.target.value)} /></div>
            <div style={{ gridColumn: "1 / 3" }}><label style={lbl}>Commentaire</label><input style={inp} value={commComment} onChange={(e) => setCommComment(e.target.value)} /></div>
          </div>
        </div>

        {error && <p style={{ color: RED, fontSize: 13 }}>❌ {error}</p>}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={del} disabled={deleting || saving} title="Supprimer définitivement ce dossier de l'agenda (test/erreur)" style={{ padding: "10px 14px", borderRadius: 9, border: `1.5px solid ${RED}`, background: "#fff", color: RED, fontWeight: 600, cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1 }}>{deleting ? "Suppression…" : "🗑️ Supprimer"}</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 9, border: "1.5px solid #e5e7eb", background: "#fff", color: NAVY, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ padding: "10px 18px", borderRadius: 9, border: "none", background: PINK, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Enregistrement…" : "💾 Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <Shell active="bilan" wide><Bilan /></Shell>;
}
