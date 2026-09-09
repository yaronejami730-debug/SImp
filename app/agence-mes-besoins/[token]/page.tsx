"use client";

import { use, useEffect, useMemo, useState } from "react";
import { PageHeader, Card, Button, Field, FormGrid, champ, T, R, S } from "@/components/ui";

type QType = "text" | "tel" | "email" | "date" | "textarea" | "radio" | "checkbox";
type Question = {
  id: string; section: string; label: string; hint?: string;
  type: QType; options?: string[]; required?: boolean; placeholder?: string;
  // Question conditionnelle : n'apparaît (et ne compte dans la progression/validation) que si le
  // formulaire est déjà dans cet état — c'est ça, "le CRM affiche uniquement les questions qui
  // le concernent" : le rayon "Autre" ne sert à rien tant que "Autre" n'est pas coché, etc.
  showIf?: (a: Record<string, string>) => boolean;
};

const SEGMENTS_HINT =
  "Citadines/compactes : Clio, 208, 2008, Captur, C3, C4, Yaris, Polo, Golf, Ibiza, Leon, Fiesta, Focus, Corsa, Astra, Mini Cooper, A1, A3, Série 1, Classe A. — " +
  "SUV/familiaux : 3008, 5008, Austral, Espace, Tiguan, T-Roc, Q3, Q5, X1, X3, X5, GLA, GLC, GLE, XC40, XC60, Evoque, Sportage, Tucson, RAV4. — " +
  "Gros gabarits/haut de gamme : Q7, X5, X6, X7, GLE, GLS, Classe E, Classe S, Range Rover, Range Rover Sport, Cayenne, Panamera, XC90. — " +
  "Ultra-sélect : Classe S, 911, GTS, Cayenne Turbo, Panamera, M, RS, AMG, Range Rover Autobiography, Bentley, Aston Martin, Ferrari, Lamborghini.";

const QUESTIONS: Question[] = [
  { id: "societe", section: "Votre société", label: "Raison sociale / nom de l'établissement", type: "text", required: true },
  { id: "contactNom", section: "Votre société", label: "Nom et prénom du contact", type: "text", required: true },
  { id: "fonction", section: "Votre société", label: "Fonction", type: "text" },
  { id: "adresse", section: "Votre société", label: "Adresse du point de vente", type: "text" },
  { id: "tel", section: "Votre société", label: "Téléphone", type: "tel", required: true },
  { id: "email", section: "Votre société", label: "E-mail", type: "email", required: true },
  { id: "attentes", section: "Votre société", label: "Parlez-nous de votre activité et de ce que vous souhaitez développer avec nous.", type: "textarea" },

  { id: "prestation", section: "Ce que vous recherchez", label: "Quelle prestation souhaitez-vous mettre en place ?", type: "radio", required: true, options: [
    "Rendez-vous clé en main — nous nous chargeons de la prospection et de la prise de rendez-vous, votre commercial reçoit le prospect et gère la suite du dossier",
    "Leads qualifiés — nous vous transmettons les leads, vos commerciaux assurent eux-mêmes la prospection téléphonique",
    "Les deux",
  ] },
  { id: "source", section: "Ce que vous recherchez", label: "Sur quelle source souhaitez-vous que nous travaillions en priorité ?", type: "radio", required: true, options: [
    "Sur les leads que nous vous fournissons", "Sur d'autres supports ou sources", "Les deux",
  ] },

  { id: "objectifType", section: "Volume souhaité", label: "Comment souhaitez-vous définir votre objectif commercial ?", type: "radio", required: true, options: [
    "Par commercial", "Par semaine", "Par mois", "Autre",
  ] },
  { id: "nbCommerciaux", section: "Volume souhaité", label: "Nombre de commerciaux concernés", type: "text", showIf: (a) => a.objectifType === "Par commercial" },
  { id: "rdvSemaine", section: "Volume souhaité", label: "Nombre de rendez-vous souhaités par semaine", type: "text", showIf: (a) => a.objectifType === "Par semaine" },
  { id: "rdvMois", section: "Volume souhaité", label: "Nombre de rendez-vous souhaités par mois", type: "text", showIf: (a) => a.objectifType === "Par mois" },
  { id: "objectifAutre", section: "Volume souhaité", label: "Précisez votre objectif", type: "text", showIf: (a) => a.objectifType === "Autre" },

  { id: "clientele", section: "Vendeurs ou acheteurs", label: "Quelle clientèle recherchez-vous ?", type: "radio", required: true, options: ["Vendeurs", "Acheteurs", "Les deux"] },

  { id: "ville", section: "Zone et véhicules recherchés", label: "Ville du point de vente", type: "text", required: true },
  { id: "departement", section: "Zone et véhicules recherchés", label: "Département (si vous le connaissez)", type: "text" },
  { id: "rayon", section: "Zone et véhicules recherchés", label: "Rayon de recherche autour du point de vente", type: "radio", required: true, options: ["5 km", "10 km", "15 km", "20 km", "25 km", "30 km", "35 km", "Autre"] },
  { id: "rayonAutre", section: "Zone et véhicules recherchés", label: "Précisez le rayon", type: "text", showIf: (a) => a.rayon === "Autre" },
  { id: "segments", section: "Zone et véhicules recherchés", label: "Quels types de véhicules recherchez-vous ?", hint: SEGMENTS_HINT, type: "checkbox", required: true, options: [
    "Citadines / compactes", "SUV / véhicules familiaux", "Gros gabarits / haut de gamme", "Ultra-sélect / très forte valeur",
  ] },
  { id: "marques", section: "Zone et véhicules recherchés", label: "Marques recherchées", type: "text" },
  { id: "modeles", section: "Zone et véhicules recherchés", label: "Modèles recherchés", type: "text" },
  { id: "anneeMin", section: "Zone et véhicules recherchés", label: "Année minimum", type: "text" },
  { id: "anneeMax", section: "Zone et véhicules recherchés", label: "Année maximum", type: "text" },
  { id: "kmMax", section: "Zone et véhicules recherchés", label: "Kilométrage maximum", type: "text" },
  { id: "budget", section: "Zone et véhicules recherchés", label: "Budget / valeur (minimum ou maximum)", type: "text" },
  { id: "autresCriteres", section: "Zone et véhicules recherchés", label: "Autres critères spécifiques", type: "textarea" },

  { id: "jours", section: "Organisation des rendez-vous", label: "Quels sont vos jours d'ouverture ?", type: "text", placeholder: "Lundi au samedi" },
  { id: "creneaux", section: "Organisation des rendez-vous", label: "Quels créneaux pouvez-vous accepter pour les rendez-vous ?", type: "checkbox", required: true, options: ["Matin", "Après-midi", "Journée complète", "Créneaux personnalisés"] },
  { id: "creneauxPerso", section: "Organisation des rendez-vous", label: "Précisez vos créneaux", type: "text", showIf: (a) => (a.creneaux || "").includes("Créneaux personnalisés") },
  { id: "outil", section: "Organisation des rendez-vous", label: "Où souhaitez-vous recevoir les rendez-vous ?", type: "radio", required: true, options: ["Notre CRM, mis à votre disposition", "Google Agenda", "Tableau partagé", "Autre"] },
  { id: "outilAutre", section: "Organisation des rendez-vous", label: "Précisez", type: "text", showIf: (a) => a.outil === "Autre" },

  { id: "transaction", section: "Transaction et encaissement", label: "Comment se déroule habituellement la transaction chez vous ?", type: "radio", required: true, options: [
    "Rachat immédiat du véhicule lorsque l'acheteur final a versé son acompte", "Passage par un compte séquestre / tiers de confiance", "Autre fonctionnement",
  ] },
  { id: "transactionAutre", section: "Transaction et encaissement", label: "Précisez", type: "text", showIf: (a) => a.transaction === "Autre fonctionnement" },

  { id: "palier", section: "Facturation et démarrage", label: "À quel palier souhaitez-vous être facturé ?", type: "radio", required: true, options: ["Tous les 15 rendez-vous", "Tous les 30 rendez-vous", "Autre"] },
  { id: "palierAutre", section: "Facturation et démarrage", label: "Précisez", type: "text", showIf: (a) => a.palier === "Autre" },
  { id: "paiement", section: "Facturation et démarrage", label: "Moyen de paiement souhaité", type: "radio", required: true, options: ["Virement bancaire", "Prélèvement", "Carte bancaire"] },
  { id: "demarrage", section: "Facturation et démarrage", label: "Date de démarrage souhaitée", type: "date" },
];

const SECTIONS = [...new Set(QUESTIONS.map((q) => q.section))];
const YJ_LOGO = "https://rz18xsip6ybhgfji.public.blob.vercel-storage.com/yj-solutions/logo.png";
// Même palette que l'espace interne /prospection-agence (EspaceAgenceShell) — jamais Simplicicar.
const YJ_PALETTE = { primary: "#c21f2c", dark: "#12203a" };

export default function AgenceMesBesoinsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [statut, setStatut] = useState<"chargement" | "invalide" | "ok" | "deja" | "expire" | "verrouille">("chargement");
  const [nomAgence, setNomAgence] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consentement, setConsentement] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [regeneration, setRegeneration] = useState(false);
  const [erreurs, setErreurs] = useState<Set<string>>(new Set());
  const [erreurConsentement, setErreurConsentement] = useState(false);

  function verifier() {
    fetch(`/api/agence-mes-besoins/${token}`, { credentials: "same-origin" }).then((r) => r.json()).then((d) => {
      if (!d.ok) { setStatut("invalide"); return; }
      setNomAgence(d.name);
      setStatut(d.etat);
    }).catch(() => setStatut("invalide"));
  }

  useEffect(() => { verifier(); }, [token]);

  async function regenererLien() {
    setRegeneration(true);
    try {
      const r = await fetch(`/api/agence-mes-besoins/${token}`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ action: "regenerer" }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.error ?? "Erreur — réessayez."); return; }
      setStatut("chargement");
      verifier();
    } finally {
      setRegeneration(false);
    }
  }

  // Questions réellement affichées compte tenu des réponses déjà données (voir showIf) — c'est
  // ça, "le CRM n'affiche que ce qui concerne le professionnel" : sert à la progression, la
  // validation et le récapitulatif, pas seulement au rendu des sections.
  const visibles = useMemo(() => QUESTIONS.filter((q) => !q.showIf || q.showIf(answers)), [answers]);

  const progres = useMemo(() => {
    const total = visibles.length;
    const remplis = visibles.filter((q) => (answers[q.id] || "").trim().length > 0).length;
    return total ? Math.round((remplis / total) * 100) : 0;
  }, [answers, visibles]);

  function setValeur(id: string, v: string) {
    setAnswers((a) => ({ ...a, [id]: v }));
  }
  function toggleCheckbox(id: string, option: string) {
    const courant = (answers[id] || "").split(", ").filter(Boolean);
    const idx = courant.indexOf(option);
    if (idx >= 0) courant.splice(idx, 1); else courant.push(option);
    setValeur(id, courant.join(", "));
  }

  function construireRecap() {
    const lignes: string[] = [`QUESTIONNAIRE DE CADRAGE — ${nomAgence}`, `Reçu le ${new Date().toLocaleDateString("fr-FR")}`, ""];
    for (const section of SECTIONS) {
      const qs = visibles.filter((q) => q.section === section && (answers[q.id] || "").trim());
      if (!qs.length) continue;
      lignes.push(section.toUpperCase());
      for (const q of qs) lignes.push(`  ${q.label} : ${answers[q.id]}`);
      lignes.push("");
    }
    return lignes.join("\n");
  }

  async function envoyer() {
    const manquants = new Set(visibles.filter((q) => q.required && !(answers[q.id] || "").trim()).map((q) => q.id));
    setErreurs(manquants);
    setErreurConsentement(!consentement);
    if (manquants.size) {
      document.getElementById(`q-${[...manquants][0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!consentement) {
      document.getElementById("q-consentement")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setEnvoi(true);
    try {
      const r = await fetch(`/api/agence-mes-besoins/${token}`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ answers, raw: construireRecap() }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.error ?? "Erreur — réessayez."); return; }
      setEnvoye(true);
    } finally {
      setEnvoi(false);
    }
  }

  if (statut === "chargement") return null;

  if (statut === "invalide") {
    return <Coquille><div style={{ padding: 60, textAlign: "center", color: T.ink2 }}>Ce lien n&apos;est plus valide.</div></Coquille>;
  }
  if (statut === "deja" && !envoye) {
    return <Coquille><div style={{ padding: 60, textAlign: "center", color: T.ink2 }}>Merci, vos réponses ont déjà été transmises — nous revenons vers vous rapidement.</div></Coquille>;
  }
  if (statut === "expire" || statut === "verrouille") {
    return (
      <Coquille>
        <div style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginBottom: 8 }}>
            {statut === "expire" ? "Ce lien a expiré (72h)." : "Ce lien a déjà été ouvert sur un autre appareil."}
          </div>
          <p style={{ color: T.ink2, fontSize: 14.5, maxWidth: "48ch", margin: "0 auto 20px" }}>
            {statut === "expire"
              ? "Par sécurité, un lien de réponse n'est valable que 72 heures."
              : "Par sécurité, ce lien de réponse ne fonctionne que depuis l'appareil qui l'a ouvert en premier — pas de simple copier-coller ailleurs. Si c'est bien vous, régénère un nouveau lien ci-dessous."}
          </p>
          <Button variante="principal" onClick={regenererLien} disabled={regeneration} style={{ height: 44, padding: "0 20px" }}>
            {regeneration ? "…" : "Régénérer le lien"}
          </Button>
        </div>
      </Coquille>
    );
  }
  if (envoye) {
    return (
      <Coquille>
        <div style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Merci !</div>
          <div style={{ color: T.ink2, fontSize: 14.5 }}>Vos réponses sont bien arrivées — nous revenons vers vous rapidement.</div>
        </div>
      </Coquille>
    );
  }

  return (
    <Coquille progres={progres}>
      <PageHeader title={nomAgence ? `${nomAgence}, dites-nous comment vous vendez` : "Dites-nous comment vous vendez"}
        subtitle="Ce questionnaire nous sert à calibrer votre grille tarifaire, votre zone et votre volume. Comptez trois minutes." />

      {SECTIONS.map((section) => (
        <Card key={section} title={section}>
          <div style={{ display: "grid", gap: S.lg }}>
            {visibles.filter((q) => q.section === section).map((q) => (
              <div key={q.id} id={`q-${q.id}`}>
                <ChampQuestion q={q} valeur={answers[q.id] || ""} onChange={(v) => setValeur(q.id, v)} onToggle={(opt) => toggleCheckbox(q.id, opt)} enErreur={erreurs.has(q.id)} />
              </div>
            ))}
          </div>
        </Card>
      ))}

      <div id="q-consentement">
      <Card title="Confidentialité des données">
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox" checked={consentement}
            onChange={(e) => { setConsentement(e.target.checked); setErreurConsentement(false); }}
            style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: T.brand }}
          />
          <span style={{ fontSize: 13.5, color: T.ink2, lineHeight: 1.6 }}>
            J&apos;accepte que ces informations soient transmises à YJ Solutions. Elles sont conservées de façon
            sécurisée et ne servent qu&apos;à établir la proposition commerciale puis, en cas de collaboration,
            à la facturation et au suivi de la relation — elles ne sont en aucun cas transmises à un tiers.
          </span>
        </label>
        {erreurConsentement && <p style={{ color: T.danger, fontSize: 13, margin: "8px 0 0" }}>Ton accord est nécessaire pour envoyer le formulaire.</p>}
        <div style={{ marginTop: S.lg }}>
          <Button variante="principal" onClick={envoyer} disabled={envoi} style={{ height: 46, padding: "0 24px", fontSize: 15 }}>
            {envoi ? "Envoi…" : "Envoyer mes réponses"}
          </Button>
        </div>
      </Card>
      </div>
    </Coquille>
  );
}

function ChampQuestion({ q, valeur, onChange, onToggle, enErreur }: {
  q: Question; valeur: string; onChange: (v: string) => void; onToggle: (opt: string) => void; enErreur: boolean;
}) {
  const contenu = (() => {
    if (q.type === "textarea") return <textarea value={valeur} onChange={(e) => onChange(e.target.value)} rows={4} style={{ ...champ, height: "auto", padding: "12px 14px", resize: "vertical" }} />;
    if (q.type === "radio" || q.type === "checkbox") {
      const selection = valeur.split(", ").filter(Boolean);
      return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(q.options ?? []).map((opt) => {
            const coche = q.type === "radio" ? valeur === opt : selection.includes(opt);
            return (
              <Button
                key={opt} type="button" variante={coche ? "principal" : "secondaire"}
                onClick={() => (q.type === "radio" ? onChange(opt) : onToggle(opt))}
                style={{ height: "auto", padding: "10px 16px", whiteSpace: "normal", textAlign: "left", lineHeight: 1.4, fontWeight: coche ? 700 : 500 }}
              >
                {opt}
              </Button>
            );
          })}
        </div>
      );
    }
    return <input type={q.type} value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={q.placeholder} style={champ} />;
  })();

  return (
    <Field label={q.label} hint={q.hint}>
      {contenu}
      {enErreur && <p style={{ color: T.danger, fontSize: 13, margin: "8px 0 0" }}>Une réponse est nécessaire pour continuer.</p>}
    </Field>
  );
}

function Coquille({ children, progres }: { children: React.ReactNode; progres?: number }) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", ["--brand-primary" as string]: YJ_PALETTE.primary, ["--brand-dark" as string]: YJ_PALETTE.dark } as React.CSSProperties}>
      <header style={{ background: T.surface, borderBottom: `1px solid ${T.line}`, padding: "20px 24px", textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={YJ_LOGO} alt="YJ Solutions" style={{ height: 44, objectFit: "contain" }} />
      </header>
      {progres != null && (
        <div style={{ position: "sticky", top: 0, zIndex: 5, background: T.surface, borderBottom: `1px solid ${T.line}`, padding: `10px ${S.md}px`, display: "flex", alignItems: "center", gap: 14, fontSize: 13, color: T.ink2 }}>
          <span>Complété</span>
          <div style={{ flex: 1, height: 6, background: T.surface3, borderRadius: R.pill, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progres}%`, background: T.brand, transition: "width .25s ease" }} />
          </div>
          <b style={{ fontWeight: 700, color: T.ink }}>{progres} %</b>
        </div>
      )}
      <main style={{ padding: `${S.lg}px ${S.md}px ${S.xxl}px` }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>{children}</div>
      </main>
    </div>
  );
}
