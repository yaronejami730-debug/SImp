"use client";

import { useEffect, useState } from "react";
import { ADRESSE_RDV, SOCIETE, INK, BG, LINE, MUTED, SOFT } from "./theme";
import { HORAIRES_TEXTE } from "@/lib/dde-horaires";

/** Bloc du script : un titre, ce qu'on dit, et éventuellement quoi faire selon la réponse. */
type Bloc = {
  titre: string;
  dire?: string[];
  note?: string;
  branches?: { reponse: string; suite: string }[];
};

/** Règle de conduite affichée en tête du script, avant toute phrase à dire. */
const REGLE = {
  titre: "Ne jamais insister",
  texte: "Un client qui ne veut pas ou qui traîne des pieds, on le remercie et on raccroche. La base est grande : le temps passé à convaincre un réticent est du temps perdu sur les appels suivants. On avance.",
};

const SCRIPT: Bloc[] = [
  {
    titre: "1. Accroche",
    dire: [
      "Bonjour Monsieur / Madame, je vous appelle au sujet de la démarche de naturalisation que vous avez engagée le [date de la démarche].",
      "Je vous appelle parce que nous avons une offre en cours qui vous concerne directement.",
    ],
    note: "Reprendre la date exacte du dossier (ex. « le 25 février 2026 »). Elle prouve qu'on parle bien de sa démarche.",
  },
  {
    titre: "2. Question filtre : le B2",
    dire: ["Avez-vous déjà obtenu le diplôme B2 ?"],
    branches: [
      {
        reponse: "Oui, je l'ai déjà",
        suite: "« Dans ce cas votre dossier est déjà complet de ce côté-là, nous ne pouvons malheureusement rien faire de plus pour vous. Je vous souhaite une bonne continuation. » → on n'enregistre pas de rendez-vous.",
      },
      {
        reponse: "Non, pas encore",
        suite: "C'est le bon profil : on enchaîne sur l'offre.",
      },
    ],
  },
  {
    titre: "3. L'offre",
    dire: [
      "C'est très simple : notre centre de formation vous prépare et vous fait passer l'examen du B2.",
      `Et suite à votre réussite à l'examen du B2, ${SOCIETE} vous offre gratuitement et gracieusement la démarche que vous avez initiée à l'époque.`,
      "Vous n'avez rien à faire, et rien à payer pour cette démarche.",
    ],
    note: `Formule exacte : c'est ${SOCIETE} qui offre la démarche, jamais « nous » ou « le centre de formation ». Et toujours après la condition : la réussite à l'examen du B2. La prise en charge couvre la démarche de naturalisation, pas les 150 € d'inscription à la formation.`,
  },
  {
    titre: "4. Le financement",
    dire: [
      "La formation est entièrement financée par votre CPF.",
      "Il reste simplement un reste à charge obligatoire de 150 €, à régler le jour de l'inscription.",
    ],
    note: "(Seulement s'il pose la question : la formation dure 30 heures maximum, la durée exacte dépend du dossier. Ne pas l'annoncer spontanément.) Les 150 € sont obligatoires et s'annoncent au téléphone, jamais sur place.",
  },
  {
    titre: "5. Le rendez-vous",
    dire: [
      "Je vous propose de prendre un rendez-vous pour faire l'inscription directement en agence.",
      "Vous êtes plutôt disponible en début ou en fin de semaine ?",
      "Et vous préférez le matin ou l'après-midi ?",
    ],
    note: `Laisser le client choisir dans les créneaux ouverts, puis verrouiller un jour et une heure précis. ${HORAIRES_TEXTE} L'inscription se fait sur place, au ${ADRESSE_RDV}.`,
  },
  {
    titre: "6. Revalidation avant de raccrocher",
    dire: [
      "On va juste revalider quelques informations ensemble.",
      "Vous avez bien un titre de séjour valide ?",
      "Vous n'avez pas de diplôme — c'est justement pour ça qu'on passe le B2 ensemble.",
      "Vous avez bien une carte Vitale ?",
      "Et vous n'avez pas de dossier en cours à la préfecture ?",
      "Vous avez bien moins de 60 ans ?",
    ],
    note: "Ne jamais annoncer « un petit questionnaire » : ces informations, on est censés déjà les avoir, on les revalide. C'est ce qui rend le dossier carré et exploitable. Terminer en confirmant nom, prénom, téléphone, date et heure du rendez-vous.",
  },
  {
    titre: "Si le client hésite",
    dire: [
      `Vous ne payez que les 150 € d'inscription : la formation passe par votre CPF, et la démarche, c'est ${SOCIETE} qui vous l'offre une fois l'examen réussi.`,
      "Le rendez-vous ne vous engage à rien : c'est un rendez-vous d'inscription en agence.",
    ],
    note: "Deux réponses, pas plus. Si le client reste réticent : « Je comprends, je ne vais pas vous déranger plus longtemps, bonne journée. » et on passe à l'appel suivant.",
  },
];

export default function Script() {
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!ouvert) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [ouvert]);

  return (
    <>
      <button
        type="button" onClick={() => setOuvert(true)}
        style={{ height: 36, padding: "0 16px", borderRadius: 18, border: `1px solid ${LINE}`, background: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", color: INK }}
      >
        Script
      </button>

      {ouvert && (
        <div
          onClick={() => setOuvert(false)}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(26,26,26,0.35)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "clamp(16px, 5vw, 56px)", overflowY: "auto" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 720, background: BG, border: `1px solid ${LINE}`, borderRadius: 18, padding: "clamp(20px, 4vw, 32px)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
              <h2 style={{ fontSize: "clamp(22px, 5vw, 28px)", fontWeight: 800, letterSpacing: "-0.01em", margin: 0 }}>Script d’appel</h2>
              <button
                type="button" onClick={() => setOuvert(false)}
                style={{ height: 36, width: 36, borderRadius: 18, border: `1px solid ${LINE}`, background: "#fff", fontSize: 15, cursor: "pointer", color: MUTED, flexShrink: 0 }}
                aria-label="Fermer le script"
              >✕</button>
            </div>

            <div style={{ background: INK, color: "#fff", borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.7, marginBottom: 8 }}>
                Règle — {REGLE.titre}
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.6 }}>{REGLE.texte}</div>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              {SCRIPT.map((b) => (
                <div key={b.titre} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 20px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: MUTED, marginBottom: 12 }}>{b.titre}</div>

                  {b.dire?.map((phrase) => (
                    <p key={phrase} style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 10px", borderLeft: `3px solid ${SOFT}`, paddingLeft: 14 }}>
                      « {phrase} »
                    </p>
                  ))}

                  {b.branches && (
                    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                      {b.branches.map((br) => (
                        <div key={br.reponse} style={{ background: SOFT, borderRadius: 10, padding: "12px 14px" }}>
                          <strong style={{ fontSize: 15 }}>{br.reponse}</strong>
                          <div style={{ fontSize: 15, lineHeight: 1.55, marginTop: 4 }}>{br.suite}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {b.note && <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.55, marginTop: b.dire || b.branches ? 12 : 0 }}>{b.note}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
