"use client";

import { useEffect, useState } from "react";
import SlotPicker from "@/components/SlotPicker";
import Shell from "@/components/Shell";
import VehiclePicker from "@/components/VehiclePicker";
import { authHeaders } from "@/lib/client";
import { extractUrl } from "@/lib/parse";
import { COMMERCIAUX, DEFAULT_COMMERCIAL } from "@/lib/commerciaux";

const NAVY = "#1a273a";
const PINK = "#DB407A";

type Result = {
  ok: boolean;
  eventLink?: string;
  appointment?: { firstName: string; lastName: string; email: string; platform: string; location: string; startDateTime: string };
  error?: string;
  emailSent?: boolean;
  emailError?: string;
  smsSent?: boolean;
  smsError?: string;
};
type Dup = { firstName: string; lastName: string; phone: string; startDateTime: string | null; platform: string; signStatus: string; matchedBy: string };

const EMPTY = { civility: "Monsieur", firstName: "", lastName: "", email: "", phone: "", listingUrl: "", source: "", carBrand: "", carModel: "", carFinish: "", commercial: DEFAULT_COMMERCIAL, date: "", time: "" };
const SOURCES = ["LeBonCoin", "LaCentrale", "Autre"];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: 12, fontSize: 15, borderRadius: 8,
  border: "1.5px solid #e5e7eb", background: "#fff", color:


    "#232323", boxSizing: "border-box", fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, color: "#6b7280", marginBottom: 6 };

function Home() {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [preview, setPreview] = useState<{ platform?: string; title?: string | null; image?: string | null } | null>(null);
  const [dups, setDups] = useState<Dup[]>([]);

  // Section "envoyer le lien au client"
  const [showLink, setShowLink] = useState(false);
  const [linkCivility, setLinkCivility] = useState("Monsieur");
  const [linkEmail, setLinkEmail] = useState("");
  const [linkPhone, setLinkPhone] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkSource, setLinkSource] = useState("");
  const [linkBrand, setLinkBrand] = useState("");
  const [linkModel, setLinkModel] = useState("");
  const [linkFinish, setLinkFinish] = useState("");
  const [linkDate, setLinkDate] = useState("");
  const [linkTime, setLinkTime] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkResult, setLinkResult] = useState<{ bookUrl: string; emailSent: boolean; smsSent: boolean } | null>(null);
  const linkReady = linkEmail.trim() || linkPhone.trim();

  async function sendLink() {
    if (!linkReady) return;
    setLinkBusy(true);
    setLinkResult(null);
    try {
      const res = await fetch("/api/book/link", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          email: linkEmail, phone: linkPhone, civility: linkCivility, listingUrl: linkUrl, source: linkSource,
          carBrand: linkBrand, carModel: linkModel, carFinish: linkFinish, date: linkDate, time: linkTime,
        }),
      });
      const d = await res.json();
      if (d.ok) setLinkResult({ bookUrl: d.bookUrl, emailSent: d.emailSent, smsSent: d.smsSent });
      else alert(d.error ?? "Erreur");
    } finally {
      setLinkBusy(false);
    }
  }

  function set(key: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const ready = form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.phone.trim() && form.date && form.time;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefillUrl = sessionStorage.getItem("prefillListingUrl");
    const prefillPhone = sessionStorage.getItem("prefillPhone");
    if (prefillUrl) { sessionStorage.removeItem("prefillListingUrl"); setForm((f) => ({ ...f, listingUrl: prefillUrl })); }
    if (prefillPhone) { sessionStorage.removeItem("prefillPhone"); setForm((f) => ({ ...f, phone: prefillPhone })); }
  }, []);

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
        <div>
          <label style={labelStyle}>Civilité</label>
          <div style={{ display: "flex", gap: 8 }}>
            {["Monsieur", "Madame"].map((c) => (
              <button key={c} type="button" onClick={() => set("civility", c)}
                style={{
                  flex: 1, padding: "10px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
                  border: form.civility === c ? `1.5px solid ${PINK}` : "1.5px solid #e5e7eb",
                  background: form.civility === c ? PINK : "#fff", color: form.civility === c ? "#fff" : "#6b7280"
                }}>{c}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div><label style={labelStyle}>Prénom</label><input style={inputStyle} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Jean" /></div>
          <div><label style={labelStyle}>Nom</label><input style={inputStyle} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Dupont" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div><label style={labelStyle}>E-mail du client</label><input style={inputStyle} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jean.dupont@email.com" /></div>
          <div><label style={labelStyle}>Téléphone du client</label><input style={inputStyle} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="06 12 34 56 78" /></div>
        </div>
        <div>
          <label style={labelStyle}>Lien de l&apos;annonce <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(optionnel)</span></label>
          <input style={inputStyle} value={form.listingUrl} onChange={(e) => set("listingUrl", extractUrl(e.target.value))} onPaste={(e) => { e.preventDefault(); set("listingUrl", extractUrl(e.clipboardData.getData("text"))); }} placeholder="Colle ici (texte ou lien complet)" />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {SOURCES.map((src) => (
              <button key={src} type="button" onClick={() => set("source", form.source === src ? "" : src)}
                style={{ flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: form.source === src ? `1.5px solid ${PINK}` : "1.5px solid #e5e7eb",
                  background: form.source === src ? PINK : "#fff", color: form.source === src ? "#fff" : "#6b7280" }}>
                {src === "LeBonCoin" ? "🟠 LeBonCoin" : src === "LaCentrale" ? "🔵 LaCentrale" : "Autre"}
              </button>
            ))}
          </div>
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
          <label style={labelStyle}>Véhicule</label>
          <VehiclePicker brand={form.carBrand} model={form.carModel} finish={form.carFinish} onChange={(b, m, fi) => setForm((f) => ({ ...f, carBrand: b, carModel: m, carFinish: fi ?? "" }))} />
        </div>
        <div>
          <label style={labelStyle}>Commercial</label>
          <select style={inputStyle} value={form.commercial} onChange={(e) => set("commercial", e.target.value)}>
            {COMMERCIAUX.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
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
          {result.eventLink && <a href={result.eventLink} target="_blank" rel="noreferrer" style={{ color: PINK, fontWeight: 600, display: "inline-block", marginTop: 10 }}>Ouvrir dans Google Agenda →</a>}
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <div style={{ color: result.emailSent ? "#166534" : "#dc2626" }}>{result.emailSent ? "✅ Mail confirmation envoyé" : `❌ Mail non envoyé${result.emailError ? ` : ${result.emailError}` : ""}`}</div>
            <div style={{ color: result.smsSent ? "#166534" : "#dc2626" }}>{result.smsSent ? "✅ SMS confirmation envoyé" : `❌ SMS non envoyé${result.smsError ? ` : ${result.smsError}` : ""}`}</div>
          </div>
        </div>
      )}
      {result && !result.ok && (
        <div style={{ marginTop: 22, padding: 18, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}>❌ {result.error}</div>
      )}

      <div style={{ marginTop: 26, borderTop: "1px solid #ececec", paddingTop: 18 }}>
        <button type="button" onClick={() => setShowLink((s) => !s)} style={{ background: "none", border: "none", color: PINK, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0 }}>
          {showLink ? "▲ " : "▼ "}📩 Laisser le client choisir son créneau (envoi d&apos;un lien)
        </button>
        {showLink && (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Le client reçoit un mail et/ou SMS. Il remplit juste son identité. Tu peux <strong>imposer un créneau</strong> (date + heure ci-dessous) : pratique quand l&apos;appel coupe — il n&apos;a plus qu&apos;à confirmer. Si tu laisses le créneau vide, le client choisit lui-même.</p>
            <div>
              <label style={labelStyle}>Civilité</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["Monsieur", "Madame"].map((c) => (
                  <button key={c} type="button" onClick={() => setLinkCivility(c)} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: linkCivility === c ? `1.5px solid ${PINK}` : "1.5px solid #e5e7eb", background: linkCivility === c ? PINK : "#fff", color: linkCivility === c ? "#fff" : "#6b7280" }}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={labelStyle}>E-mail <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(ou tél)</span></label><input style={inputStyle} type="email" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="client@email.com" /></div>
              <div><label style={labelStyle}>Téléphone <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(pour SMS)</span></label><input style={inputStyle} type="tel" value={linkPhone} onChange={(e) => setLinkPhone(e.target.value)} placeholder="06 12 34 56 78" /></div>
            </div>
            <div><label style={labelStyle}>Véhicule <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(pré-rempli, optionnel)</span></label>
              <VehiclePicker brand={linkBrand} model={linkModel} finish={linkFinish} onChange={(b, m, fi) => { setLinkBrand(b); setLinkModel(m); setLinkFinish(fi ?? ""); }} />
            </div>
            <div><label style={labelStyle}>Lien de l&apos;annonce <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(optionnel, non visible du client)</span></label><input style={inputStyle} value={linkUrl} onChange={(e) => setLinkUrl(extractUrl(e.target.value))} onPaste={(e) => { e.preventDefault(); setLinkUrl(extractUrl(e.clipboardData.getData("text"))); }} placeholder="Colle ici (texte ou lien complet)" />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {SOURCES.map((src) => (
                  <button key={src} type="button" onClick={() => setLinkSource(linkSource === src ? "" : src)} style={{ flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: linkSource === src ? `1.5px solid ${PINK}` : "1.5px solid #e5e7eb", background: linkSource === src ? PINK : "#fff", color: linkSource === src ? "#fff" : "#6b7280" }}>{src === "LeBonCoin" ? "🟠 LeBonCoin" : src === "LaCentrale" ? "🔵 LaCentrale" : "Autre"}</button>
                ))}
              </div>
            </div>
            <div><label style={labelStyle}>Imposer un créneau <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(optionnel — sinon le client choisit)</span></label>
              <SlotPicker value={{ date: linkDate, time: linkTime }} onChange={(v) => { setLinkDate(v.date); setLinkTime(v.time); }} />
            </div>
            <button onClick={sendLink} disabled={linkBusy || !linkReady} style={{ padding: "13px 20px", fontSize: 15, fontWeight: 600, borderRadius: 8, border: "none", cursor: linkBusy ? "not-allowed" : "pointer", background: linkBusy || !linkReady ? "#cbd5e1" : NAVY, color: "#fff" }}>
              {linkBusy ? "Envoi…" : "Envoyer le lien au client"}
            </button>
            {linkResult && (
              <div style={{ padding: 14, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534" }}>
                <strong>✅ {linkResult.emailSent ? "Mail envoyé" : "Lien généré"}{linkResult.smsSent ? " + SMS envoyé" : ""}</strong>
                <p style={{ margin: "8px 0 4px", fontSize: 12, color: "#166534" }}>Lien (à copier si besoin) :</p>
                <input readOnly value={linkResult.bookUrl} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%", padding: 8, fontSize: 12, borderRadius: 6, border: "1px solid #bbf7d0", boxSizing: "border-box" }} />
              </div>
            )}
          </div>
        )}
      </div>
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
