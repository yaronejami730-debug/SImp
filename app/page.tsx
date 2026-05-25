"use client";

import { useEffect, useState } from "react";
import SlotPicker from "@/components/SlotPicker";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const ACCENT = "#24B9D7";

type Result = {
  ok: boolean;
  eventLink?: string;
  appointment?: { firstName: string; lastName: string; email: string; platform: string; location: string; startDateTime: string };
  error?: string;
};
type Dup = { firstName: string; lastName: string; phone: string; startDateTime: string | null; platform: string; signStatus: string; matchedBy: string };

const EMPTY = { firstName: "", lastName: "", email: "", phone: "", listingUrl: "", date: "", time: "" };

const inputStyle: React.CSSProperties = {
  width: "100%", padding: 12, fontSize: 15, borderRadius: 8,
  border: "1.5px solid #e5e7eb", background: "#fff", color: "#232323", boxSizing: "border-box", fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, color: "#6b7280", marginBottom: 6 };

function Home() {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [preview, setPreview] = useState<{ platform?: string; title?: string | null; image?: string | null } | null>(null);
  const [dups, setDups] = useState<Dup[]>([]);

  function set(key: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const ready = form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.phone.trim() && form.listingUrl.trim() && form.date && form.time;

  useEffect(() => {
    const u = form.listingUrl.trim();
    if (!/^https?:\/\//i.test(u)) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/preview?url=${encodeURIComponent(u)}`);
        const d = await r.json();
        setPreview({ platform: d.platform, title: d.title, image: d.image });
      } catch { setPreview(null); }
    }, 600);
    return () => clearTimeout(t);
  }, [form.listingUrl]);

  useEffect(() => {
    const phone = form.phone.replace(/\D/g, "");
    const url = form.listingUrl.trim();
    if (phone.length < 4 && !/^https?:\/\//i.test(url)) { setDups([]); return; }
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams();
        if (phone.length >= 4) qs.set("phone", form.phone);
        if (/^https?:\/\//i.test(url)) qs.set("url", url);
        const r = await fetch(`/api/lookup?${qs.toString()}`, { headers: authHeaders() });
        const d = await r.json();
        setDups(d.ok ? d.matches : []);
      } catch { setDups([]); }
    }, 700);
    return () => clearTimeout(t);
  }, [form.phone, form.listingUrl]);

  async function submit() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/appointment", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setResult(data);
      if (data.ok) setForm(EMPTY);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "26px 24px", boxShadow: "0 4px 6px rgba(26,39,58,0.06)" }}>
      <h1 style={{ margin: "0 0 6px", fontFamily: "'Cabin','Manrope',Arial,sans-serif", fontSize: 22, fontWeight: 700, color: NAVY, textTransform: "uppercase" }}>Prise de rendez-vous</h1>
      <p style={{ color: "#6b7280", marginTop: 0, marginBottom: 22, fontSize: 14 }}>Rendez-vous au 3 rue Bolidor, 75017 Paris. Le client reçoit une confirmation par e-mail.</p>

      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div><label style={labelStyle}>Prénom</label><input style={inputStyle} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Jean" /></div>
          <div><label style={labelStyle}>Nom</label><input style={inputStyle} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Dupont" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div><label style={labelStyle}>E-mail du client</label><input style={inputStyle} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jean.dupont@email.com" /></div>
          <div><label style={labelStyle}>Téléphone du client</label><input style={inputStyle} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="06 12 34 56 78" /></div>
        </div>
        <div>
          <label style={labelStyle}>Lien de l&apos;annonce</label>
          <input style={inputStyle} value={form.listingUrl} onChange={(e) => set("listingUrl", e.target.value)} placeholder="https://www.leboncoin.fr/voitures/123456789" />
          {preview && (preview.title || preview.image) && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10, background: "#f8f9fa" }}>
              {preview.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.image} alt="" width={72} height={72} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.4 }}>{preview.platform}</div>
                <div style={{ fontSize: 13, color: "#232323", lineHeight: 1.4, marginTop: 2 }}>{preview.title ?? "Aperçu indisponible"}</div>
              </div>
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>Créneau du rendez-vous</label>
          <SlotPicker value={{ date: form.date, time: form.time }} onChange={(v) => setForm((f) => ({ ...f, date: v.date, time: v.time }))} />
        </div>
      </div>

      {dups.length > 0 && (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a" }}>
          <strong style={{ color: "#b45309" }}>⚠️ Déjà {dups.length} rendez-vous avec ce client / ce lien</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.6, color: "#92400e", fontSize: 13 }}>
            {dups.slice(0, 4).map((d, i) => (
              <li key={i}>
                {d.startDateTime ? new Date(d.startDateTime).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }) : "—"} — {d.firstName} {d.lastName} ({d.phone}) · {d.platform} · {d.signStatus === "signed" ? "signé ✅" : d.signStatus === "thinking" ? "réfléchit 🤔" : d.signStatus === "unsigned" ? "pas signé ❌" : "à venir"} <span style={{ color: "#b45309" }}>[{d.matchedBy === "url" ? "même lien" : d.matchedBy === "phone" ? "même tél" : "tél+lien"}]</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={submit} disabled={loading || !ready} style={{ marginTop: 22, width: "100%", padding: "14px 20px", fontSize: 16, fontWeight: 600, borderRadius: 8, border: "none", cursor: loading || !ready ? "not-allowed" : "pointer", background: loading || !ready ? "#cbd5e1" : PINK, color: "#fff", fontFamily: "inherit" }}>
        {loading ? "Création en cours…" : "Créer le rendez-vous"}
      </button>

      {result?.ok && result.appointment && (
        <div style={{ marginTop: 22, padding: 18, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <strong style={{ color: "#166534" }}>✅ Rendez-vous créé</strong>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.7, color: "#166534" }}>
            <li>{result.appointment.firstName} {result.appointment.lastName} — {result.appointment.email}</li>
            <li>{result.appointment.location}</li>
            <li>{new Date(result.appointment.startDateTime).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" })}</li>
          </ul>
          {result.eventLink && <a href={result.eventLink} target="_blank" rel="noreferrer" style={{ color: ACCENT, display: "inline-block", marginTop: 10 }}>Ouvrir dans Google Agenda →</a>}
        </div>
      )}
      {result && !result.ok && (
        <div style={{ marginTop: 22, padding: 18, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}>❌ {result.error}</div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Shell active="rdv">
      <Home />
    </Shell>
  );
}
