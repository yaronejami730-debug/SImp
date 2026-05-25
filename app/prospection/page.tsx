"use client";

import { useEffect, useState } from "react";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const ACCENT = "#24B9D7";
const LOGO =
  "https://www.simplicicar.com/img/cms/Logo/Simplicicar-concession-automobile-France.jpg";

type Lead = { id: number; phone: string; listing_url: string; note: string | null; created_at: string };

const platformOf = (url: string) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.includes("leboncoin")) return "LeBonCoin";
    if (h.includes("lacentrale")) return "LaCentrale";
    if (h.includes("seloger")) return "SeLoger";
    return h;
  } catch {
    return "Lien";
  }
};

const inp: React.CSSProperties = {
  width: "100%", padding: 12, fontSize: 15, borderRadius: 8,
  border: "1.5px solid #e5e7eb", boxSizing: "border-box", fontFamily: "inherit",
};

export default function Prospection() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState("");
  const [phone, setPhone] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("dash_pin");
    if (saved) { setPin(saved); enter(saved); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchLeads(p: string, q: string) {
    const res = await fetch(`/api/leads?phone=${encodeURIComponent(q)}`, { headers: { "x-pin": p } });
    const d = await res.json();
    if (d.ok) { setLeads(d.leads); return true; }
    setErr(d.error ?? "Erreur"); return false;
  }

  async function enter(p: string) {
    setErr("");
    const ok = await fetchLeads(p, "").catch(() => false);
    if (ok) { setAuthed(true); localStorage.setItem("dash_pin", p); }
    else localStorage.removeItem("dash_pin");
  }

  useEffect(() => {
    if (!authed) return;
    const t = setTimeout(() => { fetchLeads(pin, search); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, authed]);

  async function add() {
    if (!phone.trim() || !url.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST", headers: { "content-type": "application/json", "x-pin": pin },
        body: JSON.stringify({ phone, listingUrl: url, note }),
      });
      const d = await res.json();
      if (d.ok) { setPhone(""); setUrl(""); setNote(""); fetchLeads(pin, search); }
      else alert(d.error ?? "Erreur");
    } finally { setAdding(false); }
  }

  async function del(id: number) {
    await fetch(`/api/leads?id=${id}`, { method: "DELETE", headers: { "x-pin": pin } });
    setLeads((l) => l.filter((x) => x.id !== id));
  }

  const wrap: React.CSSProperties = {
    minHeight: "100vh", background: "#eceef1",
    fontFamily: "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", color: "#232323", padding: "24px 16px",
  };

  if (!authed) {
    return (
      <main style={wrap}>
        <div style={{ maxWidth: 380, margin: "60px auto", background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 15px rgba(26,39,58,0.12)" }}>
          <div style={{ background: NAVY, textAlign: "center", padding: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Simplicicar" width={240} style={{ width: 240, maxWidth: "80%", height: "auto" }} />
          </div>
          <div style={{ height: 4, background: PINK }} />
          <div style={{ padding: 28 }}>
            <h1 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 20, color: NAVY, margin: "0 0 16px", textTransform: "uppercase" }}>Prospection</h1>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enter(pin)} placeholder="Code d'accès" style={inp} />
            {err && <p style={{ color: "#dc2626", fontSize: 14 }}>❌ {err}</p>}
            <button onClick={() => enter(pin)} disabled={!pin} style={{ marginTop: 16, width: "100%", padding: 13, borderRadius: 8, border: "none", background: PINK, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Entrer</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ background: NAVY, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Simplicicar" width={170} style={{ width: 170, maxWidth: "50%", height: "auto" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/" style={{ color: "#fff", fontSize: 13, textDecoration: "none", background: "#2d3a52", padding: "8px 12px", borderRadius: 8, fontWeight: 600 }}>RDV</a>
            <a href="/agenda" style={{ color: "#fff", fontSize: 13, textDecoration: "none", background: "#2d3a52", padding: "8px 12px", borderRadius: 8, fontWeight: 600 }}>Agenda</a>
          </div>
        </div>

        {/* Ajout rapide pendant les appels */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Nouveau lead (appel)</div>
          <div style={{ display: "grid", gap: 10 }}>
            <input style={inp} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone appelé" />
            <input style={inp} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Lien de l'annonce" />
            <input style={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optionnel)" />
            <button onClick={add} disabled={adding || !phone.trim() || !url.trim()} style={{ padding: 13, borderRadius: 8, border: "none", background: adding || !phone.trim() || !url.trim() ? "#cbd5e1" : PINK, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              {adding ? "Ajout…" : "Ajouter le lead"}
            </button>
          </div>
        </div>

        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Le client rappelle ? Cherche son numéro (même partiel)" style={{ ...inp, marginBottom: 16, padding: 14, fontSize: 16 }} />

        {err && <p style={{ color: "#dc2626" }}>❌ {err}</p>}

        <div style={{ display: "grid", gap: 10 }}>
          {leads.map((l) => (
            <div key={l.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: NAVY, fontSize: 16 }}>{l.phone}</div>
                <a href={l.listing_url} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontSize: 14, textDecoration: "none", fontWeight: 600 }}>
                  {platformOf(l.listing_url)} — ouvrir l&apos;annonce →
                </a>
                {l.note && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{l.note}</div>}
                <div style={{ fontSize: 11, color: "#9aa6b8", marginTop: 2 }}>
                  {new Date(l.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}
                </div>
              </div>
              <button onClick={() => del(l.id)} style={{ flexShrink: 0, padding: "8px 10px", borderRadius: 8, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Suppr.</button>
            </div>
          ))}
          {leads.length === 0 && <p style={{ color: "#6b7280", textAlign: "center" }}>Aucun lead.</p>}
        </div>
      </div>
    </main>
  );
}
