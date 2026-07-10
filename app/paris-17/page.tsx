"use client";

import { useMemo, useState } from "react";
import { BRAND_LIST, CAR_CATALOG } from "@/lib/car-catalog";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";
const ACCENT = "#24B9D7";
const FONT_HEAD = "'Cabin','Manrope',Arial,sans-serif";
const FONT_BODY = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "13px 14px", fontSize: 15, borderRadius: 10, border: "1.5px solid #e5e7eb",
  background: "#fff", color: NAVY, boxSizing: "border-box", fontFamily: FONT_BODY, outline: "none",
};

export default function ParisLandingPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [brandSel, setBrandSel] = useState("");        // valeur du <select>
  const [brandCustom, setBrandCustom] = useState("");  // saisie manuelle si "Autre"
  const [modelSel, setModelSel] = useState("");
  const [modelCustom, setModelCustom] = useState("");
  const [km, setKm] = useState("");

  const brand = brandSel === "Autre" ? brandCustom : brandSel;
  const modelsForBrand = useMemo(() => {
    if (!brandSel || brandSel === "Autre") return [];
    return [...(CAR_CATALOG[brandSel] ?? [])].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  }, [brandSel]);
  const showModelCustom = brandSel === "Autre" || modelSel === "Autre" || (!!brandSel && modelsForBrand.length === 0);
  const model = showModelCustom ? modelCustom : modelSel;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const ready =
    firstName.trim() &&
    lastName.trim() &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) &&
    phone.replace(/\D/g, "").length >= 9;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/estimation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, phone, brand, model, km, source: "paris-17" }),
      });
      const d = await res.json();
      if (d.ok) setDone(true);
      else setErr(d.error ?? "Erreur, réessayez.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ background: "#fff", color: NAVY, fontFamily: FONT_BODY, minHeight: "100vh" }}>
      {/* ── Header simple ── */}
      <header style={{ borderBottom: "1px solid #f1f5f9", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1100, margin: "0 auto" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Simplicicar Paris 17" width={260} style={{ width: 260, maxWidth: "70%", height: "auto" }} />
        <a href="tel:+33160319059" style={{ color: NAVY, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
          📞 01 60 31 90 59
        </a>
      </header>

      {/* ── Hero + formulaire ── */}
      <section style={{ padding: "60px 24px 40px", maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 460px)", gap: 60, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
            Simplicicar — Paris 17
          </div>
          <h1 style={{ fontFamily: FONT_HEAD, fontSize: "clamp(34px, 5vw, 52px)", lineHeight: 1.1, fontWeight: 700, margin: "0 0 22px", color: NAVY }}>
            Vendez votre véhicule<br />
            <span style={{ color: PINK }}>rapidement.</span>
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: "#4b5563", margin: "0 0 28px", maxWidth: 480 }}>
            Confiez la vente de votre voiture ou moto d&apos;occasion à un réseau de <strong style={{ color: NAVY }}>plus de 110 concessions</strong>, spécialisé dans les transactions sécurisées. Notre agence du 17ème vous accompagne de A à Z.
          </p>

          {/* Trust strip */}
          <div style={{ display: "grid", gap: 14, marginTop: 28 }}>
            {[
              { i: "⏱", t: "Estimation sous 24h", s: "Réponse rapide après votre demande." },
              { i: "📍", t: "Agence physique 75017", s: "3 rue Bélidor, Paris 17ème." },
              { i: "🔒", t: "Sans engagement", s: "Aucun frais, vous décidez seul." },
            ].map((b) => (
              <div key={b.t} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fdf2f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                  {b.i}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>{b.t}</div>
                  <div style={{ fontSize: 14, color: "#6b7280" }}>{b.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Form card ── */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 28, boxShadow: "0 12px 32px rgba(26,39,58,0.08)" }}>
          {done ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
              <h2 style={{ fontFamily: FONT_HEAD, fontSize: 22, margin: "0 0 10px", color: NAVY }}>
                Demande envoyée !
              </h2>
              <p style={{ color: "#6b7280", fontSize: 15, margin: 0 }}>
                Notre équipe vous recontacte sous 24h au numéro indiqué.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 700, color: NAVY, marginBottom: 2 }}>
                Estimation gratuite
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: -8, marginBottom: 4 }}>
                Remplissez en 30 secondes.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Prénom</label>
                  <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jean" autoComplete="given-name" required />
                </div>
                <div>
                  <label style={labelStyle}>Nom</label>
                  <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dupont" autoComplete="family-name" required />
                </div>
              </div>

              <div>
                <label style={labelStyle}>E-mail</label>
                <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jean@exemple.fr" autoComplete="email" required />
              </div>

              <div>
                <label style={labelStyle}>Téléphone</label>
                <input style={inputStyle} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" autoComplete="tel" required />
              </div>

              <div style={{ height: 1, background: "#f1f5f9", margin: "6px 0" }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Marque</label>
                  <select
                    style={inputStyle}
                    value={brandSel}
                    onChange={(e) => {
                      setBrandSel(e.target.value);
                      setModelSel("");
                      setModelCustom("");
                    }}
                  >
                    <option value="">— Sélectionner —</option>
                    {BRAND_LIST.map((b) => <option key={b} value={b}>{b}</option>)}
                    <option value="Autre">Autre (à préciser)</option>
                  </select>
                  {brandSel === "Autre" && (
                    <input
                      style={{ ...inputStyle, marginTop: 8 }}
                      value={brandCustom}
                      onChange={(e) => setBrandCustom(e.target.value)}
                      placeholder="Quelle marque ?"
                    />
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Modèle</label>
                  {modelsForBrand.length > 0 ? (
                    <select
                      style={inputStyle}
                      value={modelSel}
                      onChange={(e) => { setModelSel(e.target.value); setModelCustom(""); }}
                      disabled={!brandSel}
                    >
                      <option value="">— Sélectionner —</option>
                      {modelsForBrand.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value="Autre">Autre (à préciser)</option>
                    </select>
                  ) : (
                    <input
                      style={inputStyle}
                      value={modelCustom}
                      onChange={(e) => setModelCustom(e.target.value)}
                      placeholder={brandSel ? "Modèle" : "Choisir d'abord la marque"}
                      disabled={!brandSel}
                    />
                  )}
                  {modelsForBrand.length > 0 && modelSel === "Autre" && (
                    <input
                      style={{ ...inputStyle, marginTop: 8 }}
                      value={modelCustom}
                      onChange={(e) => setModelCustom(e.target.value)}
                      placeholder="Quel modèle ?"
                    />
                  )}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Kilométrage</label>
                <input
                  style={inputStyle}
                  inputMode="numeric"
                  value={km}
                  onChange={(e) => setKm(e.target.value.replace(/[^\d ]/g, ""))}
                  placeholder="85 000"
                />
              </div>

              {err && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>❌ {err}</p>}

              <button
                type="submit"
                disabled={busy || !ready}
                style={{
                  padding: "15px 20px",
                  borderRadius: 10,
                  border: "none",
                  fontFamily: FONT_BODY,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: busy || !ready ? "not-allowed" : "pointer",
                  background: busy || !ready ? "#cbd5e1" : PINK,
                  color: "#fff",
                  marginTop: 4,
                  transition: "background 0.15s ease",
                }}
              >
                {busy ? "Envoi…" : "Obtenir mon estimation →"}
              </button>

              <p style={{ fontSize: 11, color: "#9aa6b8", margin: "4px 0 0", textAlign: "center", lineHeight: 1.5 }}>
                Sans engagement. Vos données ne sont jamais revendues.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── Bandeau portails (marquee défilant) ── */}
      <section style={{ padding: "32px 0", background: "#f4f0e9" }}>
        <div style={{ textAlign: "center", marginBottom: 18, padding: "0 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#8a8278", textTransform: "uppercase", letterSpacing: 1.4 }}>
            Votre annonce diffusée sur
          </div>
        </div>
        <div className="portals-marquee">
          <div className="portals-track">
            {[...Array(2)].flatMap((_, dup) =>
              [
                { src: "/portals/leboncoin.png", alt: "leboncoin", h: 38 },
                { src: "/portals/lacentrale.png", alt: "La Centrale", h: 32 },
                { src: "/portals/paruvendu.png", alt: "ParuVendu.fr", h: 36 },
                { src: "/portals/autoscout24.png", alt: "AutoScout24", h: 36 },
              ].map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${dup}-${i}`}
                  src={p.src}
                  alt={p.alt}
                  style={{ height: p.h, width: "auto", flexShrink: 0 }}
                />
              )),
            )}
          </div>
        </div>
        <style jsx>{`
          .portals-marquee {
            overflow: hidden;
            mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
            -webkit-mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
          }
          .portals-track {
            display: flex;
            gap: 90px;
            align-items: center;
            width: max-content;
            animation: portals-scroll 28s linear infinite;
          }
          @keyframes portals-scroll {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
        `}</style>
      </section>

      {/* ── Showroom photo pro ── */}
      <section style={{ padding: "70px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
              Showroom Simplicicar
            </div>
            <h2 style={{ fontFamily: FONT_HEAD, fontSize: "clamp(26px, 3.5vw, 36px)", margin: "0 0 14px", color: NAVY }}>
              Des photos pro qui font vendre
            </h2>
            <p style={{ fontSize: 16, color: "#6b7280", maxWidth: 580, margin: "0 auto", lineHeight: 1.55 }}>
              Chaque véhicule est mis en valeur par un shooting professionnel — la différence se voit dès la première annonce.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/showroom.jpg"
            alt="Showroom Simplicicar — Porsche 718 Boxster"
            style={{ width: "100%", height: "auto", borderRadius: 18, display: "block", boxShadow: "0 16px 40px rgba(26,39,58,0.10)" }}
          />
        </div>
      </section>

      {/* ── Visibilité maximale ── */}
      <section style={{ padding: "70px 24px", borderTop: "1px solid #f1f5f9", background: "#fafbfc" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
              Visibilité maximale
            </div>
            <h2 style={{ fontFamily: FONT_HEAD, fontSize: "clamp(26px, 3.5vw, 36px)", margin: "0 0 14px", color: NAVY }}>
              Vendez plus vite, à un meilleur prix
            </h2>
            <p style={{ fontSize: 16, color: "#6b7280", maxWidth: 640, margin: "0 auto", lineHeight: 1.55 }}>
              Votre véhicule profite de notre savoir-faire pour attirer des acheteurs sérieux et qualifiés.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
            {[
              { i: "📝", t: "Annonce professionnelle", s: "Rédaction optimisée par nos experts pour maximiser l'impact." },
              { i: "📸", t: "Shooting photo", s: "Photos valorisantes qui mettent votre véhicule en avant." },
              { i: "🌐", t: "Diffusion multi-portails", s: "Présent sur les principaux sites automobiles français." },
              { i: "✨", t: "Showroom digital", s: "Présentation immersive dans notre vitrine en ligne." },
            ].map((b) => (
              <div key={b.t} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 22 }}>
                <div style={{ fontSize: 26, marginBottom: 10 }}>{b.i}</div>
                <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 16, color: NAVY, marginBottom: 6 }}>{b.t}</div>
                <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.55 }}>{b.s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Service 100% transparent ── */}
      <section style={{ padding: "70px 24px", borderTop: "1px solid #f1f5f9" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 480px)", gap: 60, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
              Service 100% transparent
            </div>
            <h2 style={{ fontFamily: FONT_HEAD, fontSize: "clamp(26px, 3.5vw, 36px)", margin: "0 0 22px", color: NAVY, lineHeight: 1.15 }}>
              Sans frais, sans surprise,<br />sans intermédiaire.
            </h2>
            <p style={{ fontSize: 16, color: "#4b5563", lineHeight: 1.65, margin: "0 0 18px" }}>
              Notre rémunération est intégrée au prix final convenu avec l&apos;acheteur. Vous savez dès le départ exactement ce que vous touchez.
            </p>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>
              <strong style={{ color: NAVY, fontStyle: "normal" }}>70 % des acheteurs</strong> préfèrent un professionnel pour la garantie, le financement et la reprise — votre véhicule profite de cette confiance.
            </p>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 28, boxShadow: "0 8px 24px rgba(26,39,58,0.06)" }}>
            {[
              { t: "Aucun frais à avancer", s: "0 € à débourser, jamais." },
              { t: "Prix net vendeur garanti", s: "Le montant net est fixé dès le départ." },
              { t: "Accompagnement administratif complet", s: "Certificat de cession, dossier, démarches : géré." },
              { t: "Paiement sécurisé direct", s: "Règlement direct acheteur → vendeur, sans séquestre." },
            ].map((b, i, arr) => (
              <div key={b.t} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "16px 0", borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <div style={{ width: 28, height: 28, borderRadius: 999, background: "#fdf2f8", color: PINK, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  ✓
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>{b.t}</div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{b.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ padding: "40px 24px 50px", maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 18, borderTop: "1px solid #f1f5f9" }}>
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          <strong style={{ color: NAVY }}>Simplicicar Paris 17</strong> — 3 rue Bélidor, 75017 Paris
          <br />
          Point partenaire du réseau{" "}
          <a href="https://www.simplicicar.com" target="_blank" rel="noopener" style={{ color: ACCENT, textDecoration: "none", fontWeight: 600 }}>
            Simplicicar
          </a>
          .
        </div>
        <div style={{ fontSize: 13, color: "#9aa6b8" }}>
          📞 <a href="tel:+33160319059" style={{ color: NAVY, fontWeight: 600, textDecoration: "none" }}>01 60 31 90 59</a>
        </div>
      </footer>
    </main>
  );
}
