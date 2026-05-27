"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BRAND_LIST, CAR_CATALOG } from "@/lib/car-catalog";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const FONT_HEAD = "'Cabin','Manrope',Arial,sans-serif";
const FONT_BODY = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "13px 14px", fontSize: 15, borderRadius: 10,
  border: "1.5px solid #e5e7eb", background: "#fff", color: NAVY,
  boxSizing: "border-box", fontFamily: FONT_BODY,
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6,
  fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4,
};

function resizeImage(file: File, maxW = 1200): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement("canvas");
        c.width = img.width * scale;
        c.height = img.height * scale;
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.7));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function RecommandationPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [brandSel, setBrandSel] = useState("");
  const [brandCustom, setBrandCustom] = useState("");
  const [modelSel, setModelSel] = useState("");
  const [modelCustom, setModelCustom] = useState("");
  const [km, setKm] = useState("");
  const [year, setYear] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"vente" | "achat">("vente");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("name")) setFirstName(p.get("name")!);
    if (p.get("email")) setEmail(p.get("email")!);
    if (p.get("type") === "achat") setMode("achat");
  }, []);

  const brand = brandSel === "Autre" ? brandCustom : brandSel;
  const modelsForBrand = useMemo(() => {
    if (!brandSel || brandSel === "Autre") return [];
    return [...(CAR_CATALOG[brandSel] ?? [])].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  }, [brandSel]);
  const showModelCustom = brandSel === "Autre" || modelSel === "Autre" || (!!brandSel && modelsForBrand.length === 0);
  const model = showModelCustom ? modelCustom : modelSel;

  const ready =
    firstName.trim() &&
    lastName.trim() &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) &&
    phone.replace(/\D/g, "").length >= 9;

  async function handlePhotos(files: FileList | null) {
    if (!files) return;
    const remaining = 5 - photos.length;
    const toProcess = Array.from(files).slice(0, remaining);
    const results = await Promise.all(toProcess.map((f) => resizeImage(f)));
    setPhotos((prev) => [...prev, ...results].slice(0, 5));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/recommandation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, phone, brand, model, km, year, photos, mode }),
      });
      const d = await res.json();
      if (d.ok) setDone(true);
      else setErr(d.error ?? "Erreur");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => currentYear - i);

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, background: "#fafbfc", padding: 24 }}>
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Simplicicar" width={200} style={{ width: 200, maxWidth: "60%", height: "auto" }} />
        </div>

        {done ? (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 28, textAlign: "center", boxShadow: "0 8px 24px rgba(26,39,58,0.06)" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
            <h1 style={{ fontFamily: FONT_HEAD, fontSize: 24, color: NAVY, margin: "0 0 10px" }}>
              Demande envoyée !
            </h1>
            <p style={{ color: "#6b7280", fontSize: 15, margin: 0 }}>
              Notre équipe vous recontacte très rapidement pour discuter de votre véhicule.
            </p>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 28, boxShadow: "0 8px 24px rgba(26,39,58,0.06)" }}>
            <h1 style={{ fontFamily: FONT_HEAD, fontSize: 22, color: NAVY, margin: "0 0 6px", textAlign: "center" }}>
              {mode === "achat" ? "Vous souhaitez acheter un véhicule" : "Estimation gratuite"}
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, textAlign: "center", margin: "0 0 22px" }}>
              {mode === "achat"
                ? "Décrivez le véhicule que vous recherchez, un conseiller vous rappelle sous 24h."
                : "Un proche vous a recommandé Simplicicar. Remplissez ce formulaire, on vous rappelle sous 24h."}
            </p>

            <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Prénom</label>
                  <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jean" required />
                </div>
                <div>
                  <label style={labelStyle}>Nom</label>
                  <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dupont" required />
                </div>
              </div>

              <div>
                <label style={labelStyle}>E-mail</label>
                <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jean@exemple.fr" required />
              </div>

              <div>
                <label style={labelStyle}>Téléphone</label>
                <input style={inputStyle} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" required />
              </div>

              <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Marque</label>
                  <select style={inputStyle} value={brandSel} onChange={(e) => { setBrandSel(e.target.value); setModelSel(""); setModelCustom(""); }}>
                    <option value="">— Sélectionner —</option>
                    {BRAND_LIST.map((b) => <option key={b} value={b}>{b}</option>)}
                    <option value="Autre">Autre</option>
                  </select>
                  {brandSel === "Autre" && <input style={{ ...inputStyle, marginTop: 8 }} value={brandCustom} onChange={(e) => setBrandCustom(e.target.value)} placeholder="Quelle marque ?" />}
                </div>
                <div>
                  <label style={labelStyle}>Modèle</label>
                  {modelsForBrand.length > 0 ? (
                    <select style={inputStyle} value={modelSel} onChange={(e) => { setModelSel(e.target.value); setModelCustom(""); }}>
                      <option value="">— Sélectionner —</option>
                      {modelsForBrand.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value="Autre">Autre</option>
                    </select>
                  ) : (
                    <input style={inputStyle} value={modelCustom} onChange={(e) => setModelCustom(e.target.value)} placeholder={brandSel ? "Modèle" : "Marque d'abord"} disabled={!brandSel} />
                  )}
                  {modelsForBrand.length > 0 && modelSel === "Autre" && <input style={{ ...inputStyle, marginTop: 8 }} value={modelCustom} onChange={(e) => setModelCustom(e.target.value)} placeholder="Quel modèle ?" />}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>{mode === "achat" ? "Budget max (€)" : "Kilométrage"}</label>
                  <input style={inputStyle} inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d ]/g, ""))} placeholder={mode === "achat" ? "25 000" : "85 000"} />
                </div>
                <div>
                  <label style={labelStyle}>{mode === "achat" ? "Année min souhaitée" : "Année"}</label>
                  <select style={inputStyle} value={year} onChange={(e) => setYear(e.target.value)}>
                    <option value="">—</option>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {mode === "vente" && <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }} />}

              {mode === "vente" && <div>
                <label style={labelStyle}>Photos du véhicule (5 max)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handlePhotos(e.target.files)}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={photos.length >= 5}
                  style={{
                    padding: "12px 18px", borderRadius: 10, border: "1.5px dashed #d1d5db",
                    background: "#fafbfc", color: photos.length >= 5 ? "#9aa6b8" : NAVY,
                    fontWeight: 600, fontSize: 14, cursor: photos.length >= 5 ? "default" : "pointer",
                    width: "100%", fontFamily: FONT_BODY,
                  }}
                >
                  📷 {photos.length >= 5 ? "5 photos maximum atteintes" : `Ajouter des photos (${photos.length}/5)`}
                </button>
                {photos.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {photos.map((src, i) => (
                      <div key={i} style={{ position: "relative" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                        <button
                          type="button"
                          onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                          style={{
                            position: "absolute", top: -6, right: -6, width: 20, height: 20,
                            borderRadius: 999, background: "#dc2626", color: "#fff", border: "none",
                            fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>}

              {err && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>❌ {err}</p>}

              <button
                type="submit"
                disabled={busy || !ready}
                style={{
                  padding: "15px 20px", borderRadius: 10, border: "none", fontFamily: FONT_BODY,
                  fontSize: 16, fontWeight: 700, cursor: busy || !ready ? "not-allowed" : "pointer",
                  background: busy || !ready ? "#cbd5e1" : PINK, color: "#fff", marginTop: 4,
                }}
              >
                {busy ? "Envoi…" : "Se faire recontacter rapidement →"}
              </button>

              <p style={{ fontSize: 11, color: "#9aa6b8", margin: "4px 0 0", textAlign: "center" }}>
                Sans engagement. Vos données ne sont jamais revendues.
              </p>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
