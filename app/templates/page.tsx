"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const GREEN = "#16a34a";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

type TplMeta = { key: string; channel: "email" | "sms"; label: string; group: string; when: string; used: boolean; count: number; lastUsed: string | null; enabled: boolean };
type Preview = { key: string; channel: "email" | "sms"; label: string; when: string; subject?: string; html?: string; text?: string };

const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

export default function Page() {
  return (
    <Shell active="templates">
      <Templates />
    </Shell>
  );
}

function Toggle({ on, onClick, busy }: { on: boolean; onClick: () => void; busy: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} title={on ? "Activé — clic pour désactiver" : "Désactivé — clic pour activer"}
      style={{ width: 42, height: 24, borderRadius: 12, border: "none", cursor: busy ? "default" : "pointer", padding: 2, background: on ? GREEN : "#cbd5e1", transition: "background .15s", flexShrink: 0, opacity: busy ? 0.6 : 1 }}>
      <span style={{ display: "block", width: 20, height: 20, borderRadius: 10, background: "#fff", transform: on ? "translateX(18px)" : "translateX(0)", transition: "transform .15s" }} />
    </button>
  );
}

function Templates() {
  const [list, setList] = useState<TplMeta[]>([]);
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [sel, setSel] = useState<TplMeta | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [togglingKey, setTogglingKey] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/templates", { headers: authHeaders() });
        const d = await res.json();
        if (d.ok) setList(d.templates);
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

  async function toggle(t: TplMeta) {
    const next = !t.enabled;
    setTogglingKey(`${t.key}|${t.channel}`);
    // optimiste
    setList((l) => l.map((x) => (x.key === t.key && x.channel === t.channel ? { ...x, enabled: next } : x)));
    try {
      const r = await fetch("/api/templates", { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ key: t.key, channel: t.channel, enabled: next }) });
      const d = await r.json();
      if (!d.ok) { setList((l) => l.map((x) => (x.key === t.key && x.channel === t.channel ? { ...x, enabled: t.enabled } : x))); alert(d.error ?? "Erreur"); }
    } catch { setList((l) => l.map((x) => (x.key === t.key && x.channel === t.channel ? { ...x, enabled: t.enabled } : x))); }
    finally { setTogglingKey(""); }
  }

  if (loadingList) return <div style={{ textAlign: "center", padding: 40, color: MUTED }}>Chargement…</div>;
  if (err) return <div style={{ padding: 20, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#dc2626" }}>❌ {err}</div>;

  const chanList = list.filter((t) => t.channel === channel);
  const groups: { name: string; items: TplMeta[] }[] = [];
  for (const t of chanList) {
    let g = groups.find((x) => x.name === t.group);
    if (!g) { g = { name: t.group, items: [] }; groups.push(g); }
    g.items.push(t);
  }
  const nMail = list.filter((t) => t.channel === "email").length;
  const nSms = list.filter((t) => t.channel === "sms").length;
  const offCount = list.filter((t) => !t.enabled).length;

  return (
    <>
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Templates</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Active / désactive chaque message. Désactivé = il ne part pas. {offCount > 0 ? `${offCount} désactivé(s).` : "Tous actifs."}</p>
      </header>

      {/* Séparation Mailing / SMS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => { setChannel("email"); setSel(null); setPreview(null); }} style={{ flex: 1, padding: "11px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${channel === "email" ? NAVY : LINE}`, background: channel === "email" ? NAVY : "#fff", color: channel === "email" ? "#fff" : MUTED }}>📧 Mailing ({nMail})</button>
        <button onClick={() => { setChannel("sms"); setSel(null); setPreview(null); }} style={{ flex: 1, padding: "11px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${channel === "sms" ? NAVY : LINE}`, background: channel === "sms" ? NAVY : "#fff", color: channel === "sms" ? "#fff" : MUTED }}>📱 SMS ({nSms})</button>
      </div>

      {/* Liste avec toggles */}
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        {groups.map((g) => (
          <div key={g.name} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 12, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{g.name}</div>
            <div style={{ display: "grid", gap: 6 }}>
              {g.items.map((t) => {
                const on = sel?.key === t.key && sel?.channel === t.channel;
                return (
                  <div key={`${t.key}-${t.channel}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, border: `1px solid ${on ? NAVY : LINE}`, background: t.enabled ? "#fff" : "#f8fafc" }}>
                    <button onClick={() => setSel(t)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 4, background: t.used ? GREEN : "#cbd5e1", flexShrink: 0 }} title={t.used ? `Utilisé ${t.count}×` : "Jamais utilisé"} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: t.enabled ? NAVY : "#9aa6b8", textDecoration: t.enabled ? "none" : "line-through" }}>{t.label}</span>
                      </div>
                    </button>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.enabled ? GREEN : "#9aa6b8" }}>{t.enabled ? "ON" : "OFF"}</span>
                    <Toggle on={t.enabled} busy={togglingKey === `${t.key}|${t.channel}`} onClick={() => toggle(t)} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Aperçu */}
      {sel && (
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, opacity: loadingPrev ? 0.5 : 1, transition: "opacity .15s" }}>
          {preview ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.5 }}>{sel.channel === "sms" ? "📱 SMS" : "📧 Mail"}</div>
                  <h2 style={{ margin: "4px 0 8px", fontSize: 18, fontWeight: 700, color: NAVY }}>{preview.subject || sel.label}</h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: sel.enabled ? GREEN : "#9aa6b8" }}>{sel.enabled ? "Activé" : "Désactivé"}</span>
                  <Toggle on={sel.enabled} busy={togglingKey === `${sel.key}|${sel.channel}`} onClick={() => toggle(sel)} />
                </div>
              </div>

              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 9, padding: "10px 12px", fontSize: 13, color: "#9a3412", marginBottom: 10 }}>
                <strong>Quand &amp; pourquoi : </strong>{preview.when}
              </div>
              <div style={{ marginBottom: 12, fontSize: 13 }}>
                {sel.used
                  ? <span style={{ color: GREEN, fontWeight: 600 }}>✅ Déjà utilisé {sel.count}× {sel.lastUsed ? `· dernier : ${fmt(sel.lastUsed)}` : ""}</span>
                  : <span style={{ color: "#9aa6b8", fontWeight: 600 }}>⚠️ Jamais utilisé pour l&apos;instant</span>}
              </div>

              {sel.channel === "sms" ? (
                <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 12, padding: 14, fontSize: 14, color: "#064e3b", whiteSpace: "pre-wrap", maxWidth: 380 }}>{preview.text}</div>
              ) : (
                <iframe title="aperçu" srcDoc={preview.html} style={{ width: "100%", height: 600, border: `1px solid ${LINE}`, borderRadius: 10, background: "#fff" }} />
              )}
            </>
          ) : <div style={{ textAlign: "center", padding: 20, color: MUTED }}>…</div>}
        </div>
      )}
    </>
  );
}
