"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PricingAgreement } from "@/components/PricingAgreement";
import { authHeaders, sessionExpiree, getUser } from "@/lib/client";
import {
  PageHeader, Card, StatCard, StatRow, Badge, DataTable, Euro, DateRange, T, S, R, type Colonne, type Ton,
} from "@/components/ui";

type Statut = "signe" | "reflexion" | "non_signe" | "absent" | "honore" | "a_venir";

type EtatPaiement = "paye" | "facturation" | "a_payer" | "sans_objet";

type Dossier = {
  id: string; date: string | null; client: string; vehicule: string;
  statut: Statut; negociation: number; fixe: number; variable: number; montant: number;
  paiement: EtatPaiement; etatFixe: EtatPaiement; etatVariable: EtatPaiement;
  bcSigned: boolean; vehicleSold: boolean;
};
type Paiement = { id: number; amount: number; status: string; created_at: string };

type Solde = {
  commercial: { email: string; name: string; base: number; pct: number; callCenter: string; agence: string; sens: "doit" | "recoit" };
  totaux: {
    rdv: number; signes: number; honores: number; absents: number; aVenir: number;
    ca: number; du: number; facture: number; paye: number; solde: number;
    aPayer: number; enFacturation: number; regle: number;
  };
  dossiers: Dossier[];
  paiements: Paiement[];
};

const LIBELLE: Record<Statut, { texte: string; ton: Ton }> = {
  signe: { texte: "Mandat signé", ton: "succes" },
  reflexion: { texte: "En réflexion", ton: "attente" },
  non_signe: { texte: "Non signé", ton: "neutre" },
  absent: { texte: "Absent", ton: "danger" },
  honore: { texte: "Client venu", ton: "info" },
  a_venir: { texte: "À venir", ton: "neutre" },
};

const PAIEMENT: Record<EtatPaiement, { texte: string; ton: Ton }> = {
  a_payer: { texte: "À payer", ton: "danger" },
  facturation: { texte: "En cours de facturation", ton: "attente" },
  paye: { texte: "Payé", ton: "succes" },
  sans_objet: { texte: "—", ton: "neutre" },
};

/** Règlement d'un dossier, en distinguant le frais fixe de la part variable.
 *  « Payé » tout court ne veut rien dire quand deux lignes d'argent coexistent. */
function reglement(d: Dossier): { texte: string; ton: Ton; detail: string } {
  if (d.montant === 0) return { texte: "—", ton: "neutre", detail: "" };

  const aVariable = d.variable > 0;
  const fixePaye = d.etatFixe === "paye";
  const variablePaye = d.etatVariable === "paye";

  if (!aVariable) {
    return fixePaye
      ? { texte: "Payé", ton: "succes", detail: "frais fixe réglé" }
      : { texte: PAIEMENT[d.etatFixe].texte, ton: PAIEMENT[d.etatFixe].ton, detail: "frais fixe" };
  }
  if (fixePaye && variablePaye) return { texte: "Payé intégralement", ton: "succes", detail: "frais fixe + part variable" };
  if (fixePaye && !variablePaye) return { texte: "Frais fixe payé", ton: "attente", detail: `reste la part variable (${d.variable.toLocaleString("fr-FR")} €)` };
  if (!fixePaye && variablePaye) return { texte: "Part variable payée", ton: "attente", detail: `reste le frais fixe (${d.fixe.toLocaleString("fr-FR")} €)` };

  const pire = d.etatFixe === "a_payer" || d.etatVariable === "a_payer" ? "a_payer" : "facturation";
  return { texte: PAIEMENT[pire as EtatPaiement].texte, ton: PAIEMENT[pire as EtatPaiement].ton, detail: "frais fixe + part variable" };
}

type Filtre = "tous" | "signes" | "ca" | "due" | "a_payer" | "facturation" | "paye";

/** Ce que chaque filtre retient : cliquer un compteur affiche les dossiers qui le composent. */
const FILTRES: Record<Filtre, { titre: string; court: string; garde: (d: Dossier) => boolean }> = {
  tous: { titre: "Tous les rendez-vous", court: "Tous", garde: () => true },
  signes: { titre: "Mandats signés", court: "Signés", garde: (d) => d.statut === "signe" },
  ca: { titre: "Dossiers avec chiffre d'affaires", court: "Avec CA", garde: (d) => d.statut === "signe" && d.negociation > 0 },
  due: { titre: "Dossiers avec commission due", court: "Commission due", garde: (d) => d.montant > 0 },
  a_payer: { titre: "Commissions à payer", court: "À payer", garde: (d) => d.paiement === "a_payer" },
  facturation: { titre: "En cours de facturation", court: "En facturation", garde: (d) => d.paiement === "facturation" },
  paye: { titre: "Commissions payées", court: "Payés", garde: (d) => d.paiement === "paye" },
};

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const iso = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Douze derniers mois, du plus récent au plus ancien. */
function derniersMois(): { cle: string; label: string; from: string; to: string }[] {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    out.push({
      cle: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MOIS[d.getMonth()]} ${d.getFullYear()}`,
      from: iso(d), to: iso(fin),
    });
  }
  return out;
}

function PaiementsPage() {
  const mois = useMemo(derniersMois, []);
  const [mode, setMode] = useState<"calendaire" | "glissant" | "tout">("calendaire");
  const [moisChoisi, setMoisChoisi] = useState(mois[0].cle);
  const [depuis, setDepuis] = useState(iso(new Date(Date.now() - 29 * 86400e3)));
  const [jusqua, setJusqua] = useState(iso(new Date()));
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [solde, setSolde] = useState<Solde | null>(null);
  const [global, setGlobal] = useState<Solde | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const periode = useMemo(() => {
    if (mode === "tout") return null;
    if (mode === "glissant") return { from: depuis, to: jusqua };
    const m = mois.find((x) => x.cle === moisChoisi) ?? mois[0];
    return { from: m.from, to: m.to };
  }, [mode, moisChoisi, depuis, jusqua, mois]);

  const charger = useCallback(async () => {
    setErr("");
    try {
      const q = periode ? `?from=${periode.from}&to=${periode.to}` : "";
      const [rPeriode, rGlobal] = await Promise.all([
        fetch(`/api/mon-solde${q}`, { headers: authHeaders() }),
        periode ? fetch("/api/mon-solde", { headers: authHeaders() }) : Promise.resolve(null),
      ]);
      if (rPeriode.status === 401) { sessionExpiree(); return; }
      const d = await rPeriode.json();
      if (!d.ok) { setErr(d.error ?? "Erreur"); return; }
      setSolde(d);
      setGlobal(rGlobal ? await rGlobal.json() : d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [periode]);

  useEffect(() => { charger(); }, [charger]);

  if (loading) {
    return <Shell active="paiements"><div style={{ padding: 60, textAlign: "center", color: T.ink2 }}>Chargement…</div></Shell>;
  }
  if (err || !solde) {
    return (
      <Shell active="paiements">
        <PageHeader title="Mes paiements" />
        <Card><div style={{ color: T.danger, fontWeight: 700 }}>{err || "Données indisponibles."}</div></Card>
      </Shell>
    );
  }

  const { totaux, commercial } = solde;
  // Le commercial DOIT au téléprospecteur ; le téléprospecteur, lui, EST DÛ.
  const recoit = commercial.sens === "recoit";
  const MOT = recoit
    ? { du: "Rémunération due", reste: "Reste à percevoir", regle: "Encaissé", aPayer: "À encaisser", solde: "Total à percevoir", colonne: "Ma rémunération" }
    : { du: "Commission due", reste: "Reste à payer", regle: "Payé", aPayer: "À payer", solde: "Solde total dû", colonne: "Commission due" };
  const soldeGlobal = global?.totaux ?? totaux;
  const libellePeriode = mode === "tout"
    ? "Depuis le début"
    : mode === "glissant"
      ? `Du ${fmtDate(depuis)} au ${fmtDate(jusqua)}`
      : (mois.find((m) => m.cle === moisChoisi)?.label ?? "");

  const dossiers = solde.dossiers.filter(FILTRES[filtre].garde);
  const estAdmin = getUser()?.role === "admin";

  /** Pose l'état de règlement d'un dossier (admin) : à payer / facturé / payé.
   *  Écrit là où vivent déjà les marquages manuels du Bilan : ffStatus (frais fixe)
   *  et commStatus (part variable). */
  async function poserEtat(d: Dossier, etat: EtatPaiement) {
    const today = new Date().toISOString().slice(0, 10);
    const valeur = etat === "paye" ? "paid" : etat === "facturation" ? "invoiced" : "";
    const body: Record<string, string> = { eid: d.id };
    if (d.fixe > 0) { body.ffStatus = valeur; body.ffPaidDate = etat === "paye" ? today : ""; }
    if (d.variable > 0) { body.commStatus = valeur; body.commPaidDate = etat === "paye" ? today : ""; }
    await fetch("/api/invoicing", {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(body),
    });
    charger();
  }

  /** Applique un filtre et amène le tableau sous les yeux. */
  const filtrer = (f: Filtre) => {
    setFiltre(f);
    setTimeout(() => document.getElementById("tableau-dossiers")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const tiret = <span style={{ color: T.ink3 }}>—</span>;
  const colonnes: Colonne<Dossier>[] = [
    { cle: "date", titre: "Date", rendu: (d) => <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{fmtDate(d.date)}</span> },
    { cle: "client", titre: "Client", rendu: (d) => <a href={`/client/${encodeURIComponent(d.id)}`} style={{ color: T.ink, fontWeight: 600 }}>{d.client || "—"}</a> },
    { cle: "vehicule", titre: "Véhicule", rendu: (d) => <span style={{ color: T.ink2 }}>{d.vehicule || "—"}</span> },
    { cle: "statut", titre: "Statut du RDV", rendu: (d) => <Badge ton={LIBELLE[d.statut].ton}>{LIBELLE[d.statut].texte}</Badge> },
    { cle: "nego", titre: "Montant négocié", aligne: "droite", rendu: (d) => d.negociation ? <Euro montant={d.negociation} discret /> : tiret },
    { cle: "fixe", titre: "Commission fixe", aligne: "droite", rendu: (d) => d.fixe ? <Euro montant={d.fixe} discret /> : tiret },
    { cle: "variable", titre: `Part variable${commercial.pct ? ` (${commercial.pct} %)` : ""}`, aligne: "droite", rendu: (d) => d.variable ? <Euro montant={d.variable} discret /> : tiret },
    { cle: "montant", titre: MOT.colonne, aligne: "droite", rendu: (d) => d.montant ? <Euro montant={d.montant} /> : tiret },
    {
      cle: "paiement", titre: "Règlement", aligne: "centre",
      rendu: (d) => {
        const r = reglement(d);
        return (
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <Badge ton={r.ton}>{r.texte}</Badge>
            {r.detail && <span style={{ fontSize: 11.5, color: T.ink3 }}>{r.detail}</span>}
            {estAdmin && d.montant > 0 && (
              <select
                value={d.paiement} onChange={(e) => poserEtat(d, e.target.value as EtatPaiement)}
                title="Poser l'état des deux lignes d'un coup"
                style={{ height: 30, padding: "0 8px", borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, fontSize: 12, fontWeight: 700, cursor: "pointer", color: T.ink2 }}
              >
                <option value="a_payer">À payer</option>
                <option value="facturation">En facturation</option>
                <option value="paye">Tout payé</option>
              </select>
            )}
          </div>
        );
      },
    },
  ];

  function exporterPDF() {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (v: string) => v.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const lignes = solde!.dossiers.map((d) => `
      <tr>
        <td>${fmtDate(d.date)}</td>
        <td>${esc(d.client)}</td>
        <td>${esc(d.vehicule)}</td>
        <td>${LIBELLE[d.statut].texte}</td>
        <td class="n">${d.negociation ? eur(d.negociation) : "—"}</td>
        <td class="n">${d.fixe ? eur(d.fixe) : "—"}</td>
        <td class="n">${d.variable ? eur(d.variable) : "—"}</td>
        <td class="n">${d.montant ? eur(d.montant) : "—"}</td>
        <td>${reglement(d).texte}</td>
      </tr>`).join("");

    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
      <title>Relevé ${esc(commercial.name)} — ${esc(libellePeriode)}</title>
      <style>
        body { font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 32px; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        .sub { color: #6f6a62; font-size: 13px; margin: 0 0 24px; }
        .tot { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; }
        .tot div { border: 1px solid #e4e0d9; border-radius: 10px; padding: 12px 16px; min-width: 150px; }
        .tot span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #a8a39a; }
        .tot strong { font-size: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #a8a39a; padding: 0 8px 8px; }
        td { padding: 9px 8px; border-top: 1px solid #e4e0d9; }
        .n { text-align: right; white-space: nowrap; }
        tfoot td { font-weight: 700; border-top: 2px solid #1a1a1a; }
      </style></head><body>
      <h1>${recoit ? "Relevé de rémunération" : "Relevé de commissions"} — ${esc(commercial.name)}</h1>
      <p class="sub">${esc(libellePeriode)} · ${esc(commercial.agence || "—")}${commercial.callCenter && commercial.callCenter !== commercial.agence ? ` · ${esc(commercial.callCenter)}` : ""} · Barème : ${commercial.base} €${commercial.pct ? ` + ${commercial.pct} %` : ""} par mandat signé · Édité le ${fmtDate(new Date().toISOString())}</p>
      <div class="tot">
        <div><span>Chiffre d'affaires</span><strong>${eur(totaux.ca)}</strong></div>
        <div><span>${MOT.du}</span><strong>${eur(totaux.du)}</strong></div>
        <div><span>En facturation</span><strong>${eur(totaux.enFacturation)}</strong></div>
        <div><span>Payé</span><strong>${eur(totaux.regle)}</strong></div>
        <div><span>Reste à payer</span><strong>${eur(totaux.aPayer)}</strong></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Client</th><th>Véhicule</th><th>Statut</th><th class="n">Négocié</th><th class="n">Fixe</th><th class="n">Variable</th><th class="n">Commission due</th><th>Règlement</th></tr></thead>
        <tbody>${lignes}</tbody>
        <tfoot><tr><td colspan="7">Total dû — ${esc(libellePeriode)}</td><td class="n">${eur(totaux.du)}</td><td></td></tr></tfoot>
      </table>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  const puce = (actif: boolean): React.CSSProperties => ({
    height: 32, padding: "0 12px", borderRadius: R.sm, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: actif ? "none" : `1px solid ${T.line}`, background: actif ? T.brand : T.surface, color: actif ? "#fff" : T.ink2,
  });

  return (
    <Shell active="paiements" wide>
      <PageHeader
        title="Mes paiements"
        subtitle={`${commercial.agence || "Agence non renseignée"}${commercial.callCenter && commercial.callCenter !== commercial.agence ? ` · ${commercial.callCenter}` : ""} — ${recoit ? "ce qui t'est dû pour chaque mandat signé que tu as généré" : "ce que tu dois au téléprospecteur pour chaque mandat signé"} : ${commercial.base} €${commercial.pct ? ` + ${commercial.pct} % du montant négocié` : ""}.`}
        actions={<button onClick={exporterPDF} style={{ height: 38, padding: "0 16px", borderRadius: R.sm, border: "none", background: T.brand, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Éditer le relevé PDF</button>}
      />

      <Card title="Période" description="Mois calendaire du 1er au dernier jour, période glissante entre deux dates, ou tout l'historique.">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: S.md }}>
          <button onClick={() => setMode("calendaire")} style={puce(mode === "calendaire")}>Mois calendaire</button>
          <button onClick={() => setMode("glissant")} style={puce(mode === "glissant")}>Période glissante</button>
          <button onClick={() => setMode("tout")} style={puce(mode === "tout")}>Depuis le début</button>
        </div>

        {mode === "calendaire" && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={moisChoisi} onChange={(e) => setMoisChoisi(e.target.value)}
              aria-label="Mois à afficher"
              style={{ height: 44, minWidth: 220, padding: "0 14px", fontSize: 15, fontWeight: 700, textTransform: "capitalize", border: `1px solid ${T.line}`, borderRadius: R.sm, background: T.surface, color: T.ink, cursor: "pointer" }}
            >
              {mois.map((m) => <option key={m.cle} value={m.cle}>{m.label}</option>)}
            </select>
            <button onClick={() => setMoisChoisi(mois[0].cle)} style={puce(moisChoisi === mois[0].cle)}>Mois en cours</button>
          </div>
        )}

        {mode === "glissant" && (
          <div style={{ display: "flex", gap: S.md, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 400px", maxWidth: 460 }}>
              <DateRange from={depuis} to={jusqua} onChange={(r) => { setDepuis(r.from); setJusqua(r.to); }} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[7, 30, 90].map((n) => (
                <button key={n} onClick={() => { setDepuis(iso(new Date(Date.now() - (n - 1) * 86400e3))); setJusqua(iso(new Date())); }} style={puce(false)}>
                  {n} derniers jours
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: T.ink3, margin: `${S.md}px 0 8px` }}>
        {libellePeriode}
      </div>

      <StatRow>
        <StatCard label="Chiffre d'affaires" value={eur(totaux.ca)} hint={`${totaux.signes} mandat${totaux.signes > 1 ? "s" : ""} signé${totaux.signes > 1 ? "s" : ""}`} onClick={() => filtrer("ca")} actif={filtre === "ca"} />
        <StatCard label={MOT.du} value={eur(totaux.du)} hint={recoit ? "ce qui t'est dû sur la période" : "ce que tu dois sur la période"} onClick={() => filtrer("due")} actif={filtre === "due"} />
        <StatCard label={MOT.aPayer} value={eur(totaux.aPayer)} hint="pas encore facturé" onClick={() => filtrer("a_payer")} actif={filtre === "a_payer"} />
        <StatCard label="En cours de facturation" value={eur(totaux.enFacturation)} hint="facture émise, pas encore réglée" onClick={() => filtrer("facturation")} actif={filtre === "facturation"} />
        <StatCard label={MOT.regle} value={eur(totaux.regle)} hint={recoit ? "sommes encaissées" : "règlements effectués"} onClick={() => filtrer("paye")} actif={filtre === "paye"} />
      </StatRow>

      <StatRow>
        <StatCard
          label={MOT.solde} value={eur(soldeGlobal.solde)} hint="tous mois confondus — cliquer élargit la période"
          onClick={() => { setMode("tout"); filtrer("due"); }} actif={mode === "tout" && filtre === "due"}
        />
        <StatCard label="Rendez-vous (période)" value={totaux.rdv} hint={`${totaux.aVenir} à venir · ${totaux.absents} absent${totaux.absents > 1 ? "s" : ""}`} onClick={() => filtrer("tous")} actif={filtre === "tous"} />
        <StatCard label="Taux de signature" value={totaux.honores ? `${Math.round((totaux.signes / totaux.honores) * 100)} %` : "—"} hint="mandats signés / clients venus" onClick={() => filtrer("signes")} actif={filtre === "signes"} />
      </StatRow>

      <div id="tableau-dossiers">
        <Card
          title={`${FILTRES[filtre].titre} (${dossiers.length})`}
          description={recoit
            ? "Un dossier par ligne. Ta rémunération est due dès que le mandat est signé : montant fixe, plus la part variable sur le montant négocié."
            : "Un dossier par ligne. La commission est due au téléprospecteur dès que le mandat est signé : montant fixe, plus la part variable sur le montant négocié."}
          actions={
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(Object.keys(FILTRES) as Filtre[]).map((f) => (
                <button key={f} onClick={() => setFiltre(f)} style={puce(filtre === f)}>{FILTRES[f].court}</button>
              ))}
            </div>
          }
        >
          <DataTable colonnes={colonnes} lignes={dossiers} vide="Aucun dossier ne correspond à ce filtre." />
        </Card>
      </div>

      <Card title="Historique des règlements" description="Les paiements enregistrés sur ton compte.">
        {solde.paiements.length === 0 ? (
          <div style={{ padding: `${S.md}px 0`, color: T.ink2 }}>
            {recoit ? "Aucun encaissement enregistré pour l'instant : la totalité reste à percevoir." : "Aucun règlement enregistré pour l'instant : ton solde correspond au total dû."}
          </div>
        ) : (
          <DataTable
            colonnes={[
              { cle: "date", titre: "Date", rendu: (p: Paiement) => fmtDate(p.created_at) },
              { cle: "montant", titre: "Montant", aligne: "droite", rendu: (p: Paiement) => <Euro montant={Number(p.amount)} /> },
              { cle: "statut", titre: "Statut", aligne: "centre", rendu: (p: Paiement) => <Badge ton={p.status === "paid" ? "succes" : "attente"}>{p.status === "paid" ? "Réglé" : p.status}</Badge> },
            ]}
            lignes={solde.paiements}
            vide="Aucun règlement."
          />
        )}
      </Card>

      {!recoit && (
      <Card title="Moyen de paiement" actions={<Badge ton="attente">Bientôt</Badge>}>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: T.ink2, maxWidth: "70ch" }}>
          Cette fonctionnalité est <strong style={{ color: T.ink }}>en cours de test</strong>. Le principe : tu enregistres
          une carte bancaire une seule fois, et le montant de tes commissions du mois est prélevé automatiquement,
          sans avoir à faire de virement. <strong style={{ color: T.ink }}>Rien ne part sans ton accord</strong> —
          tu valides chaque prélèvement et tu gardes le dernier mot.
        </p>
      </Card>
      )}

      {!recoit && <PricingAgreement />}
    </Shell>
  );
}

export default PaiementsPage;
