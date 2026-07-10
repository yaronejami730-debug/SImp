"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";

type Review = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  vehicle: string;
  rating: number;
  q_accueil: string;
  q_recommande: string;
  commentaire: string;
  created_at: string;
};

const stars = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

function AvisAdmin() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [count, setCount] = useState(0);
  const [avg, setAvg] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/reviews", { headers: authHeaders() });
      const d = await r.json();
      if (d.ok) { setReviews(d.reviews); setCount(d.count); setAvg(d.avg); }
      else setErr(d.error ?? "Erreur");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
  const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 12 };

  return (
    <>
      <h1 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 22, color: NAVY, textTransform: "uppercase", margin: "0 0 6px" }}>⭐ Avis clients</h1>

      {!loading && !err && (
        <div style={{ ...card, display: "flex", gap: 24, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#9aa6b8", textTransform: "uppercase", fontWeight: 700 }}>Note moyenne</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: NAVY }}>{avg.toFixed(1)}<span style={{ fontSize: 16, color: "#9aa6b8" }}>/5</span></div>
            <div style={{ color: "#facc15", fontSize: 20, letterSpacing: 2 }}>{stars(Math.round(avg))}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#9aa6b8", textTransform: "uppercase", fontWeight: 700 }}>Avis reçus</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: NAVY }}>{count}</div>
          </div>
        </div>
      )}

      {loading && <p style={{ color: "#6b7280" }}>Chargement…</p>}
      {err && <p style={{ color: "#dc2626" }}>❌ {err}</p>}
      {!loading && !err && reviews.length === 0 && (
        <p style={{ color: "#9aa6b8", textAlign: "center", padding: 24, background: "#fff", border: "1px solid #f0f1f3", borderRadius: 10, fontStyle: "italic" }}>Aucun avis pour le moment.</p>
      )}

      {reviews.map((r) => {
        const name = `${r.first_name} ${r.last_name}`.trim();
        return (
          <div key={r.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <div style={{ color: "#facc15", fontSize: 20, letterSpacing: 2 }}>{stars(r.rating)} <span style={{ color: NAVY, fontSize: 14, fontWeight: 700 }}>{r.rating}/5</span></div>
              <div style={{ fontSize: 12, color: "#9aa6b8" }}>{fmt(r.created_at)}</div>
            </div>
            <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: NAVY }}>
              {name || <span style={{ color: "#9aa6b8", fontStyle: "italic", fontWeight: 400 }}>Anonyme</span>}
              {r.email && <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 13 }}> · {r.email}</span>}
            </div>
            {r.vehicle && <div style={{ marginTop: 2, fontSize: 13, color: NAVY }}>🚗 {r.vehicle}</div>}
            <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#6b7280" }}>
              {r.q_accueil && <span><b style={{ color: NAVY }}>Accueil :</b> {r.q_accueil}</span>}
              {r.q_recommande && <span><b style={{ color: NAVY }}>Recommande :</b> {r.q_recommande}</span>}
            </div>
            {r.commentaire && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#fafbfc", border: "1px solid #f0f1f3", fontSize: 14, color: "#232323", whiteSpace: "pre-wrap" }}>
                « {r.commentaire} »
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export default function Page() {
  return <Shell active="avis-admin"><AvisAdmin /></Shell>;
}
