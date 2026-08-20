"use client";

import { useCallback, useEffect, useState } from "react";
import { INK, LINE, MUTED, SOFT } from "./theme";
import { plageDuJour } from "@/lib/dde-horaires";
import { evalueCadence, heuresActives, niveauDebit, OBJECTIF_MIN, OBJECTIF_HAUT, type Cadence as CadenceType } from "@/lib/dde-cadence";

type Jour = { jour: string; total: number; valides: number; premiere: number; derniere: number };
type Equipier = { email: string; name: string; jours: Jour[] };
type Raison = { telepro_name: string; jour: string; heure: number; raison: string };
type Me = { email: string; name: string; role: "admin" | "telepro" };

const VERT = "#1f7a3f";
const ORANGE = "#c07414";
const ROUGE = "#b3261e";
const COULEUR = { bon: VERT, moyen: ORANGE, faible: ROUGE, neutre: MUTED } as const;

/** Réponses proposées quand la cadence passe au rouge. */
const RAISONS = [
  "Les gens ne répondent pas",
  "Beaucoup de numéros hors cible (HRP)",
  "Les appels durent longtemps",
  "Beaucoup de refus",
  "Numéros déjà appelés dans la base",
  "Problème technique ou de ligne",
  "Autre",
];

const isoDuJour = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Les n dernières journées ouvrées avant une date. */
function joursPrecedents(iso: string, combien: number): string[] {
  const [y, m, d] = iso.split("-").map(Number);
  const curseur = new Date(y, m - 1, d);
  const out: string[] = [];
  while (out.length < combien) {
    curseur.setDate(curseur.getDate() - 1);
    const j = isoDuJour(curseur);
    if (plageDuJour(j)) out.push(j);
  }
  return out;
}

/** Feu tricolore vu par la téléprospectrice. */
function feu(c: CadenceType): { couleur: string; titre: string; phrase: string } | null {
  if (c.etat === "excellente" || c.etat === "bonne") return { couleur: VERT, titre: "Bonne cadence", phrase: "Continuez sur cette cadence." };
  if (c.etat === "moyenne") return { couleur: ORANGE, titre: "Cadence moyenne", phrase: "" };
  if (c.etat === "faible") return { couleur: ROUGE, titre: "Cadence faible", phrase: "On peut mieux faire, on s’accroche." };
  return null; // fermé, avant l'ouverture, ou début de journée : on ne juge pas
}

/** Une case du tableau d'équipe : dossiers soumis, et le rythme sur le temps réellement passé. */
function Case({ dossiers, heures }: { dossiers: number; heures: number }) {
  const debit = heures > 0 ? dossiers / heures : 0;
  const niveau = dossiers === 0 && heures < 0.5 ? "neutre" : niveauDebit(debit, Math.max(heures, 0.5));
  const couleur = COULEUR[niveau];
  const heuresTexte = `${(Math.round(heures * 10) / 10).toFixed(1)} h`;
  return (
    <div
      title={dossiers > 0 ? `${dossiers} dossier${dossiers > 1 ? "s" : ""} sur ${heuresTexte} d'activité` : "Aucun dossier saisi"}
      style={{ textAlign: "center", padding: "8px 6px", borderRadius: 10, background: niveau === "neutre" ? SOFT : `${couleur}14` }}
    >
      <div style={{ fontSize: 17, fontWeight: 800, color: niveau === "neutre" ? MUTED : couleur }}>{dossiers}</div>
      <div style={{ fontSize: 11, color: MUTED }}>{niveau === "neutre" ? "—" : `${(Math.round(debit * 10) / 10).toFixed(1)}/h`}</div>
    </div>
  );
}

/**
 * Cadence : rythme de saisie des dossiers rapporté au temps travaillé.
 * La téléprospectrice voit un simple feu tricolore ; l'admin voit son équipe sur trois jours.
 */
export default function Cadence({ me, version }: { me: Me; version: number }) {
  const [jours, setJours] = useState<Jour[]>([]);
  const [equipe, setEquipe] = useState<Equipier[] | null>(null);
  const [raisons, setRaisons] = useState<Raison[]>([]);
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [raisonDonnee, setRaisonDonnee] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const t = typeof window === "undefined" ? null : localStorage.getItem("dde_token");
    if (!t) return;
    const r = await fetch("/api/dde/cadence", { headers: { Authorization: `Bearer ${t}` } });
    const j = await r.json();
    if (r.ok) { setJours(j.jours ?? []); setEquipe(j.equipe ?? null); setRaisons(j.raisons ?? []); }
  }, []);

  useEffect(() => { charger(); }, [charger, version]);

  // La journée avance : on suit l'heure de près, les chiffres tous les quarts d'heure.
  useEffect(() => {
    const horloge = setInterval(() => setMaintenant(new Date()), 60_000);
    const chiffres = setInterval(charger, 15 * 60_000);
    return () => { clearInterval(horloge); clearInterval(chiffres); };
  }, [charger]);

  const iso = isoDuJour(maintenant);
  const cadence = evalueCadence(iso, maintenant, jours.find((j) => j.jour === iso)?.total ?? 0);

  // ---- Vue admin : l'équipe sur aujourd'hui, hier et avant-hier ----

  if (me.role === "admin") {
    if (!equipe || equipe.length === 0) return null;
    const [hier, avantHier] = joursPrecedents(iso, 2);
    const colonnes = [
      { iso, titre: "Aujourd’hui", enCours: true },
      { iso: hier, titre: "Hier", enCours: false },
      { iso: avantHier, titre: "Avant-hier", enCours: false },
    ];

    return (
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "20px 22px", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: MUTED }}>
            Cadence de l’équipe
          </span>
          <span style={{ fontSize: 13, color: MUTED }}>
            dossiers soumis · <span style={{ color: VERT, fontWeight: 700 }}>{OBJECTIF_MIN} à {OBJECTIF_HAUT}/h</span> attendus
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1.6fr) repeat(3, minmax(64px, 1fr))", gap: 8, alignItems: "center" }}>
          <div />
          {colonnes.map((c) => (
            <div key={c.titre} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: MUTED }}>
              {c.titre}
            </div>
          ))}

          {equipe.map((t) => (
            <div key={t.email} style={{ display: "contents" }}>
              <div style={{ fontSize: 15, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{t.name || t.email}</div>
              {colonnes.map((c) => {
                const jourT = t.jours.find((j) => j.jour === c.iso);
                return (
                  <Case
                    key={c.iso}
                    dossiers={jourT?.total ?? 0}
                    heures={heuresActives(c.iso, jourT, c.enCours ? maintenant : undefined)}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: MUTED }}>
          Chiffre du haut : dossiers soumis. En dessous : le rythme rapporté au temps réellement passé
          (de la première à la dernière saisie du jour — au survol, le détail).
          <span style={{ color: VERT }}> Vert</span> dans la fourchette,
          <span style={{ color: ORANGE }}> orange</span> juste en dessous,
          <span style={{ color: ROUGE }}> rouge</span> loin du compte.
        </div>

        {raisons.length > 0 && (
          <div style={{ marginTop: 18, borderTop: `1px solid ${SOFT}`, paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: MUTED, marginBottom: 10 }}>
              Ce que l’équipe signale
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {raisons.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
                  <span><strong>{r.telepro_name}</strong> — {r.raison.toLowerCase()}</span>
                  <span style={{ color: MUTED }}>{r.jour.split("-").reverse().join("/")} à {r.heure}h</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Vue téléprospectrice : un feu tricolore, sous les boutons ----

  const signal = feu(cadence);
  if (!signal) return null;

  const heureCourante = maintenant.getHours();
  const cleRaison = `dde_raison_${iso}_${heureCourante}`;
  const dejaExplique = raisonDonnee !== null || (typeof window !== "undefined" && localStorage.getItem(cleRaison) !== null);

  async function envoyerRaison(raison: string) {
    setRaisonDonnee(raison);
    localStorage.setItem(cleRaison, raison);
    const t = localStorage.getItem("dde_token");
    if (!t) return;
    await fetch("/api/dde/cadence", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ jour: iso, heure: heureCourante, raison }),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 16,
            background: signal.couleur, color: "#fff", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 4, background: "#fff", opacity: 0.85 }} />
          {signal.titre}
        </span>
        {signal.phrase && <span style={{ fontSize: 13, color: MUTED }}>{signal.phrase}</span>}
      </div>

      {/* Cadence faible : on demande ce qui bloque, une fois par heure. */}
      {cadence.etat === "faible" && !dejaExplique && (
        <div style={{ background: "#fff", border: `1px solid ${signal.couleur}`, borderRadius: 14, padding: "16px 18px", maxWidth: 460 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Qu’est-ce qui bloque en ce moment ?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
            {RAISONS.map((r) => (
              <button
                key={r} type="button" onClick={() => envoyerRaison(r)}
                style={{
                  height: 34, padding: "0 14px", borderRadius: 17, border: `1px solid ${LINE}`, background: "#fff",
                  fontSize: 13, fontWeight: 700, color: INK, cursor: "pointer",
                }}
              >{r}</button>
            ))}
          </div>
        </div>
      )}

      {cadence.etat === "faible" && raisonDonnee && (
        <span style={{ fontSize: 13, color: MUTED }}>Noté : {raisonDonnee.toLowerCase()}. Bon courage pour la suite.</span>
      )}
    </div>
  );
}
