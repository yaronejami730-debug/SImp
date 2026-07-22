"use client";

import { useEffect, useState } from "react";
import SlotPicker from "@/components/SlotPicker";
import Shell from "@/components/Shell";
import VehiclePicker from "@/components/VehiclePicker";
import { authHeaders, getUser } from "@/lib/client";
import { extractUrl } from "@/lib/parse";
import { COMMERCIAUX, DEFAULT_COMMERCIAL } from "@/lib/commerciaux";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";

type Result = {
  ok: boolean;
  eventLink?: string;
  appointment?: { firstName: string; lastName: string; email: string; platform: string; location: string; startDateTime: string };
  error?: string;
  emailSent?: boolean;
  emailError?: string;
  smsSent?: boolean;
  smsError?: string;
  warning?: string;
  canForce?: boolean; // 409 créneau : proposer "Créer quand même"
};
type Dup = { firstName: string; lastName: string; phone: string; startDateTime: string | null; platform: string; signStatus: string; matchedBy: string };

const EMPTY = { civility: "Monsieur", firstName: "", lastName: "", email: "", phone: "", listingUrl: "", source: "", carBrand: "", carModel: "", carFinish: "", type: "agence", immatriculation: "", address: "", vehiclePhotoUrl: "", photos: [] as string[], teleprospector: "", teleprospectorEmail: "", commercial: DEFAULT_COMMERCIAL, date: "", time: "" };
const SOURCES = ["LeBonCoin", "LaCentrale", "Autre"];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: 12, fontSize: 15, borderRadius: 8,
  border: "1.5px solid #e5e7eb", background: "#fff", color:


    "#232323", boxSizing: "border-box", fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, color: "#6b7280", marginBottom: 6 };

function Home() {
  const [form, setForm] = useState(EMPTY);
  const [commerciaux, setCommerciaux] = useState<string[]>([...COMMERCIAUX]);
  const [teleprospecteurs, setTeleprospecteurs] = useState<{ name: string; email: string }[]>([]);
  const [rule, setRule] = useState<{ commercials: string[]; agenceOnly?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pastEntry, setPastEntry] = useState(false); // RDV déjà passé, saisi en retard -> pas de mail/SMS

  // Commercial pur (ni admin ni téléprospecteur) ne crée pas de RDV -> renvoyé vers son agenda.
  useEffect(() => {
    const u = getUser();
    if (u && u.role !== "admin" && !u.isTeleprospector && u.isCommercial) {
      window.location.href = "/agenda";
    }
  }, []);

  async function uploadVehiclePhotos(files?: FileList | null) {
    if (!files || !files.length) return;
    setPhotoBusy(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/upload", { method: "POST", headers: authHeaders(), body: fd });
        const d = await r.json();
        if (d.ok) urls.push(d.url); else alert(d.error ?? "Erreur upload photo");
      }
      if (urls.length) setForm((f) => ({ ...f, photos: [...f.photos, ...urls].slice(0, 6), vehiclePhotoUrl: f.vehiclePhotoUrl || urls[0] }));
    } finally { setPhotoBusy(false); }
  }
  function removePhoto(url: string) {
    setForm((f) => {
      const photos = f.photos.filter((p) => p !== url);
      return { ...f, photos, vehiclePhotoUrl: f.vehiclePhotoUrl === url ? (photos[0] ?? "") : f.vehiclePhotoUrl };
    });
  }

  // Listes commerciaux + téléprospecteurs (comptes). Défaut téléprospecteur = moi.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me", { headers: authHeaders() });
        const d = await r.json();
        if (!d.ok) return;
        let coms: string[] = (d.commercials?.map((c: { name: string }) => c.name)) ?? d.commerciaux ?? [];
        // Restriction téléprospecteur : ne garder que ses commerciaux autorisés + forcer agence.
        const tr = d.rule as { commercials: string[]; agenceOnly?: boolean } | null;
        setRule(tr ?? null);
        if (tr?.commercials?.length) {
          const tok = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
          const allowed = new Set(tr.commercials.map(tok));
          const filtered = coms.filter((c) => allowed.has(tok(c)));
          if (filtered.length) coms = filtered;
        }
        // IMPORTANT : si l'utilisateur est restreint (règle call center), on applique la liste
        // MÊME VIDE — jamais de fallback vers la liste globale (pas de fuite entre franchises).
        if (coms.length || tr) {
          setCommerciaux(coms);
          const def = coms[0] ?? "";
          setForm((f) => ({ ...f, commercial: def, ...(tr?.agenceOnly ? { type: "agence" } : {}) }));
          setLinkCommercial(def); setHesCommercial(def);
        }
        setTeleprospecteurs(d.teleprospectors ?? []);
        // Par défaut, le téléprospecteur = l'utilisateur connecté.
        setForm((f) => ({ ...f, teleprospector: f.teleprospector || d.name || "", teleprospectorEmail: f.teleprospectorEmail || d.email || "" }));
      } catch { /* défaut COMMERCIAUX */ }
    })();
  }, []);
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
  const [linkCommercial, setLinkCommercial] = useState(DEFAULT_COMMERCIAL);
  const [linkBrand, setLinkBrand] = useState("");
  const [linkModel, setLinkModel] = useState("");
  const [linkFinish, setLinkFinish] = useState("");
  const [linkDate, setLinkDate] = useState("");
  const [linkTime, setLinkTime] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkResult, setLinkResult] = useState<{ bookUrl: string; emailSent: boolean; smsSent: boolean } | null>(null);
  const linkReady = (linkEmail.trim() || linkPhone.trim()) && !!linkDate && !!linkTime;

  // Feature "client hésitant" : il ne sait pas quand -> on envoie juste un mail, il choisit.
  const [showHes, setShowHes] = useState(false);
  const [hesCivility, setHesCivility] = useState("Monsieur");
  const [hesEmail, setHesEmail] = useState("");
  const [hesPhone, setHesPhone] = useState("");
  const [hesCommercial, setHesCommercial] = useState(DEFAULT_COMMERCIAL);
  const [hesBrand, setHesBrand] = useState("");
  const [hesModel, setHesModel] = useState("");
  const [hesFinish, setHesFinish] = useState("");
  const [hesBusy, setHesBusy] = useState(false);
  const [hesResult, setHesResult] = useState<{ bookUrl: string; emailSent: boolean; smsSent: boolean } | null>(null);

  async function sendHesitant() {
    if (!hesEmail.trim()) return;
    setHesBusy(true); setHesResult(null);
    try {
      const res = await fetch("/api/book/link", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ email: hesEmail, phone: hesPhone, civility: hesCivility, commercial: hesCommercial, carBrand: hesBrand, carModel: hesModel, carFinish: hesFinish }), // pas de créneau -> le client choisit
      });
      const d = await res.json();
      if (d.ok) setHesResult({ bookUrl: d.bookUrl, emailSent: d.emailSent, smsSent: d.smsSent });
      else alert(d.error ?? "Erreur");
    } finally { setHesBusy(false); }
  }

  async function sendLink() {
    if (!linkReady) return;
    setLinkBusy(true);
    setLinkResult(null);
    try {
      const res = await fetch("/api/book/link", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          email: linkEmail, phone: linkPhone, civility: linkCivility, listingUrl: linkUrl, source: linkSource, commercial: linkCommercial,
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
    const pFn = sessionStorage.getItem("prefillFirstName");
    const pLn = sessionStorage.getItem("prefillLastName");
    const pEm = sessionStorage.getItem("prefillEmail");
    const pType = sessionStorage.getItem("prefillType");
    if (pType) { sessionStorage.removeItem("prefillType"); setForm((f) => ({ ...f, type: pType, date: "", time: "" })); }
    if (prefillUrl) { sessionStorage.removeItem("prefillListingUrl"); setForm((f) => ({ ...f, listingUrl: prefillUrl })); }
    if (prefillPhone) { sessionStorage.removeItem("prefillPhone"); setForm((f) => ({ ...f, phone: prefillPhone })); }
    if (pFn) { sessionStorage.removeItem("prefillFirstName"); setForm((f) => ({ ...f, firstName: pFn })); }
    if (pLn) { sessionStorage.removeItem("prefillLastName"); setForm((f) => ({ ...f, lastName: pLn })); }
    if (pEm) { sessionStorage.removeItem("prefillEmail"); setForm((f) => ({ ...f, email: pEm })); }
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

  async function submit(force = false) {
    // Même règle que le serveur : mobiles 06/07 uniquement (les fixes/passerelles ne se rappellent pas).
    const d = form.phone.replace(/\D/g, "");
    const mobileOk = /^0[67]\d{8}$/.test(d) || /^33[67]\d{8}$/.test(d) || /^0033[67]\d{8}$/.test(d);
    if (!mobileOk) { setResult({ ok: false, error: "Numéro refusé : demande au client son 06 ou 07 (les 01/03/04/05 sont des numéros passerelle, impossibles à rappeler)." }); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/appointment", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ ...form, ...(force ? { force: true } : {}), noNotify: pastEntry }),
      });
      const data = await res.json();
      setResult(data);
      if (data.ok) { setForm(EMPTY); setPastEntry(false); }
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "26px 24px", boxShadow: "0 4px 6px rgba(26,39,58,0.06)" }}>
      <h1 style={{ margin: "0 0 6px", fontFamily: "'Cabin','Manrope',Arial,sans-serif", fontSize: 22, fontWeight: 700, color: NAVY, textTransform: "uppercase" }}>Prise de rendez-vous</h1>
      <p style={{ color: "#6b7280", marginTop: 0, marginBottom: 22, fontSize: 14 }}>Rendez-vous au 3 rue Bélidor, 75017 Paris. Le client reçoit une confirmation par e-mail.</p>

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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
          <div><label style={labelStyle}>Prénom</label><input style={inputStyle} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Jean" /></div>
          <div><label style={labelStyle}>Nom</label><input style={inputStyle} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Dupont" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
          <div><label style={labelStyle}>E-mail du client</label><input style={inputStyle} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jean.dupont@email.com" /></div>
          <div><label style={labelStyle}>Téléphone du client</label><input style={inputStyle} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="06 12 34 56 78" /></div>
        </div>
        {/* ⚠️ Écriteau : numéros passerelle des plateformes */}
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fffbeb", border: "1.5px solid #fbbf24", fontSize: 13, color: "#92400e", lineHeight: 1.55 }}>
          <strong>⚠️ HYPER IMPORTANT — numéro de téléphone :</strong> LaCentrale (et d&apos;autres plateformes) peut afficher un numéro qui commence par <strong>01, 03, 04, 05…</strong> C&apos;est un <strong>numéro fixe / passerelle</strong> : impossible de rappeler le client derrière. Lors de la prise de rendez-vous, <strong>demande toujours au client son 06 ou son 07</strong>. Le formulaire refuse tout autre numéro.
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
          <label style={labelStyle}>Photos du véhicule <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(plusieurs possibles, max 6)</span></label>
          <input type="file" accept="image/*" multiple onChange={(e) => uploadVehiclePhotos(e.target.files)} style={{ fontSize: 13 }} />
          {photoBusy && <span style={{ fontSize: 12, color: "#9aa6b8" }}> envoi…</span>}
          {form.photos.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {form.photos.map((u) => (
                <div key={u} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" width={64} height={64} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  <button type="button" onClick={() => removePhoto(u)} title="Retirer" style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#dc2626", color: "#fff", fontSize: 11, cursor: "pointer", lineHeight: 1 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
        {!rule?.agenceOnly && (
          <div>
            <label style={labelStyle}>Type de RDV</label>
            <select style={inputStyle} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, date: "", time: "" }))}>
              <option value="agence">🏢 En agence</option>
              <option value="deplacement">🚗 En déplacement</option>
            </select>
          </div>
        )}
        {form.type === "deplacement" && (
          <div>
            <label style={labelStyle}>Adresse du client (déplacement)</label>
            <input style={inputStyle} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="N°, rue, code postal, ville" />
          </div>
        )}
        <div>
          <label style={labelStyle}>Commercial assigné</label>
          <select style={inputStyle} value={form.commercial} onChange={(e) => set("commercial", e.target.value)}>
            {commerciaux.length === 0 && <option value="">— Crée un commercial dans Comptes —</option>}
            {commerciaux.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Téléprospecteur <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(qui génère le RDV)</span></label>
          <select style={inputStyle} value={form.teleprospectorEmail} onChange={(e) => { const t = teleprospecteurs.find((x) => x.email === e.target.value); setForm((f) => ({ ...f, teleprospectorEmail: e.target.value, teleprospector: t?.name ?? f.teleprospector })); }}>
            {teleprospecteurs.length === 0 && <option value={form.teleprospectorEmail}>{form.teleprospector || "Moi"}</option>}
            {teleprospecteurs.map((t) => <option key={t.email} value={t.email}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6b7280", cursor: "pointer", marginBottom: 8 }}>
            <input type="checkbox" checked={pastEntry} onChange={(e) => setPastEntry(e.target.checked)} />
            RDV déjà passé, saisi en retard — ne pas notifier le client (pas de mail/SMS)
          </label>
          {pastEntry ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              <div><label style={labelStyle}>Date</label><input type="date" style={inputStyle} value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
              <div><label style={labelStyle}>Heure</label><input type="time" style={inputStyle} value={form.time} onChange={(e) => set("time", e.target.value)} /></div>
            </div>
          ) : (
            <>
              <label style={labelStyle}>Créneau du rendez-vous {form.type === "deplacement" ? "(déplacement)" : "(agence)"}</label>
              <SlotPicker type={form.type} commercial={form.commercial} value={{ date: form.date, time: form.time }} onChange={(v) => setForm((f) => ({ ...f, date: v.date, time: v.time }))} />
            </>
          )}
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

      <button onClick={() => submit()} disabled={loading || !ready} style={{ marginTop: 22, width: "100%", padding: "14px 20px", fontSize: 16, fontWeight: 600, borderRadius: 8, border: "none", cursor: loading || !ready ? "not-allowed" : "pointer", background: loading || !ready ? "#cbd5e1" : PINK, color: "#fff", fontFamily: "inherit" }}>
        {loading ? "Création en cours…" : "Créer le rendez-vous"}
      </button>

      {result?.ok && result.appointment && (
        <div style={{ marginTop: 22, padding: 18, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <strong style={{ color: "#166534" }}>✅ Rendez-vous créé</strong>
          {result.warning && <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", color: "#b45309", fontSize: 13, fontWeight: 600 }}>{result.warning}</div>}
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
        <div style={{ marginTop: 22, padding: 18, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}>
          ❌ {result.error}
          {result.canForce && (
            <button onClick={() => submit(true)} disabled={loading} style={{ display: "block", marginTop: 12, padding: "11px 16px", borderRadius: 8, border: "1.5px solid #b45309", background: "#fffbeb", color: "#b45309", fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%" }}>
              {loading ? "…" : "⚠️ Créer quand même le rendez-vous"}
            </button>
          )}
        </div>
      )}

      <div style={{ marginTop: 26, borderTop: "1px solid #ececec", paddingTop: 18 }}>
        <button type="button" onClick={() => setShowLink((s) => !s)} style={{ background: "none", border: "none", color: PINK, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0 }}>
          {showLink ? "▲ " : "▼ "}📅 Imposer un créneau — le client confirme son identité
        </button>
        {showLink && (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Tu fixes <strong>date + heure</strong> (+ véhicule), le client reçoit un SMS/mail et n&apos;a plus qu&apos;à <strong>confirmer son identité</strong>. Il ne voit ni le commercial, ni la source, ni le lien.</p>
            <div>
              <label style={labelStyle}>Civilité</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["Monsieur", "Madame"].map((c) => (
                  <button key={c} type="button" onClick={() => setLinkCivility(c)} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: linkCivility === c ? `1.5px solid ${PINK}` : "1.5px solid #e5e7eb", background: linkCivility === c ? PINK : "#fff", color: linkCivility === c ? "#fff" : "#6b7280" }}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div><label style={labelStyle}>E-mail <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(ou tél)</span></label><input style={inputStyle} type="email" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="client@email.com" /></div>
              <div><label style={labelStyle}>Téléphone <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(pour SMS)</span></label><input style={inputStyle} type="tel" value={linkPhone} onChange={(e) => setLinkPhone(e.target.value)} placeholder="06 12 34 56 78" /></div>
            </div>
            <div><label style={labelStyle}>Commercial <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(pour nous — invisible au client)</span></label>
              <select style={inputStyle} value={linkCommercial} onChange={(e) => setLinkCommercial(e.target.value)}>
                {commerciaux.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
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
            <div><label style={labelStyle}>Créneau imposé <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(date + heure)</span></label>
              <SlotPicker commercial={linkCommercial} value={{ date: linkDate, time: linkTime }} onChange={(v) => { setLinkDate(v.date); setLinkTime(v.time); }} />
            </div>
            <button onClick={sendLink} disabled={linkBusy || !linkReady} style={{ padding: "13px 20px", fontSize: 15, fontWeight: 600, borderRadius: 8, border: "none", cursor: linkBusy ? "not-allowed" : "pointer", background: linkBusy || !linkReady ? "#cbd5e1" : NAVY, color: "#fff" }}>
              {linkBusy ? "Envoi…" : "Envoyer le lien (confirmation)"}
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

      <div style={{ marginTop: 18, borderTop: "1px solid #ececec", paddingTop: 18 }}>
        <button type="button" onClick={() => setShowHes((s) => !s)} style={{ background: "none", border: "none", color: PINK, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0 }}>
          {showHes ? "▲ " : "▼ "}🤔 Client hésitant — il ne sait pas quand (il choisit son créneau)
        </button>
        {showHes && (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Le client veut venir mais ne sait pas quand. Tu mets <strong>juste son e-mail</strong> : il reçoit « suite à notre conversation téléphonique, choisissez un créneau » et réserve quand il veut. Suivi dans l&apos;onglet <strong>Hésitants</strong>.</p>
            <div>
              <label style={labelStyle}>Civilité</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["Monsieur", "Madame"].map((c) => (
                  <button key={c} type="button" onClick={() => setHesCivility(c)} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: hesCivility === c ? `1.5px solid ${PINK}` : "1.5px solid #e5e7eb", background: hesCivility === c ? PINK : "#fff", color: hesCivility === c ? "#fff" : "#6b7280" }}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div><label style={labelStyle}>E-mail du client</label><input style={inputStyle} type="email" value={hesEmail} onChange={(e) => setHesEmail(e.target.value)} placeholder="client@email.com" /></div>
              <div><label style={labelStyle}>Téléphone <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(optionnel)</span></label><input style={inputStyle} type="tel" value={hesPhone} onChange={(e) => setHesPhone(e.target.value)} placeholder="06 12 34 56 78" /></div>
            </div>
            <div><label style={labelStyle}>Commercial <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(pour nous — invisible au client)</span></label>
              <select style={inputStyle} value={hesCommercial} onChange={(e) => setHesCommercial(e.target.value)}>
                {commerciaux.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Véhicule <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(marque / modèle / finition — pour savoir de quoi il s&apos;agit)</span></label>
              <VehiclePicker brand={hesBrand} model={hesModel} finish={hesFinish} onChange={(b, m, fi) => { setHesBrand(b); setHesModel(m); setHesFinish(fi ?? ""); }} />
            </div>
            <button onClick={sendHesitant} disabled={hesBusy || !hesEmail.trim()} style={{ padding: "13px 20px", fontSize: 15, fontWeight: 600, borderRadius: 8, border: "none", cursor: hesBusy ? "not-allowed" : "pointer", background: hesBusy || !hesEmail.trim() ? "#cbd5e1" : NAVY, color: "#fff" }}>
              {hesBusy ? "Envoi…" : "Envoyer l'invitation (choix du créneau)"}
            </button>
            {hesResult && (
              <div style={{ padding: 14, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534" }}>
                <strong>✅ {hesResult.emailSent ? "Mail envoyé" : "Lien généré"}{hesResult.smsSent ? " + SMS envoyé" : ""}</strong>
                <p style={{ margin: "8px 0 4px", fontSize: 12, color: "#166534" }}>Lien (à copier si besoin) :</p>
                <input readOnly value={hesResult.bookUrl} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%", padding: 8, fontSize: 12, borderRadius: 6, border: "1px solid #bbf7d0", boxSizing: "border-box" }} />
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
