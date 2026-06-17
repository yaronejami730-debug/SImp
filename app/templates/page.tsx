"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const GREEN = "#16a34a";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

type TplMeta = { key: string; channel: "email" | "sms"; label: string; group: string; when: string; used: boolean; count: number; lastUsed: string | null };
type Preview = { key: string; channel: "email" | "sms"; label: string; when: string; subject?: string; html?: string; text?: string };

const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

export default function Page() {
  return (
    <Shell active="templates">
      <Templates />
    </Shell>
  );
}

function Templates() {
  const [list, setList] = useState<TplMeta[]>([]);
  const [sel, setSel] = useState<TplMeta | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/templates", { headers: authHeaders() });
        const d = await res.json();
        if (d.ok) { setList(d.templates); if (d.templates[0]) setSel(d.templates[0]); }
        else setErr(d.error ?? "Erreur");
      } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
      finally { setLoadingList(false); }
    })();
  }, []);

  useEffect(() => {
    if (!sel) return;
    let alive = true;
    setLoadingPrev(true);
    (async () => {
      try {
        const res = await fetch(`/api/templates?key=${encodeURIComponent(sel.key)}&channel=${sel.channel}`, { headers: authHeaders() });
        const d = await res.json();
        if (alive && d.ok) setPreview(d);
      } finally { if (alive) setLoadingPrev(false); }
    })();
    return () => { alive = false; };
  }, [sel]);

  if (loadingList) return <div style={{ textAlign: "center", padding: 40, color: MUTED }}>Chargement…</div>;
  if (err) return <div style={{ padding: 20, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#dc2626" }}>❌ {err}</div>;

  const groups: { name: string; items: TplMeta[] }[] = [];
  for (const t of list) {
    let g = groups.find((x) => x.name === t.group);
    if (!g) { g = { name: t.group, items: [] }; groups.push(g); }
    g.items.push(t);
  }
  const usedCount = list.filter((t) => t.used).length;

  return (
    <>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Templates — mails &amp; SMS</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>{list.length} modèles · {usedCount} déjà utilisés. Quand &amp; pourquoi chaque message part.</p>
      </header>

      {/* Sélecteur groupé */}
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        {groups.map((g) => (
          <div key={g.name} style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 12, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{g.name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {g.items.map((t) => {
                const on = sel?.key === t.key && sel?.channel === t.channel;
                return (
                  <button key={`${t.key}-${t.channel}`} onClick={() => setSel(t)}
                    style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: "7px 11px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 6,
                      border: `1px solid ${on ? NAVY : LINE}`, background: on ? NAVY : "#fff", color: on ? "#fff" : MUTED }}>
                    <span>{t.channel === "sms" ? "📱" : "📧"}</span>
                    {t.label}
                    <span title={t.used ? `Utilisé ${t.count}×` : "Jamais utilisé"} style={{ width: 7, height: 7, borderRadius: 4, background: t.used ? GREEN : "#cbd5e1" }} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Aperçu */}
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, opacity: loadingPrev ? 0.5 : 1, transition: "opacity .15s" }}>
        {preview && sel ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.5 }}>{sel.channel === "sms" ? "📱 SMS" : "📧 Mail"}</div>
            <h2 style={{ margin: "4px 0 8px", fontSize: 18, fontWeight: 700, color: NAVY }}>{preview.subject || sel.label}</h2>

            {/* Quand / pourquoi */}
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 9, padding: "10px 12px", fontSize: 13, color: "#9a3412", marginBottom: 10 }}>
              <strong>Quand &amp; pourquoi : </strong>{preview.when}
            </div>

            {/* Usage */}
            <div style={{ marginBottom: 12, fontSize: 13 }}>
              {sel.used
                ? <span style={{ color: GREEN, fontWeight: 600 }}>✅ Déjà utilisé {sel.count}× {sel.lastUsed ? `· dernier : ${fmt(sel.lastUsed)}` : ""}</span>
                : <span style={{ color: "#9aa6b8", fontWeight: 600 }}>⚠️ Jamais utilisé pour l&apos;instant</span>}
            </div>

            {/* Contenu */}
            {sel.channel === "sms" ? (
              <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 12, padding: 14, fontSize: 14, color: "#064e3b", whiteSpace: "pre-wrap", maxWidth: 380 }}>{preview.text}</div>
            ) : (
              <iframe title="aperçu" srcDoc={preview.html} style={{ width: "100%", height: 600, border: `1px solid ${LINE}`, borderRadius: 10, background: "#fff" }} />
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 30, color: MUTED }}>Sélectionnez un template…</div>
        )}
      </div>
    </>
  );
}
