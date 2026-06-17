"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const GREEN = "#16a34a";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

type Hesitant = { email: string; type: string; sentAt: string; opened: boolean; clicked: boolean; eventsKnown: boolean };

const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
const typeLabel = (t: string) => (t === "booking_confirm" ? "Créneau imposé" : "Choix du créneau");

function Dot({ on, known, label }: { on: boolean; known: boolean; label: string }) {
  const color = !known ? "#cbd5e1" : on ? GREEN : "#dc2626";
  const txt = !known ? "?" : on ? "✓" : "✗";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: MUTED }}>
      <span style={{ width: 18, height: 18, borderRadius: 9, background: `${color}22`, color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>{txt}</span>
      {label}
    </span>
  );
}

function Hesitants() {
  const [list, setList] = useState<Hesitant[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/hesitants", { headers: authHeaders() });
        const d = await r.json();
        if (d.ok) setList(d.hesitants);
        else setErr(d.error ?? "Erreur");
      } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: MUTED }}>Chargement…</div>;
  if (err) return <div style={{ padding: 20, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#dc2626" }}>❌ {err}</div>;

  return (
    <>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Clients hésitants 🤔</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Invités à prendre RDV mais pas encore réservé. Mail ouvert ? Lien cliqué ? ({list.length})</p>
      </header>

      {list.length === 0 ? (
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 30, textAlign: "center", color: MUTED }}>
          🎉 Aucun hésitant — tous les invités ont réservé (ou aucune invitation envoyée).
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {list.map((h, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 11, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, wordBreak: "break-all" }}>{h.email}</div>
                  <div style={{ fontSize: 11.5, color: "#9aa6b8", marginTop: 2 }}>{typeLabel(h.type)} · invité le {fmt(h.sentAt)}</div>
                </div>
                <a href={`mailto:${h.email}`} style={{ fontSize: 12, color: PINK, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>✉️ Relancer</a>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                <Dot on={h.opened} known={h.eventsKnown} label="Mail ouvert" />
                <Dot on={h.clicked} known={h.eventsKnown} label="Lien cliqué" />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Shell active="hesitants">
      <Hesitants />
    </Shell>
  );
}
