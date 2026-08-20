"use client";

import { useState } from "react";
import { INK, LINE, MUTED, SOFT, WEEKDAYS, MONTHS } from "./theme";
import { creneauxDde, estJourOuvre } from "@/lib/dde-horaires";

const trigger: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", height: 56, padding: "0 18px", fontSize: 16, textAlign: "left",
  border: `1px solid ${LINE}`, borderRadius: 10, background: "#fff", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "space-between",
};

const popover: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 10, background: "#fff",
  border: `1px solid ${LINE}`, borderRadius: 14, boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
};

/** Sélecteur de date (calendrier FR, lundi en premier) — repris du maquettage fourni. */
export function DatePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const year = month.getFullYear(), m = month.getMonth();
  const startOffset = (new Date(year, m, 1).getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: { iso: string | null; label: string }[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ iso: null, label: "" });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, label: String(d) });
  }

  const [y, mm, dd] = value ? value.split("-") : [];

  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...trigger, color: value ? INK : MUTED }}>
        <span>{value ? `${dd}/${mm}/${y}` : "Sélectionner une date"}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
      </button>
      {open && (
        <div style={{ ...popover, padding: 20, width: 300 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button type="button" onClick={() => setMonth(new Date(year, m - 1, 1))} style={{ width: 32, height: 32, border: "none", background: SOFT, borderRadius: 8, cursor: "pointer", fontSize: 16 }}>‹</button>
            <div style={{ fontSize: 16, fontWeight: 700, color: INK, textTransform: "capitalize" }}>{MONTHS[m]} {year}</div>
            <button type="button" onClick={() => setMonth(new Date(year, m + 1, 1))} style={{ width: 32, height: 32, border: "none", background: SOFT, borderRadius: 8, cursor: "pointer", fontSize: 16 }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, fontSize: 12, fontWeight: 700, color: MUTED, textAlign: "center", marginBottom: 6 }}>
            {WEEKDAYS.map((wd) => <div key={wd}>{wd}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {cells.map((c, i) => {
              const selected = c.iso != null && c.iso === value;
              const ouvert = c.iso != null && estJourOuvre(c.iso); // fermé le week-end
              return (
                <button
                  key={i} type="button" disabled={!ouvert}
                  title={c.iso && !ouvert ? "Fermé le week-end" : undefined}
                  onClick={() => { if (ouvert && c.iso) { onChange(c.iso); setOpen(false); } }}
                  style={{
                    height: 36, border: "none", borderRadius: 8, fontSize: 14, cursor: ouvert ? "pointer" : "default",
                    background: selected ? INK : "transparent",
                    color: selected ? "#fff" : !c.iso ? "transparent" : ouvert ? INK : MUTED,
                    opacity: c.iso && !ouvert ? 0.45 : 1,
                    fontWeight: selected ? 700 : 400,
                  }}
                >{c.label}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Sélecteur d'heure : créneaux de 30 min, bornés par les horaires d'ouverture du jour choisi. */
export function TimePicker({ value, onChange, date }: { value: string; onChange: (label: string) => void; date: string }) {
  const [open, setOpen] = useState(false);
  const options = date ? creneauxDde(date).map((t) => t.replace(":", "h")) : [];
  const actif = options.length > 0;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button" disabled={!actif} onClick={() => setOpen((o) => !o)}
        style={{ ...trigger, color: value ? INK : MUTED, cursor: actif ? "pointer" : "not-allowed", background: actif ? "#fff" : SOFT }}
      >
        <span>{value || (date ? "Sélectionner une heure" : "Choisissez d’abord une date")}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={actif ? INK : MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
      </button>
      {open && actif && (
        <div style={{ ...popover, padding: 8, width: 160, maxHeight: 260, overflowY: "auto" }}>
          {options.map((t) => {
            const selected = t === value;
            return (
              <button
                key={t} type="button" onClick={() => { onChange(t); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderRadius: 8,
                  background: selected ? INK : "transparent", color: selected ? "#fff" : INK, fontWeight: selected ? 700 : 400,
                  fontSize: 15, cursor: "pointer",
                }}
              >{t}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
