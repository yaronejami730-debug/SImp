"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";
import {
  PageHeader, Card, StatCard, StatRow, Badge, Button, Field, FormGrid, DataTable, Euro, champ, T, S,
} from "@/components/ui";

type TierMode = "none" | "threshold" | "progressive";
interface Tier { minCount: number; amountEur: number; pctNego: number }
interface AccordIndep {
  id: number;
  commercial_email: string; commercial_name: string | null;
  payee_email: string; telepro_name: string | null;
  base_eur: string; pct_nego: string; trigger_kind: string;
  sold_eur: string; sold_pct: string; sold_pct_base: "negocie" | "plusvalue";
  tier_mode: TierMode; tiers: Tier[];
}

type PayeeKind = "call_center" | "gestionnaire" | "telepro" | "apporteur" | "associe";
interface Deal {
  id: number; call_center_id: number | null; commercial_email: string; payee_email: string; payee_kind: PayeeKind;
  base_eur: number; pct_nego: number; sold_eur: number; sold_pct: number; trigger_kind: "signed" | "honored";
  payer_email: string; payment_method: string; payment_delay_days: number; includes_descendants: boolean;
  deal_ref: string | null; deal_name: string | null; ccName: string | null; canEdit: boolean; explain: string;
}
interface Personne { email: string; name: string; ccName?: string | null; agenceName?: string | null }
interface Gestionnaire { email: string; name: string }
interface CcAvecResponsable { id: number; name: string; responsable: Personne }
interface Agence { id: number; name: string }
const legendeSectionLocal: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 8 };

export default function BaremesPage() {
  const [trigger, setTrigger] = useState<"signed" | "honored">("signed");
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const [userCC, setUserCC] = useState<number>(0);
  const [formOuvert, setFormOuvert] = useState(false);
  const [accordsIndep, setAccordsIndep] = useState<AccordIndep[]>([]);
  const [telepros, setTelepros] = useState<{ email: string; name: string }[]>([]);
  const [indepCommercial, setIndepCommercial] = useState("");
  const [indepTelepro, setIndepTelepro] = useState("");
  const [indepBase, setIndepBase] = useState("");
  const [indepPct, setIndepPct] = useState("");
  const [indepTierMode, setIndepTierMode] = useState<TierMode>("none");
  const [indepTiers, setIndepTiers] = useState<Tier[]>([]);
  const [indepSoldEur, setIndepSoldEur] = useState("");
  const [indepSoldPct, setIndepSoldPct] = useState("");
  const [indepSoldBase, setIndepSoldBase] = useState<"negocie" | "plusvalue">("negocie");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [commercialsAll, setCommercialsAll] = useState<Personne[]>([]);
  const [gestionnaires, setGestionnaires] = useState<Gestionnaire[]>([]);
  const [teleprosAll, setTeleprosAll] = useState<Personne[]>([]);
  const [agences, setAgences] = useState<Agence[]>([]);
  const [myEmail, setMyEmail] = useState("");
  const [canCreateDeal, setCanCreateDeal] = useState(false);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);
  const [dealsOuverts, setDealsOuverts] = useState<Set<string>>(new Set());
  const [nQui, setNQui] = useState<"commercial" | "agence">("commercial");
  const [nRecherche, setNRecherche] = useState("");
  const [nCommercialEmail, setNCommercialEmail] = useState("");
  const [nAgenceId, setNAgenceId] = useState("");
  const [nGestionnaireEmail, setNGestionnaireEmail] = useState("");
  const [nGestEur, setNGestEur] = useState("");
  const [nGestSoldEur, setNGestSoldEur] = useState("");
  const [nGestSoldPct, setNGestSoldPct] = useState("");
  const [nAvecAssocie, setNAvecAssocie] = useState(false);
  const [nAssocies, setNAssocies] = useState<{ email: string; sharePct: string }[]>([{ email: "", sharePct: "50" }]);
  const [possibleAssocies, setPossibleAssocies] = useState<Personne[]>([]);
  const [callCentersAvecResponsable, setCallCentersAvecResponsable] = useState<CcAvecResponsable[]>([]);
  const [nDistribution, setNDistribution] = useState<"call_center" | "telepro" | "">("");
  const [nCcId, setNCcId] = useState("");
  const [nCcEur, setNCcEur] = useState("");
  const [nCcSoldEur, setNCcSoldEur] = useState("");
  const [nCcSoldPct, setNCcSoldPct] = useState("");
  const [nTeleproEmail, setNTeleproEmail] = useState("");
  const [nTeleproEur, setNTeleproEur] = useState("");
  const [nTeleproSoldEur, setNTeleproSoldEur] = useState("");
  const [nTeleproSoldPct, setNTeleproSoldPct] = useState("");
  // Une seule question résume "quand" ET "est-ce que la vente compte" — pas deux questions
  // séparées : le mandat signé + commission sur vente est un cas d'usage à part entière, pas
  // une case à cocher après coup.
  const [nDealType, setNDealType] = useState<"honored" | "signed" | "signed_sale">("signed");
  const nTrigger: "signed" | "honored" = nDealType === "honored" ? "honored" : "signed";
  const venteIncluse = nDealType === "signed_sale";
  const [nMontantTotal, setNMontantTotal] = useState("");
  type ModeInfo = { mode: "fixe" | "pct"; pct: string };
  const [nGestMode, setNGestMode] = useState<ModeInfo>({ mode: "fixe", pct: "" });
  const [nCcMode, setNCcMode] = useState<ModeInfo>({ mode: "fixe", pct: "" });
  const [nTeleproMode, setNTeleproMode] = useState<ModeInfo>({ mode: "fixe", pct: "" });
  const [nMethod, setNMethod] = useState("");
  const [nDelay, setNDelay] = useState("0");
  const [nNomDeal, setNNomDeal] = useState("");
  const [creatingDeal, setCreatingDeal] = useState(false);

  useEffect(() => {
    loadUser();
    loadDeals();
  }, []);

  async function loadDeals() {
    try {
      const res = await fetch("/api/deals", { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) {
        setDeals(data.deals); setCommercialsAll(data.commercials); setGestionnaires(data.gestionnaires);
        setTeleprosAll(data.teleprosAll); setAgences(data.agences); setPossibleAssocies(data.possibleAssocies);
        setCallCentersAvecResponsable(data.callCentersAvecResponsable);
        setMyEmail(data.myEmail); setCanCreateDeal(!!data.canCreate);
        // Un seul gestionnaire possible (le cas courant) : pas la peine de le faire choisir.
        if (data.gestionnaires.length === 1) setNGestionnaireEmail(data.gestionnaires[0].email);
      }
    } catch (e) {
      console.error("Failed to load deals:", e);
    } finally {
      setLoading(false);
    }
  }

  const gestChoisi = gestionnaires.find((g) => g.email === nGestionnaireEmail);
  const ccChoisi = callCentersAvecResponsable.find((c) => String(c.id) === nCcId);
  const commercialsParAgence = commercialsAll
    .filter((c) => !nRecherche.trim() || c.name.toLowerCase().includes(nRecherche.trim().toLowerCase()))
    .reduce<Record<string, Personne[]>>((acc, c) => {
      const cle = c.agenceName ?? "Sans agence";
      (acc[cle] ??= []).push(c);
      return acc;
    }, {});

  function reinitialiserNouveauDeal() {
    setNCommercialEmail(""); setNAgenceId(""); setNRecherche(""); setNQui("commercial");
    setNDistribution(""); setNCcId(""); setNCcEur(""); setNCcSoldEur(""); setNCcSoldPct("");
    setNTeleproEmail(""); setNTeleproEur(""); setNTeleproSoldEur(""); setNTeleproSoldPct("");
    setNGestEur(""); setNGestSoldEur(""); setNGestSoldPct(""); setNMethod(""); setNDelay("0");
    setNAvecAssocie(false); setNAssocies([{ email: "", sharePct: "50" }]); setNDealType("signed"); setNMontantTotal("");
    setNGestMode({ mode: "fixe", pct: "" }); setNCcMode({ mode: "fixe", pct: "" }); setNTeleproMode({ mode: "fixe", pct: "" });
    setNNomDeal("");
  }

  async function creerDeal() {
    if (!nNomDeal.trim()) { alert("Donne un nom à ce deal."); return; }
    if (!nMontantTotal || parseFloat(nMontantTotal) <= 0) { alert("Indique combien le commercial paie pour ce deal."); return; }
    if (nQui === "commercial" && !nCommercialEmail) { alert("Choisis d'abord avec quel commercial tu fais ce deal."); return; }
    if (nQui === "agence" && !nAgenceId) { alert("Choisis l'agence."); return; }
    if (!nGestionnaireEmail) { alert("Choisis quel gestionnaire s'occupe de ce deal."); return; }
    const associesValides = nAvecAssocie ? nAssocies.filter((a) => a.email) : [];
    if (nAvecAssocie && associesValides.length === 0) { alert("Choisis au moins un associé, ou reviens en arrière s'il n'y en a pas."); return; }
    if (!nDistribution) { alert("Choisis comment ça se distribue ensuite : call center, ou téléprospecteur précis."); return; }
    if (nDistribution === "call_center" && !nCcId) { alert("Choisis le call center dont le responsable redistribue."); return; }
    if (nDistribution === "telepro" && !nTeleproEmail) { alert("Choisis le téléprospecteur."); return; }
    setCreatingDeal(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST", headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          action: "broker",
          dealName: nNomDeal.trim(),
          commercialEmail: nQui === "commercial" ? nCommercialEmail : undefined,
          agenceId: nQui === "agence" ? Number(nAgenceId) : undefined,
          gestionnaireEmail: nGestionnaireEmail, montantTotal: parseFloat(nMontantTotal) || 0,
          gest: { eur: parseFloat(nGestEur) || 0, soldEur: parseFloat(nGestSoldEur) || 0, soldPct: parseFloat(nGestSoldPct) || 0 },
          associes: associesValides.map((a) => ({ email: a.email, sharePct: parseFloat(a.sharePct) || 0 })),
          distribution: nDistribution,
          ccId: nDistribution === "call_center" ? Number(nCcId) : undefined,
          ccAmounts: { eur: parseFloat(nCcEur) || 0, soldEur: parseFloat(nCcSoldEur) || 0, soldPct: parseFloat(nCcSoldPct) || 0 },
          teleproEmail: nDistribution === "telepro" ? nTeleproEmail : undefined,
          teleproAmounts: { eur: parseFloat(nTeleproEur) || 0, soldEur: parseFloat(nTeleproSoldEur) || 0, soldPct: parseFloat(nTeleproSoldPct) || 0 },
          triggerKind: nTrigger, paymentMethod: nMethod, paymentDelayDays: parseInt(nDelay, 10) || 0,
        }),
      });
      const data = await res.json();
      if (!data.ok) { alert(data.error ?? "Erreur"); return; }
      reinitialiserNouveauDeal();
      setNouveauOuvert(false);
      loadDeals();
    } finally {
      setCreatingDeal(false);
    }
  }

  async function supprimerDeal(id: number) {
    if (!confirm("Désactiver ce deal ? La trace est conservée.")) return;
    const res = await fetch(`/api/deals?id=${id}`, { method: "DELETE", headers: authHeaders() });
    const data = await res.json();
    if (data.ok) loadDeals(); else alert(data.error ?? "Erreur");
  }

  function nomPersonne(email: string): string {
    return commercialsAll.find((c) => c.email === email)?.name
      ?? gestionnaires.find((g) => g.email === email)?.name
      ?? teleprosAll.find((t) => t.email === email)?.name
      ?? possibleAssocies.find((p) => p.email === email)?.name
      ?? email;
  }

  function toggleDealOuvert(ref: string) {
    setDealsOuverts((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref); else next.add(ref);
      return next;
    });
  }

  /** Un "Nouveau deal" crée 2-4 lignes (deal_ref commun) : gestionnaire, distribution
   *  (call center ou télépro), associé(s). Regroupées ici en UNE carte par deal — le détail
   *  ligne par ligne (qui doit quoi) ne s'affiche qu'au clic, pas par défaut. */
  const dealsGroupes = useMemo(() => {
    const parRef = new Map<string, Deal[]>();
    const seuls: Deal[] = [];
    for (const d of deals) {
      if (!d.deal_ref) { seuls.push(d); continue; }
      (parRef.get(d.deal_ref) ?? parRef.set(d.deal_ref, []).get(d.deal_ref)!).push(d);
    }
    const groupes = [...parRef.entries()].map(([ref, lignes]) => {
      const commercialEmail = lignes[0].commercial_email;
      const gestLigne = lignes.find((l) => l.payee_kind === "gestionnaire");
      const ccLigne = lignes.find((l) => l.payee_kind === "call_center");
      const teleproLigne = lignes.find((l) => l.payee_kind === "telepro");
      const associes = lignes.filter((l) => l.payee_kind === "associe");
      const total = lignes.filter((l) => l.payer_email === commercialEmail).reduce((n, l) => n + l.base_eur, 0);
      const trigger = lignes[0].trigger_kind === "honored" ? "RDV honoré" : "mandat signé";
      const canEdit = lignes.some((l) => l.canEdit);
      const intervenants = [
        nomPersonne(commercialEmail),
        gestLigne ? `gestionnaire ${nomPersonne(gestLigne.payee_email)}` : null,
        ccLigne ? `call center ${ccLigne.ccName ?? nomPersonne(ccLigne.payee_email)}` : null,
        teleproLigne ? `télépro ${nomPersonne(teleproLigne.payee_email)}` : null,
        associes.length ? `${associes.length} associé${associes.length > 1 ? "s" : ""}` : null,
      ].filter(Boolean).join(" · ");
      const nom = lignes[0].deal_name?.trim() || intervenants;
      return { ref, lignes, commercialEmail, total, trigger, canEdit, intervenants, nom };
    });
    return { groupes, seuls };
  }, [deals, commercialsAll, gestionnaires, teleprosAll, possibleAssocies]);

  useEffect(() => {
    if (userRole !== "admin") return;
    // Accords passés en direct avec des téléprospecteurs indépendants.
    fetch("/api/accords-telepro", { headers: authHeaders() })
      .then((r) => r.json()).then((d) => { if (d.ok) setAccordsIndep(d.accords); }).catch(() => {});
    fetch("/api/users", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setTelepros((d.users as { email: string; name: string; is_teleprospector?: boolean }[])
          .filter((u) => u.is_teleprospector).map((u) => ({ email: u.email, name: u.name })));
      }).catch(() => {});
  }, [userRole]);

  async function creerAccordIndep() {
    const res = await fetch("/api/accords-telepro", {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        commercialEmail: indepCommercial, teleproEmail: indepTelepro,
        baseEur: parseFloat(indepBase) || 0, pctNego: parseFloat(indepPct) || 0, trigger,
        soldEur: parseFloat(indepSoldEur) || 0, soldPct: parseFloat(indepSoldPct) || 0, soldPctBase: indepSoldBase,
        tierMode: indepTierMode, tiers: indepTiers,
      }),
    });
    const d = await res.json();
    if (!d.ok) { alert(d.error ?? "Erreur"); return; }
    setIndepBase(""); setIndepPct(""); setIndepTelepro(""); setIndepTierMode("none"); setIndepTiers([]);
    setIndepSoldEur(""); setIndepSoldPct(""); setIndepSoldBase("negocie");
    const r = await fetch("/api/accords-telepro", { headers: authHeaders() });
    const j = await r.json();
    if (j.ok) setAccordsIndep(j.accords);
  }

  async function supprimerAccordIndep(id: number) {
    if (!confirm("Désactiver cet accord ? La trace est conservée.")) return;
    await fetch(`/api/accords-telepro?id=${id}`, { method: "DELETE", headers: authHeaders() });
    setAccordsIndep((l) => l.filter((x) => x.id !== id));
  }


  async function loadUser() {
    try {
      const res = await fetch("/api/me", { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) {
        setUserRole(data.role);
        setUserCC(data.callCenterId);
      }
    } catch (e) {
      console.error("Failed to load user:", e);
    }
  }

  if (loading) {
    return (
      <Shell active="baremes" wide>
        <div style={{ padding: 60, textAlign: "center", color: T.ink2 }}>Chargement…</div>
      </Shell>
    );
  }

  return (
    <Shell active="baremes" wide>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <PageHeader
          title="Deal"
          subtitle="Qui touche combien sur un dossier. Un Deal (commercial → gestionnaire → call center ou téléprospecteur, avec associé(s) éventuels), ou un Accord direct (commercial ↔ téléprospecteur, sans intermédiaire)."
        />

        <StatRow>
          <StatCard label="Deals actifs" value={dealsGroupes.groupes.length + dealsGroupes.seuls.length} hint="commercial → gestionnaire → call center/téléprospecteur" />
          <StatCard label="Accords directs actifs" value={accordsIndep.length} hint="commercial ↔ téléprospecteur, sans intermédiaire" />
        </StatRow>

        {(() => {
          const mesDeals = deals.filter((d) => d.payer_email.toLowerCase() === myEmail || d.payee_email.toLowerCase() === myEmail);
          return mesDeals.length > 0 ? (
            <Card title="Mon deal" description="Ce que tu payes ou reçois, en clair.">
              <div style={{ display: "grid", gap: 8 }}>
                {mesDeals.map((d) => (
                  <div key={d.id} style={{ fontSize: 14, padding: "8px 0", borderTop: `1px solid ${T.line}` }}>
                    {d.explain}
                    {d.ccName && <span style={{ color: T.ink2 }}> — {d.ccName}{d.includes_descendants ? " (+ toute l'agence)" : ""}</span>}
                  </div>
                ))}
              </div>
            </Card>
          ) : null;
        })()}

        <Card
          title="Nouveau deal"
          description="Réservé au super-admin et au gestionnaire du call center concerné (celui qui a négocié ce call center avec un commercial). Un deal fixe, pour un périmètre donné, qui touche combien, par quel moyen, sous quel délai."
          actions={canCreateDeal ? <Button variante={nouveauOuvert ? "secondaire" : "principal"} onClick={() => setNouveauOuvert((v) => !v)}>{nouveauOuvert ? "Fermer" : "Nouveau deal"}</Button> : undefined}
        >
          {!canCreateDeal && (
            <div style={{ fontSize: 13.5, color: T.ink2 }}>
              Tu n&apos;es gestionnaire d&apos;aucun call center — tu ne peux pas créer de deal ici. Tu peux voir ci-dessous ceux qui te concernent.
            </div>
          )}

          {nouveauOuvert && canCreateDeal && (
            <div style={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 12, padding: S.md }}>
              <div style={legendeSectionLocal}>Nom du deal</div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: T.ink2, lineHeight: 1.5, maxWidth: "70ch" }}>
                Pour le retrouver facilement dans la liste — ex. « Lucas / Call Center Paris ».
              </p>
              <Field label="Nom">
                <input type="text" value={nNomDeal} onChange={(e) => setNNomDeal(e.target.value)} placeholder="Nom du deal" style={{ ...champ, maxWidth: 360 }} />
              </Field>

              <div style={{ ...legendeSectionLocal, marginTop: S.md }}>Ce deal, c&apos;est pour quoi ?</div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: T.ink2, lineHeight: 1.5, maxWidth: "70ch" }}>
                Ça détermine quand tout le monde est payé — et si la vente du véhicule rapporte quelque chose en plus.
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: S.md }}>
                <Button variante={nDealType === "honored" ? "principal" : "secondaire"} onClick={() => setNDealType("honored")}>Rendez-vous honoré</Button>
                <Button variante={nDealType === "signed" ? "principal" : "secondaire"} onClick={() => setNDealType("signed")}>Mandat signé</Button>
                <Button variante={nDealType === "signed_sale" ? "principal" : "secondaire"} onClick={() => setNDealType("signed_sale")}>Mandat signé + commission sur la vente</Button>
              </div>

              <Field label={`Le commercial paie combien, ${nDealType === "honored" ? "par RDV honoré" : "par mandat signé"} ?`}>
                <input type="number" step="0.01" value={nMontantTotal} onChange={(e) => setNMontantTotal(e.target.value)} placeholder="100" style={{ ...champ, textAlign: "right", maxWidth: 180 }} />
              </Field>
              {nDealType === "signed_sale" && (
                <p style={{ margin: "6px 0 0", fontSize: 12.5, color: T.ink2 }}>La commission sur la vente se règle plus bas, séparément — elle s&apos;ajoute à ce montant.</p>
              )}

              <div style={{ ...legendeSectionLocal, marginTop: S.md }}>1. Avec qui faites-vous ce deal ?</div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: T.ink2, lineHeight: 1.5, maxWidth: "70ch" }}>
                Le deal se fait avec le commercial : c&apos;est lui votre client, vous lui vendez des rendez-vous.
                En général un deal par commercial ; choisis une agence entière seulement si tous ses commerciaux ont le même deal.
              </p>
              <div style={{ display: "flex", gap: 6, marginBottom: S.md }}>
                <Button variante={nQui === "commercial" ? "principal" : "secondaire"} onClick={() => { setNQui("commercial"); setNAgenceId(""); }}>Un commercial précis</Button>
                <Button variante={nQui === "agence" ? "principal" : "secondaire"} onClick={() => { setNQui("agence"); setNCommercialEmail(""); }}>Toute une agence</Button>
              </div>

              {nQui === "commercial" ? (
                <>
                  <Field label="Rechercher un commercial">
                    <input value={nRecherche} onChange={(e) => setNRecherche(e.target.value)} placeholder="Tape un nom…" style={champ} />
                  </Field>
                  <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${T.line}`, borderRadius: 10, marginTop: 8, background: T.surface }}>
                    {Object.keys(commercialsParAgence).length === 0 ? (
                      <div style={{ padding: 12, fontSize: 13, color: T.ink2 }}>Aucun résultat.</div>
                    ) : Object.entries(commercialsParAgence).map(([agenceNom, coms]) => (
                      <div key={agenceNom}>
                        <div style={{ padding: "6px 12px", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: T.ink3, background: T.surface2 }}>{agenceNom}</div>
                        {coms.map((c) => (
                          <div
                            key={c.email} onClick={() => setNCommercialEmail(c.email)}
                            style={{ padding: "8px 12px", fontSize: 13.5, cursor: "pointer", background: nCommercialEmail === c.email ? T.brand : "transparent", color: nCommercialEmail === c.email ? "#fff" : T.ink }}
                          >
                            {c.name}{c.agenceName && <span style={{ opacity: 0.75 }}> ({c.agenceName})</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  {nCommercialEmail && (() => {
                    const c = commercialsAll.find((x) => x.email === nCommercialEmail);
                    return <div style={{ fontSize: 13, marginTop: 6, color: T.ink2 }}>Choisi : <strong style={{ color: T.ink }}>{c?.name}</strong>{c?.agenceName ? ` (${c.agenceName})` : ""}</div>;
                  })()}
                </>
              ) : (
                <Field label="Agence">
                  <select value={nAgenceId} onChange={(e) => setNAgenceId(e.target.value)} style={champ}>
                    <option value="">— à choisir —</option>
                    {agences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </Field>
              )}

              {(nCommercialEmail || nAgenceId) && (
                <>
                  <div style={{ ...legendeSectionLocal, marginTop: S.md }}>2. Quel gestionnaire s&apos;occupe de ce deal ?</div>
                  <p style={{ margin: "0 0 10px", fontSize: 13, color: T.ink2, lineHeight: 1.5, maxWidth: "70ch" }}>
                    Le gestionnaire, c&apos;est celui qui a négocié ce rendez-vous avec le commercial — c&apos;est toujours lui le bénéficiaire principal.
                  </p>
                  <Field label="Gestionnaire">
                    <select value={nGestionnaireEmail} onChange={(e) => { setNGestionnaireEmail(e.target.value); setNDistribution(""); setNCcId(""); }} style={champ}>
                      <option value="">— à choisir —</option>
                      {gestionnaires.map((g) => <option key={g.email} value={g.email}>{g.name}</option>)}
                    </select>
                  </Field>
                </>
              )}

              {nGestionnaireEmail && (
                <>
                  <div style={{ marginTop: S.md }}>
                    <BlocMontant
                      titre="3. Combien touche le gestionnaire ?" trigger={nTrigger} venteIncluse={venteIncluse} montantTotal={nMontantTotal}
                      fixe={nGestEur} setFixe={setNGestEur} onModeChange={(mode, pct) => setNGestMode({ mode, pct })}
                      soldFixe={nGestSoldEur} setSoldFixe={setNGestSoldEur} soldPct={nGestSoldPct} setSoldPct={setNGestSoldPct}
                    />
                  </div>

                  <div style={{ ...legendeSectionLocal, marginTop: S.md }}>4. Et le travail de prospection derrière — qui s&apos;en occupe ?</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: S.md }}>
                    <Button variante={nDistribution === "call_center" ? "principal" : "secondaire"} onClick={() => setNDistribution("call_center")}>
                      Un call center — son responsable redistribue lui-même en interne
                    </Button>
                    <Button variante={nDistribution === "telepro" ? "principal" : "secondaire"} onClick={() => setNDistribution("telepro")}>
                      Un téléprospecteur précis — payé direct par le gestionnaire
                    </Button>
                  </div>

                  {nDistribution === "call_center" && (
                    <>
                      <Field label="Responsable de call center" hint="N'importe lequel — pas seulement ceux de ce gestionnaire.">
                        <select value={nCcId} onChange={(e) => setNCcId(e.target.value)} style={champ}>
                          <option value="">— à choisir —</option>
                          {callCentersAvecResponsable.map((c) => <option key={c.id} value={c.id}>{c.responsable.name} — {c.name}</option>)}
                        </select>
                      </Field>
                      {callCentersAvecResponsable.length === 0 && (
                        <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 4 }}>Aucun call center n&apos;a encore de responsable posé.</div>
                      )}
                      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: T.ink2 }}>Le responsable redistribue ensuite lui-même à ses téléprospecteurs — ce n&apos;est pas suivi ici.</p>
                      <div style={{ marginTop: 8 }}>
                        <BlocMontant
                          titre="Ce que touche le call center" trigger={nTrigger} venteIncluse={venteIncluse} montantTotal={String((parseFloat(nMontantTotal) || 0) - (parseFloat(nGestEur) || 0))} pctBase={nMontantTotal}
                          fixe={nCcEur} setFixe={setNCcEur} onModeChange={(mode, pct) => setNCcMode({ mode, pct })}
                          soldFixe={nCcSoldEur} setSoldFixe={setNCcSoldEur} soldPct={nCcSoldPct} setSoldPct={setNCcSoldPct}
                        />
                      </div>
                    </>
                  )}

                  {nDistribution === "telepro" && (
                    <>
                      <Field label="Téléprospecteur" hint="Toute la base — « indépendant » = sans call center. Peut être le gestionnaire lui-même, s'il gère sa propre téléprospection.">
                        <select value={nTeleproEmail} onChange={(e) => setNTeleproEmail(e.target.value)} style={champ}>
                          <option value="">— à choisir —</option>
                          {gestChoisi && <option value={gestChoisi.email}>{gestChoisi.name} (le gestionnaire lui-même)</option>}
                          {teleprosAll.filter((t) => t.email !== nGestionnaireEmail).map((t) => <option key={t.email} value={t.email}>{t.name} — {t.ccName ?? "indépendant"}</option>)}
                        </select>
                      </Field>
                      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: T.ink2 }}>C&apos;est le gestionnaire qui le paie, sur sa propre part.</p>
                      <div style={{ marginTop: 8 }}>
                        <BlocMontant
                          titre="Ce que touche le téléprospecteur" trigger={nTrigger} venteIncluse={venteIncluse} montantTotal={nGestEur}
                          fixe={nTeleproEur} setFixe={setNTeleproEur} onModeChange={(mode, pct) => setNTeleproMode({ mode, pct })}
                          soldFixe={nTeleproSoldEur} setSoldFixe={setNTeleproSoldEur} soldPct={nTeleproSoldPct} setSoldPct={setNTeleproSoldPct}
                        />
                      </div>
                    </>
                  )}

                  {nDistribution && (() => {
                    const distEur = nDistribution === "call_center" ? parseFloat(nCcEur) || 0 : parseFloat(nTeleproEur) || 0;
                    const reste = Math.max(0, (parseFloat(nMontantTotal) || 0) - (parseFloat(nGestEur) || 0) - distEur);
                    return (
                      <>
                        <div style={{ ...legendeSectionLocal, marginTop: S.md }}>5. Une fois le gestionnaire et {nDistribution === "call_center" ? "le call center" : "le téléprospecteur"} payés, il reste {reste} € — vous le partagez avec un ou plusieurs associés ?</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                          <Button variante={!nAvecAssocie ? "principal" : "secondaire"} onClick={() => setNAvecAssocie(false)}>Non, ça revient au super-admin</Button>
                          <Button variante={nAvecAssocie ? "principal" : "secondaire"} onClick={() => setNAvecAssocie(true)}>Oui</Button>
                        </div>
                        {nAvecAssocie && (
                          <div style={{ display: "grid", gap: 8 }}>
                            {nAssocies.map((a, i) => (
                              <FormGrid key={i}>
                                <Field label={`Associé ${i + 1}`}>
                                  <select value={a.email} onChange={(e) => setNAssocies((l) => l.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} style={champ}>
                                    <option value="">— à choisir —</option>
                                    {possibleAssocies.filter((p) => !nAssocies.some((x, j) => j !== i && x.email === p.email)).map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
                                  </select>
                                </Field>
                                <Field label="Sa part du reste (%)">
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <input type="number" min={0} max={100} value={a.sharePct} onChange={(e) => setNAssocies((l) => l.map((x, j) => j === i ? { ...x, sharePct: e.target.value } : x))} style={{ ...champ, textAlign: "right" }} />
                                    {nAssocies.length > 1 && (
                                      <Button variante="danger" onClick={() => setNAssocies((l) => l.filter((_, j) => j !== i))}>✕</Button>
                                    )}
                                  </div>
                                </Field>
                              </FormGrid>
                            ))}
                            <Button variante="secondaire" onClick={() => setNAssocies((l) => [...l, { email: "", sharePct: "0" }])}>+ Ajouter un associé</Button>
                            {(() => {
                              const totalPct = nAssocies.reduce((n, a) => n + (parseFloat(a.sharePct) || 0), 0);
                              const noms = nAssocies.filter((a) => a.email).map((a) => `${possibleAssocies.find((p) => p.email === a.email)?.name} : ${Math.round(reste * (parseFloat(a.sharePct) || 0) / 100)} € (${a.sharePct || 0} %)`);
                              return noms.length > 0 ? (
                                <div style={{ fontSize: 12.5, color: T.ink2 }}>
                                  Sur les {reste} € restants : {noms.join(", ")}{totalPct < 100 ? ` — ${Math.round(reste * (100 - totalPct) / 100)} € non attribués reviennent au super-admin par défaut` : ""}.
                                </div>
                              ) : null;
                            })()}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}

              {nDistribution && (
                <>
                  <div style={{ ...legendeSectionLocal, marginTop: S.md }}>6. Comment et sous combien de temps ça se règle ?</div>
                  <FormGrid colonnes="repeat(auto-fit, minmax(180px, 1fr))">
                    <Field label="Comment ça se règle" hint="Pour info du bénéficiaire.">
                      <select value={nMethod} onChange={(e) => setNMethod(e.target.value)} style={champ}>
                        <option value="">— à choisir —</option>
                        <option value="Virement">Virement</option>
                        <option value="Espèces">Espèces</option>
                        <option value="Carte bleue">Carte bleue</option>
                        <option value="Stripe">Stripe</option>
                        <option value="Chèque">Chèque</option>
                      </select>
                    </Field>
                    <Field label="Sous combien de jours" hint="Après le déclenchement.">
                      <select value={nDelay} onChange={(e) => setNDelay(e.target.value)} style={champ}>
                        <option value="0">Immédiat</option>
                        <option value="7">7 jours</option>
                        <option value="15">15 jours</option>
                        <option value="30">30 jours</option>
                        <option value="45">45 jours</option>
                        <option value="60">60 jours</option>
                      </select>
                    </Field>
                  </FormGrid>

                  {(() => {
                    const total = parseFloat(nMontantTotal) || 0;
                    const gestEur = parseFloat(nGestEur) || 0;
                    const distEur = nDistribution === "call_center" ? parseFloat(nCcEur) || 0 : parseFloat(nTeleproEur) || 0;
                    const reste = Math.max(0, total - gestEur - distEur);
                    const associesRemplis = nAssocies.filter((a) => a.email);
                    const totalPctAssocies = associesRemplis.reduce((n, a) => n + (parseFloat(a.sharePct) || 0), 0);
                    const nomCommercial = nQui === "commercial"
                      ? commercialsAll.find((c) => c.email === nCommercialEmail)?.name
                      : `chaque commercial de ${agences.find((a) => String(a.id) === nAgenceId)?.name}`;
                    return (
                      <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px", marginTop: S.md, fontSize: 13.5, lineHeight: 1.7 }}>
                        <div style={{ fontWeight: 800, color: T.ink, marginBottom: 6 }}>Récapitulatif</div>
                        <div>• <strong>{nomCommercial}</strong> paie <strong>{total} €</strong> {nTrigger === "honored" ? "dès que le client est venu (RDV honoré)" : "au mandat signé"}.</div>
                        <div>• <strong>{gestChoisi?.name}</strong> (gestionnaire) touche <strong>{gestEur} €</strong>, pris {nGestMode.mode === "pct" ? `en pourcentage (${nGestMode.pct || 0} % des ${total} €)` : "en fixe"}.</div>
                        {nDistribution === "call_center" && ccChoisi && (
                          <div>• Le call center <strong>{ccChoisi.name}</strong> touche <strong>{distEur} €</strong>, pris {nCcMode.mode === "pct" ? `en pourcentage (${nCcMode.pct || 0} % des ${total} € payés par le commercial)` : "en fixe"} — son responsable <strong>{ccChoisi.responsable?.name}</strong> redistribue lui-même en interne aux téléprospecteurs.</div>
                        )}
                        {nDistribution === "telepro" && nTeleproEmail && (
                          <div>• <strong>{nTeleproEmail === nGestionnaireEmail ? "Le gestionnaire lui-même" : teleprosAll.find((t) => t.email === nTeleproEmail)?.name}</strong> (téléprospecteur) touche <strong>{distEur} €</strong>, pris {nTeleproMode.mode === "pct" ? `en pourcentage (${nTeleproMode.pct || 0} % des ${gestEur} € du gestionnaire)` : "en fixe"}, payé directement par le gestionnaire sur sa propre part.</div>
                        )}
                        <div>• Reste après ça : <strong>{reste} €</strong>{associesRemplis.length > 0
                          ? <> — partagé entre {associesRemplis.map((a) => `${possibleAssocies.find((p) => p.email === a.email)?.name} (${a.sharePct || 0} % = ${Math.round(reste * (parseFloat(a.sharePct) || 0) / 100)} €)`).join(", ")}{totalPctAssocies < 100 ? `, le reste (${Math.round(reste * (100 - totalPctAssocies) / 100)} €) revenant au super-admin par défaut` : ""}.</>
                          : <> — revient en entier au super-admin par défaut (pas d&apos;associé sur ce deal).</>
                        }</div>
                        {venteIncluse && (parseFloat(nGestSoldEur) > 0 || parseFloat(nGestSoldPct) > 0) && (
                          <div>• En plus, le jour de la vente du véhicule : <strong>{gestChoisi?.name}</strong> touche {parseFloat(nGestSoldEur) > 0 ? `${nGestSoldEur} €` : ""}{parseFloat(nGestSoldEur) > 0 && parseFloat(nGestSoldPct) > 0 ? " + " : ""}{parseFloat(nGestSoldPct) > 0 ? `${nGestSoldPct} % du montant négocié du véhicule` : ""}.</div>
                        )}
                        <div style={{ marginTop: 4, color: T.ink2 }}>Réglé {nMethod ? <>par <strong>{nMethod}</strong></> : "(méthode non précisée)"}, {parseInt(nDelay, 10) > 0 ? `sous ${nDelay} jours` : "immédiatement"} après le déclenchement.</div>
                      </div>
                    );
                  })()}
                </>
              )}

              <div style={{ marginTop: S.md }}>
                <Button variante="principal" onClick={creerDeal} disabled={creatingDeal}>{creatingDeal ? "Création…" : "Créer le deal"}</Button>
              </div>
            </div>
          )}

          {(dealsGroupes.groupes.length > 0 || dealsGroupes.seuls.length > 0) && (
            <div style={{ marginTop: nouveauOuvert ? S.md : 0, display: "grid", gap: 0 }}>
              {dealsGroupes.groupes.map((g, i) => {
                const ouvert = dealsOuverts.has(g.ref);
                return (
                  <div key={g.ref} style={{ borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}>
                    <div
                      onClick={() => toggleDealOuvert(g.ref)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S.md, padding: "10px 0", cursor: "pointer" }}
                    >
                      <div style={{ fontSize: 13.5 }}>
                        <div style={{ fontWeight: 700 }}>{g.nom}</div>
                        <div style={{ color: T.ink2, fontSize: 12.5 }}>{g.intervenants} — {g.total} € au {g.trigger}</div>
                      </div>
                      <span style={{ fontSize: 12.5, color: T.ink2, fontWeight: 700 }}>{ouvert ? "▲ Fermer" : "▼ Détail"}</span>
                    </div>
                    {ouvert && (
                      <div style={{ paddingBottom: 10, display: "grid", gap: 0 }}>
                        {g.lignes.map((d, j) => (
                          <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S.md, padding: "8px 0 8px 16px", borderTop: j === 0 ? "none" : `1px solid ${T.line}`, background: T.surface2 }}>
                            <div style={{ fontSize: 13 }}>{d.explain}{d.ccName && <span style={{ color: T.ink2 }}> — {d.ccName}{d.includes_descendants ? " + agence" : ""}</span>}</div>
                            {d.canEdit && <Button variante="danger" onClick={() => supprimerDeal(d.id)}>Retirer</Button>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {dealsGroupes.seuls.map((d, i) => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S.md, padding: "10px 0", borderTop: i === 0 && dealsGroupes.groupes.length === 0 ? "none" : `1px solid ${T.line}` }}>
                  <div style={{ fontSize: 13.5 }}>{d.explain}{d.ccName && <span style={{ color: T.ink2 }}> — {d.ccName}{d.includes_descendants ? " + agence" : ""}</span>}</div>
                  {d.canEdit && <Button variante="danger" onClick={() => supprimerDeal(d.id)}>Retirer</Button>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <>
            <Card
              title="Accord direct"
              description="Un commercial et un téléprospecteur se mettent d'accord directement, sans gestionnaire ni call center — voir aussi le Deal ci-dessus pour un dossier apporté par un call center."
              actions={<Button variante={formOuvert ? "secondaire" : "principal"} onClick={() => setFormOuvert((v) => !v)}>{formOuvert ? "Fermer" : "Nouvel accord"}</Button>}
            >
              {formOuvert && (
                <div style={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 12, padding: S.md, marginBottom: S.md }}>
                      <p style={{ margin: `0 0 ${S.md}px`, fontSize: 14, color: T.ink2, lineHeight: 1.5, maxWidth: "70ch" }}>
                        Le commercial paie directement le téléprospecteur pour chaque rendez-vous
                        qu&apos;il lui apporte, sans gestionnaire ni call center. Montant fixe, pourcentage du négocié, ou les deux.
                      </p>
                      <FormGrid>
                        <Field label="Commercial qui paie">
                          <select value={indepCommercial} onChange={(e) => setIndepCommercial(e.target.value)} style={champ}>
                            <option value="">À sélectionner</option>
                            {commercialsAll.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
                          </select>
                        </Field>
                        <Field label="Téléprospecteur payé">
                          <select value={indepTelepro} onChange={(e) => setIndepTelepro(e.target.value)} style={champ}>
                            <option value="">À sélectionner</option>
                            {telepros.map((t) => <option key={t.email} value={t.email}>{t.name}</option>)}
                          </select>
                        </Field>
                        <Field label="La rémunération tombe" hint="Au mandat signé, ou dès que le client est venu.">
                          <select value={trigger} onChange={(e) => setTrigger(e.target.value as "signed" | "honored")} style={champ}>
                            <option value="signed">Au mandat signé</option>
                            <option value="honored">Au rendez-vous honoré</option>
                          </select>
                        </Field>
                      </FormGrid>

                      <FormGrid colonnes="repeat(auto-fit, minmax(180px, 1fr))">
                        <Field label="Montant fixe (€)" hint="Par rendez-vous.">
                          <input type="number" step="0.01" value={indepBase} onChange={(e) => setIndepBase(e.target.value)} placeholder="50" style={{ ...champ, textAlign: "right" }} />
                        </Field>
                        <Field label="Pourcentage du négocié (%)" hint="Facultatif.">
                          <input type="number" step="0.1" value={indepPct} onChange={(e) => setIndepPct(e.target.value)} placeholder="10" style={{ ...champ, textAlign: "right" }} />
                        </Field>
                      </FormGrid>

                      <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: S.md, marginTop: S.md }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 4 }}>En plus, si le véhicule est vendu (facultatif)</div>
                        <FormGrid colonnes="repeat(auto-fit, minmax(180px, 1fr))">
                          <Field label="Montant fixe (€)" hint="Versé en plus à la vente.">
                            <input type="number" step="0.01" value={indepSoldEur} onChange={(e) => setIndepSoldEur(e.target.value)} placeholder="0" style={{ ...champ, textAlign: "right" }} />
                          </Field>
                          <Field label="Pourcentage (%)" hint="Base au choix ci-dessous.">
                            <input type="number" step="0.1" value={indepSoldPct} onChange={(e) => setIndepSoldPct(e.target.value)} placeholder="0" style={{ ...champ, textAlign: "right" }} />
                          </Field>
                        </FormGrid>
                        {parseFloat(indepSoldPct) > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: S.sm }}>
                            <Button variante={indepSoldBase === "negocie" ? "principal" : "secondaire"} onClick={() => setIndepSoldBase("negocie")}>% du négocié total</Button>
                            <Button variante={indepSoldBase === "plusvalue" ? "principal" : "secondaire"} onClick={() => setIndepSoldBase("plusvalue")}>% de la plus-value (négocié − prix initial)</Button>
                          </div>
                        )}
                      </div>

                      <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: S.md, marginTop: S.md }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 4 }}>Paliers de volume (facultatif)</div>
                        <p style={{ margin: `0 0 ${S.md}px`, fontSize: 12.5, color: T.ink2, lineHeight: 1.5, maxWidth: "70ch" }}>
                          Le tarif change selon le nombre de RDV pris par CE téléprospecteur le même jour.
                          « Seuil » bascule TOUS les RDV du jour au nouveau tarif dès qu&apos;il est atteint (ex : 20 RDV pris → 20€ au lieu de 10€ pour chacun).
                          « Progressif » ne change que les RDV suivants (ex : les 10 premiers à 60€, à partir du 11e à 100€).
                        </p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: indepTierMode !== "none" ? S.md : 0 }}>
                          <Button variante={indepTierMode === "none" ? "principal" : "secondaire"} onClick={() => { setIndepTierMode("none"); setIndepTiers([]); }}>Aucun palier</Button>
                          <Button variante={indepTierMode === "threshold" ? "principal" : "secondaire"} onClick={() => setIndepTierMode("threshold")}>Seuil (jour)</Button>
                          <Button variante={indepTierMode === "progressive" ? "principal" : "secondaire"} onClick={() => setIndepTierMode("progressive")}>Progressif (jour)</Button>
                        </div>
                        {indepTierMode !== "none" && (
                          <div style={{ display: "grid", gap: 8 }}>
                            {indepTiers.map((t, i) => (
                              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ fontSize: 12.5, color: T.ink2, minWidth: 110 }}>
                                  {indepTierMode === "threshold" ? "À partir de" : "À partir du"}
                                </span>
                                <input type="number" min={1} value={t.minCount} onChange={(e) => setIndepTiers((l) => l.map((x, j) => j === i ? { ...x, minCount: Number(e.target.value) } : x))}
                                  style={{ ...champ, width: 80, textAlign: "right" }} />
                                <span style={{ fontSize: 12.5, color: T.ink2 }}>{indepTierMode === "threshold" ? "RDV/jour →" : "e RDV du jour →"}</span>
                                <input type="number" step="0.01" value={t.amountEur} onChange={(e) => setIndepTiers((l) => l.map((x, j) => j === i ? { ...x, amountEur: Number(e.target.value) } : x))}
                                  placeholder="€" style={{ ...champ, width: 90, textAlign: "right" }} />
                                <span style={{ fontSize: 12.5, color: T.ink2 }}>€ +</span>
                                <input type="number" step="0.1" value={t.pctNego} onChange={(e) => setIndepTiers((l) => l.map((x, j) => j === i ? { ...x, pctNego: Number(e.target.value) } : x))}
                                  placeholder="%" style={{ ...champ, width: 70, textAlign: "right" }} />
                                <span style={{ fontSize: 12.5, color: T.ink2 }}>% négo</span>
                                <Button variante="danger" onClick={() => setIndepTiers((l) => l.filter((_, j) => j !== i))}>✕</Button>
                              </div>
                            ))}
                            <Button variante="secondaire" onClick={() => setIndepTiers((l) => [...l, { minCount: (l[l.length - 1]?.minCount ?? 0) + 1, amountEur: parseFloat(indepBase) || 0, pctNego: 0 }])}>
                              + Ajouter un palier
                            </Button>
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: S.md, flexWrap: "wrap", marginTop: S.md }}>
                        <Button
                          variante="principal" onClick={creerAccordIndep}
                          disabled={!indepCommercial || !indepTelepro || (!indepBase && !indepPct && !indepSoldEur && !indepSoldPct)}
                        >
                          Créer l&apos;accord
                        </Button>
                        <span style={{ fontSize: 13.5, color: T.ink2 }}>
                          Sur un dossier signé à 2 000 € de marge :{" "}
                          <Euro montant={(parseFloat(indepBase) || 0) + ((parseFloat(indepPct) || 0) / 100) * 2000} /> versés au téléprospecteur.
                        </span>
                      </div>
                </div>
              )}
            </Card>

            {userRole === "admin" && (
              <Card
                title={`Accords avec des téléprospecteurs indépendants (${accordsIndep.length})`}
                description="Sans call center : le commercial paie directement le téléprospecteur qui lui apporte le rendez-vous."
              >
                <DataTable
                  colonnes={[
                    { cle: "com", titre: "Commercial", rendu: (x: AccordIndep) => <strong>{x.commercial_name || x.commercial_email}</strong> },
                    { cle: "tel", titre: "Téléprospecteur", rendu: (x: AccordIndep) => x.telepro_name || x.payee_email },
                    { cle: "decl", titre: "Payé quand", rendu: (x: AccordIndep) => <Badge ton="info">{x.trigger_kind === "honored" ? "RDV honoré" : "Mandat signé"}</Badge> },
                    { cle: "fixe", titre: "Fixe", aligne: "droite", rendu: (x: AccordIndep) => <Euro montant={Number(x.base_eur)} /> },
                    { cle: "pct", titre: "Du négocié", aligne: "droite", rendu: (x: AccordIndep) => Number(x.pct_nego) > 0 ? `${Number(x.pct_nego)} %` : <span style={{ color: T.ink2 }}>—</span> },
                    {
                      cle: "vendu", titre: "Si vendu", rendu: (x: AccordIndep) => {
                        const parts = [Number(x.sold_eur) > 0 ? `${Number(x.sold_eur)} €` : "", Number(x.sold_pct) > 0 ? `${Number(x.sold_pct)} % ${x.sold_pct_base === "plusvalue" ? "plus-value" : "négocié"}` : ""].filter(Boolean);
                        return parts.length ? parts.join(" + ") : <span style={{ color: T.ink2 }}>—</span>;
                      },
                    },
                    {
                      cle: "paliers", titre: "Paliers", rendu: (x: AccordIndep) => x.tier_mode === "none" || !x.tiers?.length
                        ? <span style={{ color: T.ink2 }}>—</span>
                        : <span style={{ fontSize: 12.5 }}>
                            <Badge ton="info">{x.tier_mode === "threshold" ? "Seuil" : "Progressif"}</Badge>{" "}
                            {x.tiers.map((t) => `≥${t.minCount}→${t.amountEur}€`).join(", ")}
                          </span>,
                    },
                    {
                      cle: "actions", titre: "", aligne: "droite",
                      rendu: (x: AccordIndep) => <Button variante="danger" onClick={() => supprimerAccordIndep(x.id)}>Retirer</Button>,
                    },
                  ]}
                  lignes={accordsIndep}
                  vide="Aucun accord direct avec un téléprospecteur indépendant."
                />
              </Card>
            )}
        </>
      </div>
    </Shell>
  );
}

type ModeMontant = "fixe" | "pct";

/** Un montant fixe, un %, ou les deux — jamais les deux champs affichés d'office : on pose
 *  la question d'abord ("Fixe, % du négocié, ou les deux ?"). */
function ChoixMontant({ titre, fixe, setFixe, pct, setPct, placeholderFixe, pctLabel }: {
  titre: string; fixe: string; setFixe: (v: string) => void; pct: string; setPct: (v: string) => void; placeholderFixe?: string; pctLabel?: string;
}) {
  const [mode, setMode] = useState<ModeMontant>(pct ? "pct" : "fixe");
  const libellePct = pctLabel ?? "% du négocié";
  return (
    <div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{titre}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <Button variante={mode === "fixe" ? "principal" : "secondaire"} onClick={() => { setMode("fixe"); setPct(""); }}>Montant fixe</Button>
        <Button variante={mode === "pct" ? "principal" : "secondaire"} onClick={() => { setMode("pct"); setFixe(""); }}>{libellePct}</Button>
      </div>
      <FormGrid colonnes="repeat(auto-fit, minmax(150px, 1fr))">
        {mode === "fixe" ? (
          <Field label="Montant fixe (€)"><input type="number" step="0.01" value={fixe} onChange={(e) => setFixe(e.target.value)} placeholder={placeholderFixe ?? "60"} style={{ ...champ, textAlign: "right" }} /></Field>
        ) : (
          <Field label={libellePct}><input type="number" step="0.1" value={pct} onChange={(e) => setPct(e.target.value)} style={{ ...champ, textAlign: "right" }} /></Field>
        )}
      </FormGrid>
    </div>
  );
}

/** Bloc complet "combien il touche" : un montant fixe à l'entrée (déclencheur choisi tout en haut
 *  du formulaire — signature ou RDV honoré ; jamais de %, la somme payée est fixée d'avance, donc
 *  pas de base variable à multiplier), et, seulement si ce deal inclut une commission sur la
 *  vente (choix fait tout en haut, pas redemandé ici), le montant/pourcentage en plus à la vente
 *  (là, un % a un sens : c'est un % du prix négocié du véhicule, qui varie d'un dossier à l'autre). */
function BlocMontant({ titre, trigger, venteIncluse, montantTotal, pctBase, fixe, setFixe, soldFixe, setSoldFixe, soldPct, setSoldPct, onModeChange }: {
  titre: string; trigger: "signed" | "honored"; venteIncluse: boolean; montantTotal: string;
  pctBase?: string; // base du % si différente de montantTotal (ex : le call center est payé sur
  // le total du deal, pas sur ce qu'il en reste après le gestionnaire — montantTotal ne sert alors
  // que d'indicateur "combien reste disponible", pas de base de calcul du %).
  fixe: string; setFixe: (v: string) => void;
  soldFixe: string; setSoldFixe: (v: string) => void; soldPct: string; setSoldPct: (v: string) => void;
  onModeChange?: (mode: "fixe" | "pct", pctValue: string) => void;
}) {
  const total = parseFloat(montantTotal) || 0;
  const basePct = pctBase != null ? parseFloat(pctBase) || 0 : total;
  const reste = total - (parseFloat(fixe) || 0);
  // Le montant à l'entrée est fixe/pré-accordé (jamais rien qui varie d'un RDV à l'autre) : un
  // "%" ici veut simplement dire "% du montant total ci-dessus", donc un calcul immédiat, pas une
  // vraie formule à l'exécution — le résultat en € est ce qui compte, et c'est lui qu'on enregistre
  // (contrairement au % sur la vente plus bas, qui LUI varie selon le prix négocié du véhicule).
  const [modeEntree, setModeEntreeRaw] = useState<"fixe" | "pct">("fixe");
  const [pctEntree, setPctEntreeRaw] = useState("");
  const setModeEntree = (m: "fixe" | "pct") => { setModeEntreeRaw(m); onModeChange?.(m, pctEntree); };
  const setPctEntree = (v: string) => { setPctEntreeRaw(v); onModeChange?.("pct", v); };
  // Le deal peut inclure une commission sur la vente sans que TOUT LE MONDE en touche une —
  // le gestionnaire peut en avoir une et pas le call center/téléprospecteur, ou l'inverse.
  const [aUneCommissionVente, setAUneCommissionVente] = useState(!!(Number(soldFixe) > 0 || Number(soldPct) > 0));
  return (
    <div>
      <div style={legendeSectionLocal}>{titre}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
        {trigger === "honored" ? "Au RDV honoré" : "Au mandat signé"} — montant fixe, ou % du montant total ?
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <Button variante={modeEntree === "fixe" ? "principal" : "secondaire"} onClick={() => setModeEntree("fixe")}>Montant fixe</Button>
        <Button variante={modeEntree === "pct" ? "principal" : "secondaire"} onClick={() => setModeEntree("pct")} disabled={basePct <= 0}>{basePct > 0 ? `% des ${basePct} €` : "% (indique d'abord le montant total)"}</Button>
      </div>
      {modeEntree === "fixe" ? (
        <Field label="Montant fixe (€)" hint={total > 0 ? `Sur les ${total} € disponibles à ce niveau.` : undefined}>
          <input type="number" step="0.01" value={fixe} onChange={(e) => { setFixe(e.target.value); onModeChange?.("fixe", pctEntree); }} placeholder="60" style={{ ...champ, textAlign: "right", maxWidth: 180 }} />
        </Field>
      ) : (
        <Field label={`% des ${basePct} €`} hint={`= ${fixe || 0} €.`}>
          <input
            type="number" step="0.1" value={pctEntree}
            onChange={(e) => { setPctEntree(e.target.value); setFixe(String(Math.round((parseFloat(e.target.value) || 0) / 100 * basePct * 100) / 100)); }}
            style={{ ...champ, textAlign: "right", maxWidth: 180 }}
          />
        </Field>
      )}
      {total > 0 && (
        <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>Reste pour le reste du deal : {reste} €</div>
      )}
      {venteIncluse && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, marginBottom: 6 }}>Est-ce que ce bénéficiaire touche aussi une commission sur la vente du véhicule ?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <Button variante={!aUneCommissionVente ? "principal" : "secondaire"} onClick={() => { setAUneCommissionVente(false); setSoldFixe(""); setSoldPct(""); }}>Non</Button>
            <Button variante={aUneCommissionVente ? "principal" : "secondaire"} onClick={() => setAUneCommissionVente(true)}>Oui</Button>
          </div>
          {aUneCommissionVente && (
            <ChoixMontant titre="Combien, le jour où le véhicule est vendu ?" fixe={soldFixe} setFixe={setSoldFixe} pct={soldPct} setPct={setSoldPct} placeholderFixe="0" />
          )}
        </div>
      )}
    </div>
  );
}

