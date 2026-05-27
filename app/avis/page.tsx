"use client";

import { useState } from "react";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const FONT_HEAD = "'Cabin','Manrope',Arial,sans-serif";
const FONT_BODY = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", fontSize: 15, borderRadius: 10, border: "1.5px solid #e5e7eb",
  background: "#fff", color: NAVY, boxSizing: "border-box", fontFamily: FONT_BODY,
};

export default function AvisPage() {
  const [step, setStep] = useState<"form" | "done">("form");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [accueil, setAccueil] = useState("");
  const [recommande, setRecommande] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [busy, setBusy] = useState(false);

  // Referral state
  const [friendName, setFriendName] = useState("");
  const [friendPhone, setFriendPhone] = useState("");
  const [refBusy, setRefBusy] = useState(false);
  const [refDone, setRefDone] = useState(false);

  async function submit() {
    if (!rating) return;
    setBusy(true);
    try {
      const res = await fetch("/api/avis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, q_accueil: accueil, q_recommande: recommande, commentaire }),
      });
      const d = await res.json();
      if (d.ok) setStep("done");
      else alert(d.error ?? "Erreur");
    } finally { setBusy(false); }
  }

  async function submitReferral() {
    if (!friendName.trim() || friendPhone.replace(/\D/g, "").length < 9) return;
    setRefBusy(true);
    try {
      const res = await fetch("/api/parrainage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ friendName, friendPhone }),
      });
      const d = await res.json();
      if (d.ok) setRefDone(true);
      else alert(d.error ?? "Erreur");
    } finally { setRefBusy(false); }
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, background: "#fafbfc", padding: 24 }}>
      <div style={{ maxWidth: 520, width: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/logo.png" alt="Simplicicar" width={200} style={{ width: 200, maxWidth: "60%", height: "auto" }} />
        </div>

        {step === "form" && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 28, boxShadow: "0 8px 24px rgba(26,39,58,0.06)" }}>
            <h1 style={{ fontFamily: FONT_HEAD, fontSize: 24, color: NAVY, margin: "0 0 6px", textAlign: "center" }}>
              Notez votre expérience
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, textAlign: "center", margin: "0 0 24px" }}>
              Votre avis nous aide à toujours mieux vous servir.
            </p>

            {/* Stars */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 28 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 4, fontSize: 36,
                    color: n <= (hover || rating) ? "#facc15" : "#d1d5db",
                    transition: "color 0.1s, transform 0.1s",
                    transform: n <= (hover || rating) ? "scale(1.15)" : "scale(1)",
                  }}
                >
                  ★
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 6 }}>
                  Comment avez-vous trouvé l&apos;accueil ?
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Très bien", "Bien", "Correct", "À améliorer"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAccueil(opt)}
                      style={{
                        padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        border: accueil === opt ? `1.5px solid ${PINK}` : "1.5px solid #e5e7eb",
                        background: accueil === opt ? PINK : "#fff",
                        color: accueil === opt ? "#fff" : NAVY,
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 6 }}>
                  Recommanderiez-vous Simplicicar à un proche ?
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Oui, sans hésiter", "Probablement", "Pas sûr", "Non"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setRecommande(opt)}
                      style={{
                        padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        border: recommande === opt ? `1.5px solid ${PINK}` : "1.5px solid #e5e7eb",
                        background: recommande === opt ? PINK : "#fff",
                        color: recommande === opt ? "#fff" : NAVY,
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {recommande === "Oui, sans hésiter" && (
                <a
                  href="/parrainage"
                  style={{
                    display: "block", textAlign: "center", padding: "14px 20px", borderRadius: 10,
                    background: "#16a34a", color: "#fff", textDecoration: "none",
                    fontWeight: 700, fontSize: 15, fontFamily: FONT_BODY,
                  }}
                >
                  🤝 Recommander Simplicicar à un proche
                </a>
              )}

              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 6 }}>
                  Un mot pour nous ? (optionnel)
                </label>
                <textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Ce qui vous a plu, ce qu'on peut améliorer…"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              <button
                onClick={submit}
                disabled={busy || !rating}
                style={{
                  padding: "15px 20px", borderRadius: 10, border: "none", fontFamily: FONT_BODY,
                  fontSize: 16, fontWeight: 700, cursor: busy || !rating ? "not-allowed" : "pointer",
                  background: busy || !rating ? "#cbd5e1" : PINK, color: "#fff", marginTop: 4,
                }}
              >
                {busy ? "Envoi…" : "Envoyer mon avis"}
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 28, boxShadow: "0 8px 24px rgba(26,39,58,0.06)", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h1 style={{ fontFamily: FONT_HEAD, fontSize: 24, color: NAVY, margin: "0 0 8px" }}>
              Merci pour votre avis !
            </h1>
            <p style={{ color: "#6b7280", fontSize: 15, margin: "0 0 32px" }}>
              Votre retour compte énormément pour nous.
            </p>

            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 28 }}>
              <h2 style={{ fontFamily: FONT_HEAD, fontSize: 20, color: NAVY, margin: "0 0 6px" }}>
                Parrainez un proche
              </h2>
              <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 18px" }}>
                Quelqu&apos;un de votre entourage souhaite vendre son véhicule ? Recommandez-nous !
              </p>

              {refDone ? (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                  <p style={{ color: "#166534", fontWeight: 600, fontSize: 15, margin: 0 }}>
                    Parrainage envoyé ! Nous le contacterons rapidement.
                  </p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  <input
                    style={inputStyle}
                    value={friendName}
                    onChange={(e) => setFriendName(e.target.value)}
                    placeholder="Prénom de votre proche"
                  />
                  <input
                    style={inputStyle}
                    type="tel"
                    value={friendPhone}
                    onChange={(e) => setFriendPhone(e.target.value)}
                    placeholder="Son numéro de téléphone"
                  />
                  <button
                    onClick={submitReferral}
                    disabled={refBusy || !friendName.trim() || friendPhone.replace(/\D/g, "").length < 9}
                    style={{
                      padding: "15px 20px", borderRadius: 10, border: "none", fontFamily: FONT_BODY,
                      fontSize: 16, fontWeight: 700,
                      cursor: refBusy ? "not-allowed" : "pointer",
                      background: refBusy || !friendName.trim() ? "#cbd5e1" : PINK, color: "#fff",
                    }}
                  >
                    {refBusy ? "Envoi…" : "🤝 Parrainer quelqu'un"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
