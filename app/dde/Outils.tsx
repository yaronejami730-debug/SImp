"use client";

import { useEffect, useState } from "react";
import { INK, LINE, MUTED, SOFT } from "./theme";

type Outil = { cle: string; nom: string; url: string; login: string; password: string };

/** Champ identifiant : masqué par défaut, copiable en un clic. */
function Champ({ libelle, valeur, masque }: { libelle: string; valeur: string; masque: boolean }) {
  const [visible, setVisible] = useState(!masque);
  const [copie, setCopie] = useState(false);

  if (!valeur) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "8px 0" }}>
      <span style={{ fontSize: 13, color: MUTED }}>{libelle}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <code style={{ fontSize: 14, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>
          {visible ? valeur : "•".repeat(Math.min(valeur.length, 12))}
        </code>
        {masque && (
          <button
            type="button" onClick={() => setVisible((v) => !v)}
            style={{ height: 28, padding: "0 10px", borderRadius: 14, border: `1px solid ${LINE}`, background: "#fff", fontSize: 12, cursor: "pointer", color: MUTED }}
          >{visible ? "Masquer" : "Afficher"}</button>
        )}
        <button
          type="button"
          onClick={async () => { await navigator.clipboard.writeText(valeur); setCopie(true); setTimeout(() => setCopie(false), 1500); }}
          style={{ height: 28, padding: "0 10px", borderRadius: 14, border: `1px solid ${LINE}`, background: "#fff", fontSize: 12, cursor: "pointer", color: copie ? INK : MUTED }}
        >{copie ? "Copié" : "Copier"}</button>
      </span>
    </div>
  );
}

/** Deux raccourcis vers les outils d'appel, avec leurs identifiants partagés. */
export default function Outils() {
  const [outils, setOutils] = useState<Outil[]>([]);
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    const t = typeof window === "undefined" ? null : localStorage.getItem("dde_token");
    if (!t) return;
    (async () => {
      const r = await fetch("/api/dde/outils", { headers: { Authorization: `Bearer ${t}` } });
      const j = await r.json();
      if (r.ok) setOutils(j.outils as Outil[]);
    })();
  }, []);

  if (!outils.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {outils.map((o) => (
          <span key={o.cle} style={{ display: "inline-flex", alignItems: "stretch", border: `1px solid ${LINE}`, borderRadius: 15, background: "#fff", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => window.open(o.url, "_blank", "noopener")}
              title={`Ouvrir ${o.nom}`}
              style={{ height: 30, padding: "0 12px", border: "none", background: "transparent", fontSize: 12, fontWeight: 700, cursor: "pointer", color: INK }}
            >{o.nom}</button>

            {/* Œil : affiche les identifiants sans ouvrir le site. */}
            <button
              type="button"
              onClick={() => setOuvert((v) => (v === o.cle ? null : o.cle))}
              title={ouvert === o.cle ? "Masquer les identifiants" : `Voir les identifiants ${o.nom}`}
              aria-label={`Identifiants ${o.nom}`}
              style={{
                height: 30, width: 32, border: "none", borderLeft: `1px solid ${LINE}`, cursor: "pointer",
                background: ouvert === o.cle ? INK : "transparent",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ouvert === o.cle ? "#fff" : MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
                <circle cx="12" cy="12" r="2.6" />
              </svg>
            </button>
          </span>
        ))}
      </div>

      {ouvert && (() => {
        const o = outils.find((x) => x.cle === ouvert)!;
        if (!o.login && !o.password) {
          return (
            <div style={{ background: SOFT, borderRadius: 12, padding: "12px 16px", fontSize: 13, color: MUTED, maxWidth: 360 }}>
              Aucun identifiant enregistré pour {o.nom}.
            </div>
          );
        }
        return (
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 16px", minWidth: 280, maxWidth: 380 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Accès {o.nom}</span>
              <button
                type="button" onClick={() => setOuvert(null)}
                style={{ width: 24, height: 24, borderRadius: 12, border: `1px solid ${LINE}`, background: "#fff", fontSize: 12, cursor: "pointer", color: MUTED }}
                aria-label="Fermer"
              >✕</button>
            </div>
            <Champ libelle="Identifiant" valeur={o.login} masque={false} />
            <div style={{ borderTop: `1px solid ${SOFT}` }} />
            <Champ libelle="Mot de passe" valeur={o.password} masque />
          </div>
        );
      })()}
    </div>
  );
}
