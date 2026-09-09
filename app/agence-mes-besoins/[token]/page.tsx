"use client";

import { use, useEffect, useMemo, useState } from "react";
import { PageHeader, Card, Button, Field, FormGrid, champ, T, R, S } from "@/components/ui";

type QType = "text" | "tel" | "email" | "date" | "textarea" | "radio" | "checkbox";
type Question = {
  id: string; section: string; label: string; hint?: string;
  type: QType; options?: string[]; required?: boolean; placeholder?: string;
};

const QUESTIONS: Question[] = [
  { id: "societe", section: "Votre établissement", label: "Raison sociale", type: "text", required: true },
  { id: "contact", section: "Votre établissement", label: "Votre nom et fonction", type: "text", required: true },
  { id: "tel", section: "Votre établissement", label: "Téléphone", type: "tel", required: true },
  { id: "email", section: "Votre établissement", label: "E-mail", type: "email", required: true },
  { id: "adresse", section: "Votre établissement", label: "Adresse du point de vente", type: "text" },

  { id: "prestation", section: "Ce que vous attendez de nous", label: "Quel type de prestation recherchez-vous ?", type: "radio", required: true, options: [
    "Des rendez-vous clé en main — vous appelez, vous placez le rendez-vous",
    "Des leads seuls — nos commerciaux font la prospection téléphonique",
    "Les deux, à répartir",
  ] },
  { id: "source", section: "Ce que vous attendez de nous", label: "Sur quelle source travaillons-nous en priorité ?", type: "radio", required: true, options: [
    "Vos annonces leboncoin et La Centrale", "Vos leads", "Les deux",
  ] },
  { id: "volume", section: "Ce que vous attendez de nous", label: "Quel volume mensuel visez-vous ?", hint: "Ce choix détermine le palier de facturation.", type: "radio", required: true, options: [
    "Moins de 15", "15 à 30", "30 à 50", "Plus de 50",
  ] },
  { id: "sens", section: "Ce que vous attendez de nous", label: "Cherchez-vous des vendeurs ou des acheteurs ?", type: "radio", required: true, options: [
    "Vendeurs — reprise et achat", "Acheteurs", "Les deux",
  ] },

  { id: "zone", section: "Zone et véhicules", label: "Ville ou département couvert", type: "text", required: true },
  { id: "rayon", section: "Zone et véhicules", label: "Rayon autour du point de vente", type: "radio", options: ["20 km", "50 km", "100 km", "National"] },
  { id: "segments", section: "Zone et véhicules", label: "Quels segments vous intéressent ?", hint: "Plusieurs réponses possibles.", type: "checkbox", required: true, options: [
    "Citadines et compactes — Clio, 208, Polo, Golf",
    "SUV et gros gabarits — Q5, X5, GLE, Range Rover",
    "Ultra select — Classe S, RS, Porsche, sportives",
  ] },

  { id: "jours", section: "Votre organisation", label: "Jours d'ouverture", type: "text", placeholder: "Lundi au samedi" },
  { id: "horaires", section: "Votre organisation", label: "Créneaux acceptés", type: "text", placeholder: "9h–12h et 14h–18h30" },
  { id: "commerciaux", section: "Votre organisation", label: "Commerciaux disponibles pour recevoir", type: "text" },
  { id: "referent", section: "Votre organisation", label: "Référent opérationnel chez vous", type: "text" },
  { id: "outil", section: "Votre organisation", label: "Où voulez-vous recevoir les rendez-vous ?", type: "radio", options: ["Dans votre CRM", "Agenda Google ou Outlook", "Le tableau partagé YJ Solutions"] },

  { id: "schema", section: "Transaction et encaissement", label: "Comment se dénoue une vente chez vous ?", hint: "Plusieurs réponses possibles.", type: "checkbox", required: true, options: [
    "Rachat immédiat du véhicule, paiement du vendeur sous 48 h",
    "Compte séquestre chez un tiers de confiance",
    "Bon de commande avec acompte du client final",
  ] },
  { id: "acompte", section: "Transaction et encaissement", label: "Pourcentage d'acompte habituel", type: "text", placeholder: "15 %" },

  { id: "palier", section: "Facturation et démarrage", label: "Palier de facturation souhaité", type: "radio", required: true, options: ["Tous les 15 rendez-vous", "Tous les 30 rendez-vous"] },
  { id: "paiement", section: "Facturation et démarrage", label: "Moyen de paiement retenu", type: "radio", required: true, options: ["Virement bancaire", "Prélèvement SEPA", "Carte bancaire"] },
  { id: "duree", section: "Facturation et démarrage", label: "Durée d'engagement envisagée", type: "radio", options: ["Test d'un mois", "3 mois", "6 mois", "12 mois"] },
  { id: "demarrage", section: "Facturation et démarrage", label: "Date de démarrage souhaitée", type: "date" },
  { id: "libre", section: "Facturation et démarrage", label: "Autre chose à nous dire ?", hint: "Contraintes, saisonnalité, expérience passée avec un prestataire…", type: "textarea" },
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

  const progres = useMemo(() => {
    const total = QUESTIONS.length;
    const remplis = QUESTIONS.filter((q) => (answers[q.id] || "").trim().length > 0).length;
    return total ? Math.round((remplis / total) * 100) : 0;
  }, [answers]);

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
      const qs = QUESTIONS.filter((q) => q.section === section && (answers[q.id] || "").trim());
      if (!qs.length) continue;
      lignes.push(section.toUpperCase());
      for (const q of qs) lignes.push(`  ${q.label} : ${answers[q.id]}`);
      lignes.push("");
    }
    return lignes.join("\n");
  }

  async function envoyer() {
    const manquants = new Set(QUESTIONS.filter((q) => q.required && !(answers[q.id] || "").trim()).map((q) => q.id));
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
            {QUESTIONS.filter((q) => q.section === section).map((q) => (
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
