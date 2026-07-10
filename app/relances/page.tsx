"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

type Group = { clientName: string; email: string; phone: string; count: number; lastSent: string; types: string[] };

const TYPE_LABEL: Record<string, { txt: string; color: string }> = {
  noshow: { txt: "Absent (no-show)", color: "#dc2626" },
  cancel: { txt: "Annulation", color: "#ea580c" },
  thinking: { txt: "Réfléchit", color: "#ca8a04" },
  unsigned: { txt: "Pas signé", color: "#6b7280" },
};
function typeChip(t: string) {
  // t = "noshow" | "followup_cancel_1" ...
  if (t === "noshow") return TYPE_LABEL.noshow;
  const m = t.match(/^followup_([a-z]+)_/);
  return (m && TYPE_LABEL[m[1]]) || { txt: t, color: MUTED };
}
const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

function Relances() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [tot, setTot] = useState({ clients: 0, mails: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/relances", { headers: authHeaders() });
        const d = await r.json();
        if (d.ok) { setGroups(d.groups); setTot({ clients: d.totalClients, mails: d.totalMails }); }
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
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Relances envoyées</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Qui a reçu quels mails de relance (absent, annulation, réflexion, pas signé). {tot.mails} mails · {tot.clients} clients.</p>
      </header>

      {groups.length === 0 ? (
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 30, textAlign: "center", color: MUTED }}>
          Aucune relance envoyée pour le moment.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {groups.map((g, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 11, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{g.clientName}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2, wordBreak: "break-all" }}>{g.email || g.phone || "—"}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 22, fontWeight: 700, color: PINK }}>{g.count}</div>
                  <div style={{ fontSize: 10.5, color: MUTED, textTransform: "uppercase" }}>mail{g.count > 1 ? "s" : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" }}>
                {Array.from(new Set(g.types.map((t) => typeChip(t).txt))).map((txt) => {
                  const conf = g.types.map(typeChip).find((c) => c.txt === txt)!;
                  return <span key={txt} style={{ fontSize: 11, fontWeight: 600, color: conf.color, background: `${conf.color}1a`, padding: "2px 8px", borderRadius: 6 }}>{txt}</span>;
                })}
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#9aa6b8" }}>dernier : {fmt(g.lastSent)}</span>
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
    <Shell active="relances">
      <Relances />
    </Shell>
  );
}
