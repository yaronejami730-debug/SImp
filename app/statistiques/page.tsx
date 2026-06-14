"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

// ── Palette ──────────────────────────────────────────────
const NAVY = "#1a273a";
const PINK = "#DB407A";
const GREEN = "#16a34a";
const YELLOW = "#ca8a04";
const RED = "#dc2626";
const INDIGO = "#6366f1";
const MUTED = "#6b7280";
const FAINT = "#9aa6b8";
const LINE = "#e5e7eb";

// ── Types (contrat API /api/statistiques) ────────────────
type Bucket = { matin: number; midi: number; aprem: number; soir: number };
type EvoPoint = { key: string; label: string; rdv: number; signed: number; commission: number };
type Funnel = {
  total: number; cancelled: number; present: number; noShow: number;
  signed: number; thinking: number; unsigned: number;
  ratePresence: number; rateSignature: number; rateGlobal: number; rateAnnulation: number;
};
type Prospection = { total: number; convertis: number; nrp: number; rateConversion: number };
type NrpStats = { distribution: { niveau: number; count: number }[]; totalContacts: number; totalAppels: number };
type Period = "7d" | "30d" | "3m" | "12m";
type Stats = {
  ok: true;
  period: Period;
  gran: "day" | "week" | "month";
  funnel: Funnel;
  evolution: EvoPoint[];
  heuresRdv: Bucket;
  heuresRappels: Bucket;
  prospection: Prospection;
  nrp: NrpStats;
  commissionTotal: number;
};

const PERIODS: { key: Period; label: string }[] = [
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
  { key: "3m", label: "3 mois" },
  { key: "12m", label: "12 mois" },
];
const PERIOD_LABEL: Record<Period, string> = { "7d": "7 derniers jours", "30d": "30 derniers jours", "3m": "3 derniers mois", "12m": "12 derniers mois" };

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// ── Briques UI ───────────────────────────────────────────
function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
      {title && (
        <h2 style={{ margin: "0 0 14px", fontFamily: "'Cabin',sans-serif", fontSize: 13, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.6 }}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function Stat({ label, value, sub, color = NAVY }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: 14, textAlign: "center" }}>
      <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 28, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 10 }}>{children}</div>;
}

// ── Graphe d'évolution (style Matomo) ────────────────────
const EVO_METRICS = [
  { key: "rdv" as const, label: "RDV pris", color: NAVY },
  { key: "signed" as const, label: "Signés", color: GREEN },
  { key: "commission" as const, label: "Commission", color: PINK },
];

function Evolution({ data, periodLabel }: { data: EvoPoint[]; periodLabel: string }) {
  const [metric, setMetric] = useState<"rdv" | "signed" | "commission">("rdv");
  const [hover, setHover] = useState<number | null>(null);
  const conf = EVO_METRICS.find((m) => m.key === metric)!;
  const vals = data.map((d) => d[metric]);
  const max = Math.max(...vals, 1);
  const total = vals.reduce((a, b) => a + b, 0);
  const W = 720, H = 180, padB = 26, padT = 10;
  const n = data.length || 1;
  const slot = W / n;
  const fmt = (v: number) => (metric === "commission" ? eur(v) : String(v));

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 13, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Évolution · {periodLabel}
        </h2>
        <div style={{ display: "flex", gap: 6 }}>
          {EVO_METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              style={{
                cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 7,
                border: `1px solid ${metric === m.key ? m.color : LINE}`,
                background: metric === m.key ? m.color : "#fff",
                color: metric === m.key ? "#fff" : MUTED,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
          {[0.25, 0.5, 0.75, 1].map((g) => {
            const y = padT + (H - padB - padT) * (1 - g);
            return <line key={g} x1={0} x2={W} y1={y} y2={y} stroke="#f3f4f6" strokeWidth={1} />;
          })}
          {data.map((d, i) => {
            const v = d[metric];
            const bh = (H - padB - padT) * (v / max);
            const bw = slot * 0.56;
            const x = i * slot + (slot - bw) / 2;
            const y = H - padB - bh;
            const on = hover === i;
            return (
              <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={i * slot} y={padT} width={slot} height={H - padB - padT} fill="transparent" />
                <rect x={x} y={y} width={bw} height={Math.max(bh, v > 0 ? 2 : 0)} rx={3} fill={conf.color} opacity={on ? 1 : 0.82} />
                <text x={i * slot + slot / 2} y={H - 9} textAnchor="middle" fontSize={11} fill={FAINT}>{d.label}</text>
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <div
            style={{
              position: "absolute", top: 0, left: `${((hover + 0.5) / n) * 100}%`, transform: "translateX(-50%)",
              background: NAVY, color: "#fff", fontSize: 12, padding: "5px 9px", borderRadius: 7, whiteSpace: "nowrap", pointerEvents: "none",
            }}
          >
            {data[hover].label} : <strong>{fmt(data[hover][metric])}</strong>
          </div>
        )}
      </div>

      <div style={{ textAlign: "right", fontSize: 12, color: MUTED, marginTop: 8 }}>
        Total {conf.label.toLowerCase()} : <strong style={{ color: conf.color }}>{fmt(total)}</strong>
      </div>
    </Card>
  );
}

// ── Sélecteur de période ─────────────────────────────────
function PeriodPicker({ value, onChange, busy }: { value: Period; onChange: (p: Period) => void; busy: boolean }) {
  return (
    <div style={{ display: "inline-flex", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 9, padding: 3, opacity: busy ? 0.6 : 1 }}>
      {PERIODS.map((p) => {
        const on = value === p.key;
        return (
          <button
            key={p.key}
            onClick={() => !busy && onChange(p.key)}
            disabled={busy}
            style={{
              cursor: busy ? "default" : "pointer", fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 7, border: "none",
              background: on ? NAVY : "transparent", color: on ? "#fff" : MUTED,
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Jauge circulaire (anneau de progression) ─────────────
function Gauge({ value, caption, color = PINK, size = 150 }: { value: number; caption: string; color?: string; size?: number }) {
  const stroke = 13;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(value, 100));
  const off = c * (1 - pct / 100);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f1f4" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
        <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fontFamily="'Cabin',sans-serif" fontSize={34} fontWeight={700} fill={NAVY}>{pct}%</text>
        <text x="50%" y="66%" textAnchor="middle" fontSize={11} fill={FAINT}>conversion</text>
      </svg>
      <div style={{ fontSize: 12.5, color: MUTED, marginTop: -4 }}>{caption}</div>
    </div>
  );
}

// ── Funnel visuel (entonnoir) ────────────────────────────
function VisualFunnel({ total, present, signed }: { total: number; present: number; signed: number }) {
  const steps = [
    { icon: "🚗", label: "RDV pris", value: total, color: NAVY },
    { icon: "🙋", label: "Présents", value: present, color: INDIGO },
    { icon: "✍️", label: "Signés", value: signed, color: GREEN },
  ];
  const max = Math.max(total, 1);
  return (
    <Card title="Le parcours client 🪜">
      {steps.map((s, i) => {
        const pct = Math.round((s.value / max) * 100);
        const prev = i > 0 ? steps[i - 1].value : null;
        const keepRate = prev != null && prev > 0 ? Math.round((s.value / prev) * 100) : null;
        return (
          <div key={s.label}>
            {keepRate != null && (
              <div style={{ textAlign: "center", fontSize: 11.5, color: keepRate >= 50 ? GREEN : YELLOW, margin: "2px 0" }}>
                ↓ {keepRate}% continuent
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 92, fontSize: 13, color: MUTED, flexShrink: 0 }}>
                <span style={{ marginRight: 5 }}>{s.icon}</span>{s.label}
              </div>
              <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 8, height: 30, overflow: "hidden" }}>
                <div style={{ width: `${Math.max(pct, 6)}%`, height: "100%", background: s.color, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 9, color: "#fff", fontWeight: 700, fontSize: 13.5 }}>
                  {s.value}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ── Horaires ludiques (badge sur le meilleur créneau) ────
const SLOTS: { key: keyof Bucket; label: string; icon: string; color: string }[] = [
  { key: "matin", label: "Matin", icon: "🌅", color: NAVY },
  { key: "midi", label: "Midi", icon: "🍽️", color: YELLOW },
  { key: "aprem", label: "Après-midi", icon: "🌆", color: PINK },
  { key: "soir", label: "Soir", icon: "🌙", color: INDIGO },
];

function HoraireLudique({ title, hint, data }: { title: string; hint: string; data: Bucket }) {
  const max = Math.max(data.matin, data.midi, data.aprem, data.soir, 1);
  const bestKey = SLOTS.reduce((b, s) => (data[s.key] > b.key_v ? { key: s.key, key_v: data[s.key] } : b), { key: "matin" as keyof Bucket, key_v: -1 }).key;
  const anyData = data.matin + data.midi + data.aprem + data.soir > 0;
  return (
    <Card title={title}>
      {SLOTS.map((s) => {
        const v = data[s.key];
        const pct = Math.round((v / max) * 100);
        const best = anyData && s.key === bestKey;
        return (
          <div key={s.key} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: MUTED, marginBottom: 4 }}>
              <span>{s.icon} {s.label} {best && <span style={{ marginLeft: 4 }}>🔥</span>}</span>
              <span style={{ fontWeight: 700, color: best ? s.color : NAVY }}>{v}</span>
            </div>
            <div style={{ background: "#f3f4f6", borderRadius: 6, height: 12, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: s.color, opacity: best ? 1 : 0.55, transition: "width .4s" }} />
            </div>
          </div>
        );
      })}
      {anyData && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: MUTED, textAlign: "center" }}>
          {hint} <strong style={{ color: NAVY }}>{SLOTS.find((s) => s.key === bestKey)!.icon} {SLOTS.find((s) => s.key === bestKey)!.label.toLowerCase()}</strong>
        </div>
      )}
    </Card>
  );
}

// ── Relances NRP (ne répond pas) ─────────────────────────
const NRP_LEVELS = [
  { label: "📵 NRP 1", color: "#f59e0b" },
  { label: "📵📵 NRP 2", color: "#ea580c" },
  { label: "📵📵📵 NRP 3+", color: RED },
];

function NrpCard({ data }: { data: NrpStats }) {
  const max = Math.max(...data.distribution.map((d) => d.count), 1);
  return (
    <Card title="Relances — ne répond pas 📵">
      {data.totalContacts === 0 ? (
        <div style={{ textAlign: "center", padding: "14px 0", fontSize: 13, color: MUTED }}>
          🎉 Aucune relance NRP sur la période — tout le monde décroche !
        </div>
      ) : (
        <>
          <Grid cols={2}>
            <Stat label="Contacts injoignables" value={`🙈 ${data.totalContacts}`} color={YELLOW} />
            <Stat label="Appels NRP passés" value={`☎️ ${data.totalAppels}`} color={RED} />
          </Grid>
          <div style={{ marginTop: 14 }}>
            {data.distribution.map((d, i) => {
              const conf = NRP_LEVELS[i];
              const pct = Math.round((d.count / max) * 100);
              return (
                <div key={d.niveau} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: MUTED, marginBottom: 4 }}>
                    <span>{conf.label}</span>
                    <span style={{ fontWeight: 700, color: conf.color }}>{d.count}</span>
                  </div>
                  <div style={{ background: "#f3f4f6", borderRadius: 6, height: 12, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: conf.color, transition: "width .4s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Contenu principal ────────────────────────────────────
function StatsView({ data, period, onPeriod, busy }: { data: Stats; period: Period; onPeriod: (p: Period) => void; busy: boolean }) {
  const { funnel, evolution, heuresRdv, heuresRappels, prospection, nrp, commissionTotal } = data;
  const periodLabel = PERIOD_LABEL[period];

  return (
    <div style={{ opacity: busy ? 0.55 : 1, transition: "opacity .15s" }}>
      {/* En-tête */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Statistiques</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Performance commerciale · {periodLabel}</p>
        </div>
        <PeriodPicker value={period} onChange={onPeriod} busy={busy} />
      </header>

      {/* Hero : jauge conversion + trophée commission */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", flexWrap: "wrap", gap: 18 }}>
          <Gauge value={funnel.rateGlobal} caption={`${funnel.signed} signés sur ${funnel.total} RDV`} />
          <div style={{ flex: 1, minWidth: 210, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff", borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 12.5, opacity: 0.9 }}>🏆 Commission cumulée</div>
              <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>{eur(commissionTotal)}</div>
            </div>
            <Grid cols={2}>
              <Stat label="RDV pris" value={`🚗 ${funnel.total}`} />
              <Stat label="Signés" value={`✍️ ${funnel.signed}`} color={GREEN} />
            </Grid>
          </div>
        </div>
      </Card>

      {/* Funnel visuel */}
      <VisualFunnel total={funnel.total} present={funnel.present} signed={funnel.signed} />

      {/* Pastilles secondaires */}
      <Card title="Et les autres ?">
        <Grid cols={3}>
          <Stat label="No-show" value={`🚫 ${funnel.noShow}`} color={RED} />
          <Stat label="Annulés" value={`❌ ${funnel.cancelled}`} sub={`${funnel.rateAnnulation}% du total`} color={RED} />
          <Stat label="Réfléchit" value={`🤔 ${funnel.thinking}`} color={YELLOW} />
        </Grid>
      </Card>

      {/* Évolution */}
      <Evolution data={evolution} periodLabel={periodLabel} />

      {/* Horaires */}
      <HoraireLudique title="Quand les clients prennent-ils RDV ? ⏰" hint="Pic de prise de RDV le" data={heuresRdv} />
      <HoraireLudique title="À quelle heure rappeler ? 📞" hint="Meilleur moment :" data={heuresRappels} />

      {/* Relances NRP */}
      <NrpCard data={nrp} />

      {/* Prospection */}
      <Card title="Prospection 🎯">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", flexWrap: "wrap", gap: 18 }}>
          <Gauge value={prospection.rateConversion} caption={`${prospection.convertis} convertis sur ${prospection.total} leads`} color={INDIGO} size={130} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <Grid cols={1}>
              <Stat label="Leads totaux" value={`📇 ${prospection.total}`} />
              <Stat label="Convertis (rappelés)" value={`✅ ${prospection.convertis}`} color={GREEN} />
              <Stat label="NRP — ne répondent pas" value={`📵 ${prospection.nrp}`} color={RED} />
            </Grid>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Chargement + états ───────────────────────────────────
function Stats() {
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true); // 1er chargement
  const [busy, setBusy] = useState(false);      // changement de période
  const [period, setPeriod] = useState<Period>("12m");

  useEffect(() => {
    let alive = true;
    setBusy(true);
    (async () => {
      try {
        const res = await fetch(`/api/statistiques?period=${period}`, { headers: authHeaders() });
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
  }, [period]);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: MUTED }}>Chargement…</div>;
  if (err && !data) return <div style={{ padding: 20, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: RED }}>❌ {err}</div>;
  if (!data) return null;

  return <StatsView data={data} period={period} onPeriod={setPeriod} busy={busy} />;
}

export default function Page() {
  return (
    <Shell active="statistiques">
      <Stats />
    </Shell>
  );
}
