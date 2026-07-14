"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";

type Tx = { id: number; kind: string; sms_delta: number; email_delta: number; label: string; created_at: string };
type Pack = { id: number; name: string; sms_qty: number; email_qty: number; price_cents: number };

const eur = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 14 };

function Credits() {
  const [balance, setBalance] = useState({ sms: 0, email: 0 });
  const [conso, setConso] = useState({ sms: 0, email: 0 });
  const [txs, setTxs] = useState<Tx[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [stripeReady, setStripeReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  async function load() {
    const r = await fetch("/api/credits", { headers: authHeaders() });
    const d = await r.json();
    if (d.ok) { setBalance(d.balance); setConso(d.conso30); setTxs(d.transactions); setPacks(d.packs); setStripeReady(d.stripeReady); }
    setLoading(false);
  }
  useEffect(() => {
    load();
    const p = new URLSearchParams(window.location.search);
    if (p.get("paid")) { setFlash("✅ Paiement reçu — tes crédits arrivent (quelques secondes)."); window.history.replaceState({}, "", "/credits"); }
  }, []);

  async function buy(packId: number) {
    setBusy(true);
    try {
      const r = await fetch("/api/credits", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ action: "checkout", packId }) });
      const d = await r.json();
      if (d.ok && d.url) window.location.href = d.url;
      else setFlash(`ℹ️ ${d.error ?? "Erreur"}`);
    } finally { setBusy(false); }
  }

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Chargement…</div>;

  const estim = (bal: number, c30: number) => (c30 > 0 ? `≈ ${Math.floor(bal / (c30 / 30))} j restants` : "");

  return (
    <>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Crédits d&apos;envoi</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Le mode copier-coller reste 100 % gratuit. Les crédits servent uniquement aux envois automatiques (SMS/e-mails envoyés par le CRM).</p>
      </header>
      {flash && <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 13, color: "#166534" }}>{flash}</div>}

      {/* Soldes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 14 }}>
        <div style={{ ...card, marginBottom: 0, borderLeft: `3px solid ${PINK}` }}>
          <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 32, fontWeight: 700, color: NAVY }}>{balance.sms}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>crédits SMS · {conso.sms} utilisés / 30 j {estim(balance.sms, conso.sms)}</div>
        </div>
        <div style={{ ...card, marginBottom: 0, borderLeft: "3px solid #2563eb" }}>
          <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 32, fontWeight: 700, color: NAVY }}>{balance.email}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>crédits e-mail · {conso.email} utilisés / 30 j {estim(balance.email, conso.email)}</div>
        </div>
      </div>

      {/* Packs */}
      <div style={card}>
        <h2 style={{ margin: "0 0 12px", fontFamily: "'Cabin',sans-serif", fontSize: 15, fontWeight: 700, color: NAVY }}>💳 Acheter des crédits</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          {packs.map((p) => (
            <div key={p.id} style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>{p.name}</div>
              <div style={{ fontSize: 12.5, color: "#64748b" }}>{p.sms_qty.toLocaleString("fr-FR")} SMS<br />{p.email_qty.toLocaleString("fr-FR")} e-mails</div>
              <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 20, fontWeight: 700, color: NAVY }}>{eur(p.price_cents)}</div>
              <button onClick={() => buy(p.id)} disabled={busy} style={{ padding: "9px 12px", borderRadius: 8, border: "none", background: PINK, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Acheter</button>
            </div>
          ))}
        </div>
        {!stripeReady && <p style={{ margin: "10px 0 0", fontSize: 12, color: "#94a3b8" }}>ℹ️ Paiement en ligne en cours d&apos;activation — en attendant, l&apos;administrateur peut créditer ton compte.</p>}
      </div>

      {/* Historique */}
      <div style={card}>
        <h2 style={{ margin: "0 0 12px", fontFamily: "'Cabin',sans-serif", fontSize: 15, fontWeight: 700, color: NAVY }}>📜 Historique</h2>
        {txs.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8" }}>Aucune opération.</div>}
        <div style={{ display: "grid", gap: 5 }}>
          {txs.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, background: "#f8fafc", borderRadius: 8, padding: "8px 12px", fontSize: 12.5 }}>
              <span style={{ color: NAVY }}>
                {t.kind === "purchase" ? "💳 Achat" : t.kind === "grant" ? "🎁 Attribution" : t.kind === "consume" ? "📤 Envoi" : "↩︎ Remboursement"}
                {t.label ? ` · ${t.label}` : ""}
                <span style={{ color: "#94a3b8" }}> — {new Date(t.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
              </span>
              <span style={{ fontWeight: 700, color: t.sms_delta + t.email_delta >= 0 ? "#15803d" : "#dc2626" }}>
                {t.sms_delta !== 0 ? `${t.sms_delta > 0 ? "+" : ""}${t.sms_delta} SMS ` : ""}{t.email_delta !== 0 ? `${t.email_delta > 0 ? "+" : ""}${t.email_delta} email` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Shell active="credits"><Credits /></Shell>;
}
