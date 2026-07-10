"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/client";

const NAVY = "var(--brand-dark)";
const GREEN = "#16a34a";

type Conn = { gmail: string; connected_at: string; last_sync_at: string | null; sync_state: string } | null;

function ago(iso: string | null): string {
  if (!iso) return "jamais";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `il y a ${s}s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `le ${new Date(iso).toLocaleDateString("fr-FR")}`;
}

export default function GoogleCalendarCard() {
  const [conn, setConn] = useState<Conn>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/google/status", { headers: authHeaders() });
      const d = await r.json();
      if (d.ok) setConn(d.connection);
    } finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("google");
      if (p === "connected") { setFlash("🟢 Google Agenda connecté."); window.history.replaceState({}, "", window.location.pathname); }
      else if (p === "error") { setFlash("❌ Échec de la connexion Google. Réessaie."); window.history.replaceState({}, "", window.location.pathname); }
    }
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const r = await fetch("/api/google/connect", { headers: authHeaders() });
      const d = await r.json();
      if (d.ok && d.url) window.location.href = d.url;
      else { setFlash(d.error ?? "Erreur"); setBusy(false); }
    } catch { setBusy(false); }
  }
  async function syncNow() {
    setBusy(true); setFlash("Synchronisation en cours…");
    try {
      const r = await fetch("/api/google/sync", { method: "POST", headers: authHeaders() });
      const d = await r.json();
      if (d.ok) {
        const parts = [
          d.pushed ? `${d.pushed} ajouté(s)` : "",
          d.updated ? `${d.updated} mis à jour` : "",
          d.pulledBack ? `${d.pulledBack} horaire(s) rapatrié(s) depuis Google` : "",
          d.removed ? `${d.removed} annulé(s) retiré(s)` : "",
        ].filter(Boolean);
        setFlash(`✅ Synchronisé : ${parts.length ? parts.join(" · ") : "déjà à jour"}${d.errors?.length ? ` · ⚠️ ${d.errors.length} erreur(s)` : ""}`);
        load();
      } else setFlash(`❌ ${d.error ?? "Erreur"}`);
    } catch { setFlash("❌ Erreur réseau"); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!confirm("Déconnecter ton Google Agenda ?")) return;
    setBusy(true);
    try {
      await fetch("/api/google/status", { method: "DELETE", headers: authHeaders() });
      setConn(null); setFlash("Google Agenda déconnecté.");
    } finally { setBusy(false); }
  }

  const connected = !!conn && conn.sync_state === "connected";
  const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", border: "none" };

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 16, fontWeight: 700, color: NAVY }}>📅 Google Agenda</h2>
          {loading ? (
            <div style={{ fontSize: 13, color: "#9aa6b8", marginTop: 6 }}>…</div>
          ) : connected ? (
            <div style={{ fontSize: 13, color: "#475569", marginTop: 6, lineHeight: 1.7 }}>
              <div><span style={{ color: GREEN, fontWeight: 700 }}>🟢 Connecté</span></div>
              <div>Compte : <strong>{conn!.gmail}</strong></div>
              <div>Dernière synchro : {ago(conn!.last_sync_at)}</div>
              <div>Mode : Bidirectionnelle (bouton Synchroniser)</div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>⚪ Non connecté — connecte ton agenda pour recevoir tes RDV automatiquement.</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {connected ? (
            <>
              <button onClick={syncNow} disabled={busy} style={{ ...btn, background: NAVY, color: "#fff" }}>{busy ? "…" : "🔄 Synchroniser maintenant"}</button>
              <button onClick={disconnect} disabled={busy} style={{ ...btn, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca" }}>Déconnecter</button>
            </>
          ) : (
            <button onClick={connect} disabled={busy} style={{ ...btn, background: NAVY, color: "#fff" }}>{busy ? "…" : "Se connecter avec Google"}</button>
          )}
        </div>
      </div>
      {flash && <div style={{ marginTop: 10, fontSize: 13, color: "#334155" }}>{flash}</div>}
    </div>
  );
}
