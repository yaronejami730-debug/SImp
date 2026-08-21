"use client";

import { useState } from "react";
import { authHeaders } from "@/lib/client";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";

export type Vehicule = {
  plaque: string; marque: string; modele: string; finition: string; couleur: string;
  energie: string; miseEnCirculation: string; puissance: string; vin: string; kilometrage: string;
  carrosserie?: string; boiteVitesses?: string; cylindree?: string; genre?: string;
};

/** Recherche d'un véhicule par sa plaque, avec reprise des infos dans la fiche. */
export default function PlaqueLookup({
  immatriculation, onReprendre,
}: {
  immatriculation?: string;
  onReprendre?: (v: Vehicule) => void | Promise<void>;
}) {
  const [plaque, setPlaque] = useState(immatriculation ?? "");
  const [vehicule, setVehicule] = useState<Vehicule | null>(null);
  const [source, setSource] = useState<"cache" | "fournisseur" | "">("");
  const [quota, setQuota] = useState<{ limite: number | null; restant: number | null } | null>(null);
  const [erreur, setErreur] = useState("");
  const [busy, setBusy] = useState(false);

  async function chercher(force = false) {
    setBusy(true); setErreur(""); setVehicule(null); setSource("");
    try {
      const r = await fetch(`/api/plaque?plaque=${encodeURIComponent(plaque)}${force ? "&force=1" : ""}`, { headers: authHeaders() });
      const d = await r.json();
      setQuota(d.quota ?? null);
      if (d.ok) { setVehicule(d.vehicule); setSource(d.source ?? ""); }
      else setErreur(d.error ?? "Erreur");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(false); }
  }

  const pret = plaque.trim().replace(/[^A-Za-z0-9]/g, "").length >= 6 && !busy;

  const cases: [string, string][] = vehicule ? ([
    ["Marque", vehicule.marque], ["Modèle", vehicule.modele], ["Finition", vehicule.finition],
    ["Couleur", vehicule.couleur], ["Énergie", vehicule.energie], ["1re mise en circulation", vehicule.miseEnCirculation],
    ["Puissance", vehicule.puissance ? `${vehicule.puissance} ch` : ""], ["Carrosserie", vehicule.carrosserie ?? ""],
    ["Boîte", vehicule.boiteVitesses ?? ""], ["Cylindrée", vehicule.cylindree ? `${vehicule.cylindree} cm³` : ""],
    ["VIN", vehicule.vin], ["Kilométrage", vehicule.kilometrage],
  ] as [string, string][]).filter(([, v]) => v) : [];

  return (
    <div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
        Saisissez la plaque : marque, modèle, finition, couleur, énergie et date de mise en circulation
        sont récupérés auprès du fournisseur de données SIV. Une plaque déjà cherchée est resservie
        depuis le cache, sans consommer de requête.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={plaque}
          onChange={(e) => setPlaque(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && pret && chercher()}
          placeholder="AB-123-CD"
          style={{ flex: "1 1 180px", minWidth: 160, padding: "11px 14px", fontSize: 15, fontWeight: 700, letterSpacing: 1, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }}
        />
        <button
          onClick={() => chercher()} disabled={!pret}
          style={{
            padding: "11px 22px", borderRadius: 999, border: "none", fontSize: 14, fontWeight: 700, color: "#fff",
            background: pret ? PINK : "#cbd5e1", cursor: pret ? "pointer" : "default",
          }}
        >{busy ? "Recherche…" : "Rechercher"}</button>
      </div>

      {erreur && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", lineHeight: 1.5 }}>
          {erreur}
        </div>
      )}

      {(source || quota) && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#9aa6b8" }}>
          {source === "cache" && "Résultat servi depuis le cache — aucune requête consommée."}
          {source === "fournisseur" && "Requête envoyée au fournisseur."}
          {quota?.restant !== null && quota?.restant !== undefined && (
            <> {" · "}Quota : {quota.restant} requête{Math.abs(quota.restant) > 1 ? "s" : ""} restante{Math.abs(quota.restant) > 1 ? "s" : ""}
              {quota.limite ? ` sur ${quota.limite}/mois` : ""}{quota.restant <= 0 ? " — dépassement en cours" : ""}</>
          )}
        </div>
      )}

      {vehicule && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {cases.map(([k, v]) => (
              <div key={k} style={{ padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 11, color: "#9aa6b8", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 700 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>

          {vehicule && (
            <button
              onClick={() => chercher(true)}
              title="Rappeler le fournisseur pour rafraîchir (consomme une requête)"
              style={{ marginTop: 12, marginRight: 8, padding: "10px 16px", borderRadius: 999, border: "1.5px solid #e5e7eb", background: "#fff", color: "#6b7280", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Rafraîchir
            </button>
          )}
          {onReprendre && (
            <button
              onClick={() => onReprendre(vehicule)}
              style={{ marginTop: 12, padding: "10px 18px", borderRadius: 999, border: `1.5px solid ${PINK}`, background: "#fff", color: PINK, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Reprendre dans la fiche
            </button>
          )}
        </div>
      )}
    </div>
  );
}
