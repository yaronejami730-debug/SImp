"use client";

import { useState } from "react";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const FONT_HEAD = "'Cabin','Manrope',Arial,sans-serif";
const FONT_BODY = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "13px 14px", fontSize: 15, borderRadius: 10,
  border: "1.5px solid #e5e7eb", background: "#fff", color: NAVY,
  boxSizing: "border-box", fontFamily: FONT_BODY,
};

export default function ParrainagePage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [referrerName, setReferrerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/parrainage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ friendEmail: email, friendName: name, referrerName }),
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

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, background: "#fafbfc", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Simplicicar" width={200} style={{ width: 200, maxWidth: "60%", height: "auto" }} />
        </div>

        {done ? (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 28, textAlign: "center", boxShadow: "0 8px 24px rgba(26,39,58,0.06)" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
            <h1 style={{ fontFamily: FONT_HEAD, fontSize: 24, color: NAVY, margin: "0 0 10px" }}>
              Recommandation envoyée !
            </h1>
            <p style={{ color: "#6b7280", fontSize: 15, margin: 0 }}>
              Votre proche recevra un e-mail de notre part. Merci pour votre confiance !
            </p>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 28, boxShadow: "0 8px 24px rgba(26,39,58,0.06)" }}>
            <h1 style={{ fontFamily: FONT_HEAD, fontSize: 22, color: NAVY, margin: "0 0 6px", textAlign: "center" }}>
              Recommander Simplicicar
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, textAlign: "center", margin: "0 0 22px" }}>
              Renseignez l&apos;adresse e-mail de la personne à qui vous souhaitez recommander Simplicicar.
            </p>

            <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>Votre prénom (le parrain)</label>
                <input style={inputStyle} value={referrerName} onChange={(e) => setReferrerName(e.target.value)} placeholder="Votre prénom" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>Prénom de votre proche</label>
                <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jean" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>Son adresse e-mail *</label>
                <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jean@exemple.fr" required />
              </div>

              {err && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>❌ {err}</p>}

              <button
                type="submit"
                disabled={busy || !valid}
                style={{
                  padding: "15px 20px", borderRadius: 10, border: "none", fontFamily: FONT_BODY,
                  fontSize: 16, fontWeight: 700, cursor: busy || !valid ? "not-allowed" : "pointer",
                  background: busy || !valid ? "#cbd5e1" : PINK, color: "#fff",
                }}
              >
                {busy ? "Envoi…" : "🤝 Envoyer la recommandation"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
