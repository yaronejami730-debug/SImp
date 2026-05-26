"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";
import { extractUrl } from "@/lib/parse";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const ACCENT = "#24B9D7";

type Lead = { id: number; phone: string; listing_url: string; note: string | null; created_at: string };

const waPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("33")) return d;
  if (d.startsWith("0")) return "33" + d.slice(1);
  return d;
};
const waUrl = (raw: string) => `https://wa.me/${waPhone(raw)}`;

const platformOf = (url: string) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.includes("leboncoin")) return "LeBonCoin";
    if (h.includes("lacentrale")) return "LaCentrale";
    if (h.includes("seloger")) return "SeLoger";
    return h;
  } catch { return "Lien"; }
};

const inp: React.CSSProperties = { width: "100%", padding: 12, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box", fontFamily: "inherit" };

function Prospection() {
  const [phone, setPhone] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  // ── Conversion d'un lead en RDV téléphonique (rappel) ──
  const [cvId, setCvId] = useState<number | null>(null);
  const [cvFirstName, setCvFirstName] = useState("");
  const [cvLastName, setCvLastName] = useState("");
  const [cvEmail, setCvEmail] = useState("");
  const [cvDate, setCvDate] = useState("");
  const [cvTime, setCvTime] = useState("09:00");
  const [cvNote, setCvNote] = useState("");
  const [cvBusy, setCvBusy] = useState(false);

  async function fetchLeads(q: string) {
    try {
      const res = await fetch(`/api/leads?phone=${encodeURIComponent(q)}`, { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) setLeads(d.leads); else setErr(d.error ?? "Erreur");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
  }

  useEffect(() => { fetchLeads(""); }, []);
  useEffect(() => { const t = setTimeout(() => fetchLeads(search), 350); return () => clearTimeout(t); }, [search]);

  async function add() {
    if (!phone.trim() || !url.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/leads", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ phone, listingUrl: url, note }) });
      const d = await res.json();
      if (d.ok) { setPhone(""); setUrl(""); setNote(""); fetchLeads(search); }
      else alert(d.error ?? "Erreur");
    } finally { setAdding(false); }
  }
  async function del(id: number) {
    await fetch(`/api/leads?id=${id}`, { method: "DELETE", headers: authHeaders() });
    setLeads((l) => l.filter((x) => x.id !== id));
  }

  function startConvert(l: Lead) {
    setCvId(l.id);
    setCvFirstName("");
    setCvLastName("");
    setCvEmail("");
    setCvDate("");
    setCvTime("09:00");
    setCvNote(l.note ?? "");
  }
  function cancelConvert() { setCvId(null); }

  async function submitConvert(l: Lead) {
    if (!cvDate) return;
    setCvBusy(true);
    try {
      const remindAt = new Date(`${cvDate}T${cvTime}:00`).toISOString();
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          firstName: cvFirstName,
          lastName: cvLastName,
          phone: l.phone,
          clientEmail: cvEmail,
          listingUrl: l.listing_url,
          note: cvNote,
          remindAt,
          leadId: l.id,
        }),
      });
      const d = await res.json();
      if (!d.ok) { alert(d.error ?? "Erreur lors de la création du RDV téléphonique."); return; }
      // Lead converti -> on le retire de la liste prospection.
      await fetch(`/api/leads?id=${l.id}`, { method: "DELETE", headers: authHeaders() });
      setLeads((arr) => arr.filter((x) => x.id !== l.id));
      setCvId(null);
    } finally { setCvBusy(false); }
  }

  return (
    <>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Nouveau lead (appel)</div>
        <div style={{ display: "grid", gap: 10 }}>
          <input style={inp} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone appelé" />
          <input style={inp} value={url} onChange={(e) => setUrl(extractUrl(e.target.value))} onPaste={(e) => { e.preventDefault(); setUrl(extractUrl(e.clipboardData.getData("text"))); }} placeholder="Colle le lien (texte ou URL)" />
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
          <div key={l.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: NAVY, fontSize: 16 }}>{l.phone}</div>
                <a href={l.listing_url} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontSize: 14, textDecoration: "none", fontWeight: 600 }}>{platformOf(l.listing_url)} — ouvrir l&apos;annonce →</a>
                {l.note && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{l.note}</div>}
                <div style={{ fontSize: 11, color: "#9aa6b8", marginTop: 2 }}>{new Date(l.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}</div>
              </div>
              <button onClick={() => del(l.id)} style={{ flexShrink: 0, padding: "8px 10px", borderRadius: 8, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Suppr.</button>
            </div>
            {cvId !== l.id ? (
              <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  onClick={() => startConvert(l)}
                  style={{ flex: "1 1 auto", padding: "11px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: PINK, color: "#fff", fontSize: 15, fontWeight: 600 }}
                >
                  📞 Convertir en RDV téléphonique
                </button>
                <a
                  href={waUrl(l.phone)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ flex: "0 0 auto", padding: "11px 14px", borderRadius: 8, textDecoration: "none", background: "#25D366", color: "#fff", fontSize: 15, fontWeight: 600 }}
                >
                  💬 WhatsApp
                </a>
              </div>
            ) : (
              <div style={{ marginTop: 12, padding: 12, background: "#fafbfc", border: "1px solid #e5e7eb", borderRadius: 8, display: "grid", gap: 10 }}>
                <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 12, color: PINK, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Nouveau RDV téléphonique
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input style={inp} value={cvFirstName} onChange={(e) => setCvFirstName(e.target.value)} placeholder="Prénom" />
                  <input style={inp} value={cvLastName} onChange={(e) => setCvLastName(e.target.value)} placeholder="Nom (optionnel)" />
                </div>
                <input style={inp} type="email" value={cvEmail} onChange={(e) => setCvEmail(e.target.value)} placeholder="E-mail client (optionnel — reçoit un rappel + ajouté aux contacts Google)" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input style={inp} type="date" value={cvDate} onChange={(e) => setCvDate(e.target.value)} />
                  <input style={inp} type="time" value={cvTime} onChange={(e) => setCvTime(e.target.value)} />
                </div>
                <input style={inp} value={cvNote} onChange={(e) => setCvNote(e.target.value)} placeholder="Note (optionnel)" />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => submitConvert(l)}
                    disabled={cvBusy || !cvDate}
                    style={{ flex: "1 1 auto", padding: "11px 12px", borderRadius: 8, border: "none", cursor: cvBusy || !cvDate ? "not-allowed" : "pointer", background: cvBusy || !cvDate ? "#cbd5e1" : PINK, color: "#fff", fontSize: 15, fontWeight: 600 }}
                  >
                    {cvBusy ? "Création…" : "✅ Programmer + ajouter à Google Agenda"}
                  </button>
                  <button
                    onClick={cancelConvert}
                    disabled={cvBusy}
                    style={{ flex: "0 0 auto", padding: "11px 14px", borderRadius: 8, border: "1.5px solid #e5e7eb", cursor: "pointer", background: "#fff", color: NAVY, fontSize: 14, fontWeight: 600 }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {leads.length === 0 && <p style={{ color: "#6b7280", textAlign: "center" }}>Aucun lead.</p>}
      </div>
    </>
  );
}

export default function Page() {
  return <Shell active="prospection"><Prospection /></Shell>;
}
