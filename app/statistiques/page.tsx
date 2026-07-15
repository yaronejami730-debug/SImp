"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

// ── Palette sobre ──
const NAVY = "var(--brand-dark)";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const LINE = "#e8ebef";
const SURFACE = "#f8fafc";
const PINK = "var(--brand-primary)";
const GREEN = "#16a34a";
const RED = "#dc2626";

type Stats = {
  ok: true;
  from: string;
  to: string;
  total: number;
  signed: number;
  rateSignature: number;
  // Commercial-only fields
  commission?: number;
  commissionFixe?: number;
  commissionVariable?: number;
  margeCC?: number;
  margeCCCount?: number;
  accordsByKind?: Record<string, number>;
  negoTotal?: number;
  scheme?: { base: number; pct: number };
  signedList?: { firstName: string; lastName: string; car: string; commercial: string; date: string | null }[];
  // Responsable/Gestionnaire fields
  byCommercial?: { name: string; email?: string; signed: number; total: number; totalOwed?: number; callCenterPortion?: number; beneficiaryPortion?: number }[];
  // For debugging/layout
  viewerRole?: "commercial" | "responsable" | "gestionnaire" | "admin";
};

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const fmtFr = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const WD_FR = ["L", "M", "M", "J", "V", "S", "D"];
// Bornes (1er → dernier jour) d'un mois donné.
const monthRange = (y: number, m: number) => ({ from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) });

// ── Calendrier custom (popup) ────────────────────────────
function DatePop({ value, onChange, min, max }: { value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => { const [y, m] = value.split("-").map(Number); return new Date(y, m - 1, 1); });
  useEffect(() => { const [y, m] = value.split("-").map(Number); setView(new Date(y, m - 1, 1)); }, [value]);

  const y = view.getFullYear(), m = view.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Lundi = 0
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  const inBounds = (d: number) => { const s = ymd(new Date(y, m, d)); return (!min || s >= min) && (!max || s <= max); };

  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${open ? PINK : LINE}`, background: "#fff", color: NAVY, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
        {fmtFr(value)} <span style={{ color: FAINT, fontSize: 11 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 41, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(16,24,40,.14)", padding: 12, width: 252 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <button type="button" onClick={() => setView(new Date(y, m - 1, 1))} style={navBtn}>‹</button>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>{MONTHS_FR[m]} {y}</span>
              <button type="button" onClick={() => setView(new Date(y, m + 1, 1))} style={navBtn}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
              {WD_FR.map((w, i) => <div key={i} style={{ textAlign: "center", fontSize: 11, color: FAINT, fontWeight: 600, padding: "2px 0" }}>{w}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
              {cells.map((d, i) => {
                if (d == null) return <div key={i} />;
                const s = ymd(new Date(y, m, d));
                const sel = s === value;
                const ok = inBounds(d);
                return (
                  <button key={i} type="button" disabled={!ok}
                    onClick={() => { onChange(s); setOpen(false); }}
                    style={{ aspectRatio: "1", borderRadius: 7, border: "none", cursor: ok ? "pointer" : "default",
                      background: sel ? PINK : "transparent", color: sel ? "#fff" : ok ? NAVY : "#cbd5e1",
                      fontSize: 13, fontWeight: sel ? 700 : 500, fontFamily: "inherit" }}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
const navBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 7, border: `1px solid ${LINE}`, background: "#fff", color: NAVY, fontSize: 16, cursor: "pointer", lineHeight: 1 };

// ── Boutons mois rapides (mois précédent / courant / suivant) ──
function MonthPresets({ from, to, onRange }: { from: string; to: string; onRange: (f: string, t: string) => void }) {
  const now = new Date();
  const months = [-1, 0, 1].map((off) => {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {months.map(({ y, m }) => {
        const r = monthRange(y, m);
        const active = from === r.from && to === r.to;
        return (
          <button key={`${y}-${m}`} type="button" onClick={() => onRange(r.from, r.to)}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: `1.5px solid ${active ? PINK : LINE}`, background: active ? PINK : "#fff", color: active ? "#fff" : NAVY }}>
            {MONTHS_FR[m]}{y !== now.getFullYear() ? ` ${y}` : ""}
          </button>
        );
      })}
    </div>
  );
}

// Anneau de progression (taux de signature).
function Gauge({ value, sub }: { value: number; sub: string }) {
  const size = 168, stroke = 14;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(value, 100));
  const off = c * (1 - pct / 100);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef1f4" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={PINK} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontFamily="'Cabin',sans-serif" fontSize={40} fontWeight={700} fill={NAVY}>{pct}%</text>
      </svg>
      <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function StatsView({ data, from, to, onRange, busy }: {
  data: Stats; from: string; to: string;
  onRange: (from: string, to: string) => void; busy: boolean;
}) {
  const isCommercial = !data.byCommercial || data.commission !== undefined;
  const isGestionnaire = data.viewerRole === "gestionnaire";

  return (
    <div style={{ opacity: busy ? 0.55 : 1, transition: "opacity .15s", display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>
              {isCommercial ? "Mes paiements" : isGestionnaire ? "Rémunérations (vue complète)" : "Rémunérations"}
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Du {fmtFr(data.from)} au {fmtFr(data.to)}</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: MUTED }}>Du</span>
            <DatePop value={from} max={to} onChange={(v) => onRange(v, to)} />
            <span style={{ fontSize: 13, color: MUTED }}>au</span>
            <DatePop value={to} min={from} onChange={(v) => onRange(from, v)} />
          </div>
        </div>
        <MonthPresets from={from} to={to} onRange={onRange} />
      </header>

      {/* === COMMERCIAL VIEW === */}
      {isCommercial && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
            {/* Taux de signature */}
            <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 22 }}>
              <h2 style={{ margin: "0 0 16px", fontFamily: "'Cabin',sans-serif", fontSize: 14, fontWeight: 700, color: NAVY }}>Taux de signature</h2>
              <Gauge value={data.rateSignature} sub={`${data.signed} signés sur ${data.total} RDV`} />
            </section>

            {/* Ma commission (TOTAL ONLY, pas de répartition) */}
            <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 22, display: "flex", flexDirection: "column" }}>
              <h2 style={{ margin: "0 0 16px", fontFamily: "'Cabin',sans-serif", fontSize: 14, fontWeight: 700, color: NAVY }}>Ma commission</h2>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
                <div>
                  <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 48, fontWeight: 700, color: GREEN, lineHeight: 1 }}>{eur(data.commission!)}</div>
                  <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>sur {data.signed} RDV signé{data.signed > 1 ? "s" : ""}</div>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", background: SURFACE, borderRadius: 8, padding: "10px 12px" }}>
                    <span style={{ fontSize: 13, color: MUTED }}>Fixe · {data.scheme!.base} € × {data.signed} signé{data.signed > 1 ? "s" : ""}</span>
                    <strong style={{ fontSize: 15, color: NAVY }}>{eur(data.commissionFixe!)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", background: SURFACE, borderRadius: 8, padding: "10px 12px" }}>
                    <span style={{ fontSize: 13, color: MUTED }}>{data.scheme!.pct}% de la négo{data.negoTotal! > 0 ? ` (${eur(data.negoTotal!)})` : ""}</span>
                    <strong style={{ fontSize: 15, color: NAVY }}>{eur(data.commissionVariable!)}</strong>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Clients signés */}
          <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 22 }}>
            <h2 style={{ margin: "0 0 4px", fontFamily: "'Cabin',sans-serif", fontSize: 14, fontWeight: 700, color: NAVY }}>Clients signés</h2>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: FAINT }}>Qui a signé sur la période</p>
            {(data.signedList ?? []).length === 0 ? (
              <div style={{ fontSize: 13, color: MUTED }}>Aucune signature sur la période.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {data.signedList!.map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: SURFACE, borderRadius: 8, padding: "10px 14px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>
                      {c.firstName} {c.lastName}
                      {c.car && <span style={{ fontWeight: 400, color: MUTED }}> · {c.car}</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: MUTED }}>{c.commercial && <>signé avec <strong style={{ color: NAVY }}>{c.commercial}</strong></>}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* === RESPONSABLE / GESTIONNAIRE VIEW === */}
      {!isCommercial && (
        <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 22 }}>
          <h2 style={{ margin: "0 0 16px", fontFamily: "'Cabin',sans-serif", fontSize: 14, fontWeight: 700, color: NAVY }}>
            {isGestionnaire ? "Commerciaux & Répartition" : "Rémunération des commerciaux"}
          </h2>
          {(data.byCommercial ?? []).length === 0 ? (
            <div style={{ fontSize: 13, color: MUTED }}>Aucun RDV sur la période.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${LINE}` }}>
                    <th style={{ textAlign: "left", padding: "12px 8px", fontSize: 13, fontWeight: 600, color: NAVY }}>Commercial</th>
                    <th style={{ textAlign: "center", padding: "12px 8px", fontSize: 13, fontWeight: 600, color: NAVY }}>Signés</th>
                    <th style={{ textAlign: "center", padding: "12px 8px", fontSize: 13, fontWeight: 600, color: NAVY }}>Total RDV</th>
                    <th style={{ textAlign: "right", padding: "12px 8px", fontSize: 13, fontWeight: 600, color: NAVY }}>À payer</th>
                    {isGestionnaire && (
                      <>
                        <th style={{ textAlign: "right", padding: "12px 8px", fontSize: 13, fontWeight: 600, color: NAVY }}>CC (share %)</th>
                        <th style={{ textAlign: "right", padding: "12px 8px", fontSize: 13, fontWeight: 600, color: NAVY }}>Gestionnaire</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(data.byCommercial ?? []).map((c, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${LINE}` }}>
                      <td style={{ padding: "12px 8px", fontSize: 14, color: NAVY, fontWeight: 500 }}>{c.name}</td>
                      <td style={{ padding: "12px 8px", textAlign: "center", fontSize: 14, color: GREEN, fontWeight: 600 }}>{c.signed}</td>
                      <td style={{ padding: "12px 8px", textAlign: "center", fontSize: 13, color: MUTED }}>{c.total}</td>
                      <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 14, fontWeight: 600, color: NAVY }}>{eur(c.totalOwed ?? 0)}</td>
                      {isGestionnaire && (
                        <>
                          <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 14, color: "#6366f1", fontWeight: 600 }}>{eur(c.callCenterPortion ?? 0)}</td>
                          <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 14, color: "#f59e0b", fontWeight: 600 }}>{eur(c.beneficiaryPortion ?? 0)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Stats() {
  // Défaut : mois en cours -> aujourd'hui.
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(ymd(now));
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    (async () => {
      try {
        const res = await fetch(`/api/statistiques?from=${from}&to=${to}`, { headers: authHeaders() });
        const d = await res.json();
        if (!alive) return;
        if (d.ok) { setData(d); setErr(""); }
        else setErr(d.error ?? "Erreur");
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Erreur");
      } finally {
        if (alive) { setLoading(false); setBusy(false); }
      }
    })();
    return () => { alive = false; };
  }, [from, to]);

  function onRange(f: string, t: string) {
    if (f) setFrom(f);
    if (t) setTo(t);
  }

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: MUTED }}>Chargement…</div>;
  if (err && !data) return <div style={{ padding: 20, background: "#fef2f2", border: `1px solid #fecaca`, borderRadius: 10, color: RED }}>{err}</div>;
  if (!data) return null;

  return <StatsView data={data} from={from} to={to} onRange={onRange} busy={busy} />;
}

export default function Page() {
  return (
    <Shell active="statistiques">
      <Stats />
    </Shell>
  );
}
