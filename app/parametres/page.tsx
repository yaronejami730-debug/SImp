"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";

type Weekly = Record<string, [string, string][]>;
type TimeOff = { id: number; start_date: string; end_date: string; label: string };
type Exc = { id: number; date: string; kind: "open" | "closed"; start_time: string; end_time: string };
type Booker = { email: string; name: string; callCenter: string | null; blocked: boolean };

const DAYS = [["1", "Lundi"], ["2", "Mardi"], ["3", "Mercredi"], ["4", "Jeudi"], ["5", "Vendredi"], ["6", "Samedi"], ["7", "Dimanche"]] as const;
const DUR = [20, 30, 40, 45, 60, 90];
const FREQ = [15, 20, 30, 40, 45, 60];
const BUF = [0, 10, 15, 20, 30, 45, 60];

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 14 };
const h2: React.CSSProperties = { margin: "0 0 4px", fontFamily: "'Cabin',sans-serif", fontSize: 15, fontWeight: 700, color: NAVY };
const hint: React.CSSProperties = { margin: "0 0 12px", fontSize: 12, color: "#94a3b8" };
const sel: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, background: "#fff" };
const tIn: React.CSSProperties = { padding: "7px 8px", borderRadius: 7, border: "1.5px solid #e5e7eb", fontSize: 13 };

function Parametres() {
  const [duration, setDuration] = useState(40);
  const [frequency, setFrequency] = useState(40);
  const [buffer, setBuffer] = useState(0);
  const [weekly, setWeekly] = useState<Weekly>({});
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [excs, setExcs] = useState<Exc[]>([]);
  const [bookers, setBookers] = useState<Booker[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState("");
  const [voStart, setVoStart] = useState(""); const [voEnd, setVoEnd] = useState(""); const [voLabel, setVoLabel] = useState("");
  const [exDate, setExDate] = useState(""); const [exKind, setExKind] = useState<"open" | "closed">("open");
  const [exStart, setExStart] = useState(""); const [exEnd, setExEnd] = useState("");

  async function load() {
    const r = await fetch("/api/settings", { headers: authHeaders() });
    const d = await r.json();
    if (d.ok) {
      setDuration(d.settings.slot_duration_min); setFrequency(d.settings.frequency_min); setBuffer(d.settings.buffer_min);
      setWeekly(d.settings.weekly ?? {}); setTimeOff(d.timeOff); setExcs(d.exceptions); setBookers(d.bookers ?? []);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function post(body: Record<string, unknown>, msg?: string) {
    const r = await fetch("/api/settings", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(body) });
    const d = await r.json();
    if (d.ok) { if (msg) setFlash(msg); load(); } else alert(d.error ?? "Erreur");
  }
  const saveAll = () => post({ action: "save", slotDurationMin: duration, frequencyMin: frequency, bufferMin: buffer, weekly }, "✅ Réglages enregistrés — les téléprospecteurs voient immédiatement tes nouveaux créneaux.");

  // Hebdo helpers
  const dayRanges = (d: string) => weekly[d] ?? [];
  const setDay = (d: string, ranges: [string, string][]) => setWeekly({ ...weekly, [d]: ranges });

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Chargement…</div>;

  return (
    <>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Paramètres</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Construis ton agenda : les téléprospecteurs ne verront que tes créneaux réellement disponibles.</p>
      </header>

      {/* Durée / fréquence / battement */}
      <div style={card}>
        <h2 style={h2}>⏱️ Rendez-vous</h2>
        <p style={hint}>Durée d&apos;un RDV, rythme d&apos;acceptation, et temps bloqué entre deux RDV.</p>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12.5, color: "#64748b" }}>Durée d&apos;un RDV<br />
            <select style={{ ...sel, marginTop: 4 }} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{DUR.map((v) => <option key={v} value={v}>{v >= 60 ? `${v / 60} h${v % 60 ? (v % 60) : ""}` : `${v} min`}</option>)}</select>
          </label>
          <label style={{ fontSize: 12.5, color: "#64748b" }}>Fréquence (un RDV toutes les…)<br />
            <select style={{ ...sel, marginTop: 4 }} value={frequency} onChange={(e) => setFrequency(Number(e.target.value))}>{FREQ.map((v) => <option key={v} value={v}>{v >= 60 ? `${v / 60} h` : `${v} min`}</option>)}</select>
          </label>
          <label style={{ fontSize: 12.5, color: "#64748b" }}>Temps de battement entre RDV<br />
            <select style={{ ...sel, marginTop: 4 }} value={buffer} onChange={(e) => setBuffer(Number(e.target.value))}>{BUF.map((v) => <option key={v} value={v}>{v === 0 ? "Aucun" : v >= 60 ? `${v / 60} h` : `${v} min`}</option>)}</select>
          </label>
        </div>
      </div>

      {/* Hebdo */}
      <div style={card}>
        <h2 style={h2}>📅 Disponibilités hebdomadaires</h2>
        <p style={hint}>Active tes jours et ajoute un ou plusieurs créneaux par journée (ex : 09:00–12:00 puis 14:00–18:00). Jour sans créneau = indisponible.</p>
        <div style={{ display: "grid", gap: 10 }}>
          {DAYS.map(([d, label]) => {
            const ranges = dayRanges(d);
            const on = ranges.length > 0;
            return (
              <div key={d} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", padding: "8px 10px", borderRadius: 8, background: on ? "#f8fafc" : "#fff", border: "1px solid #eef1f4" }}>
                <label style={{ width: 110, display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 600, color: on ? NAVY : "#94a3b8", cursor: "pointer" }}>
                  <input type="checkbox" checked={on} onChange={(e) => setDay(d, e.target.checked ? [["09:00", "12:00"]] : [])} /> {label}
                </label>
                {on && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {ranges.map((r, i) => (
                      <span key={i} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                        <input type="time" style={tIn} value={r[0]} onChange={(e) => { const n = [...ranges] as [string, string][]; n[i] = [e.target.value, n[i][1]]; setDay(d, n); }} />
                        <span style={{ color: "#94a3b8" }}>–</span>
                        <input type="time" style={tIn} value={r[1]} onChange={(e) => { const n = [...ranges] as [string, string][]; n[i] = [n[i][0], e.target.value]; setDay(d, n); }} />
                        <button onClick={() => setDay(d, ranges.filter((_, j) => j !== i))} style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}>✕</button>
                      </span>
                    ))}
                    <button onClick={() => setDay(d, [...ranges, ["14:00", "18:00"]])} style={{ border: "1.5px dashed #cbd5e1", background: "#fff", color: "#64748b", borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>+ créneau</button>
                  </div>
                )}
                {!on && <span style={{ fontSize: 12.5, color: "#94a3b8", alignSelf: "center" }}>Indisponible</span>}
              </div>
            );
          })}
        </div>
        <button onClick={saveAll} style={{ marginTop: 14, padding: "12px 18px", borderRadius: 9, border: "none", background: PINK, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>💾 Enregistrer mes disponibilités</button>
        {flash && <div style={{ marginTop: 10, fontSize: 13, color: "#166534" }}>{flash}</div>}
      </div>

      {/* Qui prend mes rendez-vous */}
      <div style={card}>
        <h2 style={h2}>📞 Qui prend mes rendez-vous</h2>
        <p style={hint}>Téléprospecteurs (call centers ou indépendants) autorisés à réserver dans ton agenda. Désactive quelqu&apos;un : il ne pourra plus te prendre de rendez-vous.</p>
        {bookers.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8" }}>Aucun téléprospecteur ne peut réserver pour toi actuellement.</div>}
        <div style={{ display: "grid", gap: 8 }}>
          {bookers.map((b) => (
            <div key={b.email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: b.blocked ? "#fef2f2" : "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: b.blocked ? "#94a3b8" : NAVY, textDecoration: b.blocked ? "line-through" : "none" }}>{b.name}</span>
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: b.callCenter ? "#eff6ff" : "#f0fdf4", color: b.callCenter ? "#1d4ed8" : "#15803d" }}>
                  {b.callCenter ? `📞 ${b.callCenter}` : "Téléprospecteur indépendant"}
                </span>
              </div>
              <button
                onClick={() => post({ action: "toggleBooker", booker: b.email, blocked: !b.blocked }, b.blocked ? `✅ ${b.name} réactivé.` : `⛔ ${b.name} désactivé — il ne peut plus te prendre de rendez-vous.`)}
                style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${b.blocked ? "#15803d" : "#fecaca"}`, background: "#fff", color: b.blocked ? "#15803d" : "#dc2626" }}>
                {b.blocked ? "Réactiver" : "Désactiver"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Vacances */}
      <div style={card}>
        <h2 style={h2}>🏖️ Vacances / périodes bloquées</h2>
        <p style={hint}>Aucun rendez-vous ne peut être pris pendant ces périodes.</p>
        {timeOff.map((t) => (
          <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: NAVY }}>Du <strong>{t.start_date.split("-").reverse().join("/")}</strong> au <strong>{t.end_date.split("-").reverse().join("/")}</strong>{t.label ? ` · ${t.label}` : ""}</span>
            <button onClick={() => post({ action: "removeTimeOff", id: t.id })} style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Supprimer</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          <input type="date" style={tIn} value={voStart} onChange={(e) => setVoStart(e.target.value)} />
          <span style={{ color: "#94a3b8", fontSize: 13 }}>au</span>
          <input type="date" style={tIn} value={voEnd} onChange={(e) => setVoEnd(e.target.value)} />
          <input style={{ ...tIn, width: 160 }} placeholder="Motif (optionnel)" value={voLabel} onChange={(e) => setVoLabel(e.target.value)} />
          <button disabled={!voStart || !voEnd} onClick={() => { post({ action: "addTimeOff", start: voStart, end: voEnd, label: voLabel }); setVoStart(""); setVoEnd(""); setVoLabel(""); }} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: NAVY, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>+ Ajouter</button>
        </div>
      </div>

      {/* Exceptions */}
      <div style={card}>
        <h2 style={h2}>⚡ Créneaux exceptionnels</h2>
        <p style={hint}>Ajoute ponctuellement un créneau (ex : exceptionnellement dispo 19:00–21:00) ou bloque une plage / une journée.</p>
        {excs.map((x) => (
          <div key={x.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: x.kind === "open" ? "#f0fdf4" : "#fef2f2", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: NAVY }}>
              {x.kind === "open" ? "✅ Dispo exceptionnelle" : "⛔ Indisponible"} le <strong>{x.date.split("-").reverse().join("/")}</strong>
              {x.start_time ? ` de ${x.start_time} à ${x.end_time}` : " (toute la journée)"}
            </span>
            <button onClick={() => post({ action: "removeException", id: x.id })} style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Supprimer</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          <input type="date" style={tIn} value={exDate} onChange={(e) => setExDate(e.target.value)} />
          <select style={sel} value={exKind} onChange={(e) => setExKind(e.target.value as "open" | "closed")}>
            <option value="open">✅ Dispo en plus</option>
            <option value="closed">⛔ Indisponible</option>
          </select>
          <input type="time" style={tIn} value={exStart} onChange={(e) => setExStart(e.target.value)} />
          <span style={{ color: "#94a3b8", fontSize: 13 }}>–</span>
          <input type="time" style={tIn} value={exEnd} onChange={(e) => setExEnd(e.target.value)} />
          <span style={{ fontSize: 11.5, color: "#94a3b8" }}>(vide = journée entière pour ⛔)</span>
          <button disabled={!exDate || (exKind === "open" && (!exStart || !exEnd))} onClick={() => { post({ action: "addException", date: exDate, kind: exKind, start: exStart, end: exEnd }); setExDate(""); setExStart(""); setExEnd(""); }} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: NAVY, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>+ Ajouter</button>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Shell active="parametres"><Parametres /></Shell>;
}
