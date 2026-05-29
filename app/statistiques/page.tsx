"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const GREEN = "#16a34a";
const YELLOW = "#ca8a04";
const RED = "#dc2626";

type Bucket = { matin: number; midi: number; aprem: number; soir: number };
type Stats = {
  ok: true;
  funnel: { total: number; cancelled: number; present: number; noShow: number; signed: number; thinking: number; unsigned: number; ratePresence: number; rateSignature: number; rateGlobal: number; rateAnnulation: number };
  heuresRdv: Bucket;
  heuresRappels: Bucket;
  prospection: { total: number; convertis: number; nrp: number; rateConversion: number };
  commissionTotal: number;
};

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
        <span>{label}</span><span style={{ fontWeight: 700, color: NAVY }}>{value}</span>
      </div>
      <div style={{ background: "#f3f4f6", borderRadius: 6, height: 10, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%" }} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color = NAVY }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, textAlign: "center" }}>
      <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#9aa6b8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Stats() {
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/statistiques", { headers: authHeaders() });
        const d = await res.json();
        if (d.ok) setData(d);
        else setErr(d.error ?? "Erreur");
      } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Chargement…</div>;
  if (err) return <div style={{ padding: 20, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: RED }}>❌ {err}</div>;
  if (!data) return null;

  const { funnel, heuresRdv, heuresRappels, prospection, commissionTotal } = data;
  const maxRdv = Math.max(heuresRdv.matin, heuresRdv.midi, heuresRdv.aprem, heuresRdv.soir, 1);
  const maxRem = Math.max(heuresRappels.matin, heuresRappels.midi, heuresRappels.aprem, heuresRappels.soir, 1);

  return (
    <>
      {/* === Funnel conversion === */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Funnel conversion (12 derniers mois)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
          <Stat label="RDV pris" value={funnel.total} />
          <Stat label="Présents" value={funnel.present} sub={`${funnel.ratePresence}% présence`} />
          <Stat label="Signés" value={funnel.signed} sub={`${funnel.rateSignature}% des présents`} color={GREEN} />
          <Stat label="Conversion" value={`${funnel.rateGlobal}%`} sub="global signé / total" color={PINK} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          <Stat label="No-show" value={funnel.noShow} color={RED} />
          <Stat label="Annulés" value={funnel.cancelled} sub={`${funnel.rateAnnulation}% du total`} color={RED} />
          <Stat label="Réfléchit" value={funnel.thinking} color={YELLOW} />
          <Stat label="Pas signé" value={funnel.unsigned} color="#6b7280" />
        </div>
        <div style={{ marginTop: 16, padding: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, textAlign: "center" }}>
          <span style={{ fontSize: 13, color: "#166534" }}>Commission cumulée signés : </span>
          <strong style={{ fontSize: 18, color: GREEN }}>{eur(commissionTotal)}</strong>
        </div>
      </div>

      {/* === Horaires RDV === */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Quand les clients prennent-ils RDV ?</div>
        <Bar label="🌅 Matin (avant 12h)" value={heuresRdv.matin} max={maxRdv} color={NAVY} />
        <Bar label="🍽️ Midi (12h-14h)" value={heuresRdv.midi} max={maxRdv} color={YELLOW} />
        <Bar label="🌆 Après-midi (14h-18h)" value={heuresRdv.aprem} max={maxRdv} color={PINK} />
        <Bar label="🌙 Soir (après 18h)" value={heuresRdv.soir} max={maxRdv} color="#6366f1" />
      </div>

      {/* === Horaires rappels === */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>À quelle heure rappeler ?</div>
        <Bar label="🌅 Matin (avant 12h)" value={heuresRappels.matin} max={maxRem} color={NAVY} />
        <Bar label="🍽️ Midi (12h-14h)" value={heuresRappels.midi} max={maxRem} color={YELLOW} />
        <Bar label="🌆 Après-midi (14h-18h)" value={heuresRappels.aprem} max={maxRem} color={PINK} />
        <Bar label="🌙 Soir (après 18h)" value={heuresRappels.soir} max={maxRem} color="#6366f1" />
      </div>

      {/* === Prospection NRP === */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Prospection</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          <Stat label="Leads totaux" value={prospection.total} />
          <Stat label="Convertis (rappels)" value={prospection.convertis} sub={`${prospection.rateConversion}%`} color={GREEN} />
          <Stat label="NRP (ne répondent pas)" value={prospection.nrp} color={RED} />
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Shell active="statistiques">
      <Stats />
    </Shell>
  );
}
