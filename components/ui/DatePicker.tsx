"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { T, R } from "./tokens";

const JOURS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const auJour = (v: string) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const dateFR = (v: string) => (v ? auJour(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

/** Grille d'un mois, lundi en premier, avec les jours des mois voisins en gris. */
function grille(mois: Date) {
  const premier = new Date(mois.getFullYear(), mois.getMonth(), 1);
  const decalage = (premier.getDay() + 6) % 7;
  const debut = new Date(premier);
  debut.setDate(1 - decalage);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(debut);
    d.setDate(debut.getDate() + i);
    return d;
  });
}

export type DatePickerProps = {
  value: string;                    // "YYYY-MM-DD"
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  /** Jours mis en avant (ex : jours avec des créneaux libres). */
  marques?: Set<string>;
  /** Bornes d'un intervalle en cours de sélection, pour le surlignage. */
  intervalle?: { from: string; to: string };
};

/** Sélecteur de date : champ lisible + calendrier. Aucun champ natif, même rendu partout. */
export default function DatePicker({ value, onChange, label, placeholder = "Choisir une date", min, max, marques, intervalle }: DatePickerProps) {
  const [ouvert, setOuvert] = useState(false);
  const [mois, setMois] = useState(() => (value ? auJour(value) : new Date()));
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => { if (value) setMois(auJour(value)); }, [value]);

  // Clic à l'extérieur et Échap referment le calendrier.
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => { if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false); };
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", touche);
    return () => { document.removeEventListener("mousedown", clic); document.removeEventListener("keydown", touche); };
  }, [ouvert]);

  const jours = useMemo(() => grille(mois), [mois]);
  const aujourdhui = iso(new Date());

  const horsBornes = (j: string) => Boolean((min && j < min) || (max && j > max));

  return (
    <div ref={boite} style={{ position: "relative" }}>
      {label && <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{label}</span>}

      <button
        type="button" onClick={() => setOuvert((o) => !o)}
        style={{
          width: "100%", boxSizing: "border-box", height: 44, padding: "0 14px", fontSize: 15, textAlign: "left",
          border: `1px solid ${ouvert ? T.lineStrong : T.line}`, borderRadius: R.sm, background: T.surface,
          color: value ? T.ink : T.ink3, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}
      >
        <span>{value ? dateFR(value) : placeholder}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.ink2} strokeWidth="1.9" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {ouvert && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 50, width: 306,
          background: T.surface, border: `1px solid ${T.line}`, borderRadius: R.md, padding: 16,
          boxShadow: "0 18px 40px rgba(26,26,26,0.16)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button type="button" aria-label="Mois précédent" onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}
              style={{ width: 32, height: 32, borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, cursor: "pointer", color: T.ink }}>‹</button>
            <div style={{ fontSize: 15, fontWeight: 700, textTransform: "capitalize" }}>{MOIS[mois.getMonth()]} {mois.getFullYear()}</div>
            <button type="button" aria-label="Mois suivant" onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}
              style={{ width: 32, height: 32, borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, cursor: "pointer", color: T.ink }}>›</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 6 }}>
            {JOURS.map((j) => (
              <div key={j} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: T.ink3, textTransform: "uppercase" }}>{j}</div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {jours.map((d) => {
              const j = iso(d);
              const autreMois = d.getMonth() !== mois.getMonth();
              const choisi = j === value;
              const dansIntervalle = Boolean(intervalle && j >= intervalle.from && j <= intervalle.to);
              const bloque = horsBornes(j);
              return (
                <button
                  key={j} type="button" disabled={bloque}
                  onClick={() => { onChange(j); setOuvert(false); }}
                  style={{
                    position: "relative", height: 38, border: "none", borderRadius: R.sm, fontSize: 14,
                    cursor: bloque ? "not-allowed" : "pointer",
                    fontWeight: choisi || j === aujourdhui ? 700 : 500,
                    background: choisi ? T.brand : dansIntervalle ? T.brandSoft : "transparent",
                    color: choisi ? "#fff" : bloque ? T.ink3 : autreMois ? T.ink3 : T.ink,
                    outline: j === aujourdhui && !choisi ? `1px solid ${T.lineStrong}` : "none",
                  }}
                >
                  {d.getDate()}
                  {marques?.has(j) && !choisi && (
                    <span style={{ position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)", width: 5, height: 5, borderRadius: 3, background: T.brand }} />
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 12, borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
            <button type="button" onClick={() => { onChange(aujourdhui); setOuvert(false); }}
              style={{ flex: 1, height: 34, borderRadius: R.pill, border: `1px solid ${T.line}`, background: T.surface, fontSize: 13, fontWeight: 700, cursor: "pointer", color: T.ink }}>
              Aujourd&apos;hui
            </button>
            {value && (
              <button type="button" onClick={() => { onChange(""); setOuvert(false); }}
                style={{ height: 34, padding: "0 12px", borderRadius: R.pill, border: `1px solid ${T.line}`, background: T.surface, fontSize: 13, cursor: "pointer", color: T.ink2 }}>
                Effacer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Deux dates liées : la fin ne peut pas précéder le début. */
export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
      <DatePicker label="Du" value={from} max={to || undefined} intervalle={from && to ? { from, to } : undefined}
        onChange={(v) => onChange({ from: v, to: to && v > to ? v : to })} />
      <DatePicker label="Au" value={to} min={from || undefined} intervalle={from && to ? { from, to } : undefined}
        onChange={(v) => onChange({ from, to: v })} />
    </div>
  );
}
