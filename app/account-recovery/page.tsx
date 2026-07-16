"use client";

import { useState } from "react";
import Link from "next/link";

const PINK = "var(--brand-primary)";
const GRAY = "#64748b";
const LINE = "#e8ebef";
const RED = "#dc2626";
const GREEN = "#16a34a";

export default function AccountRecoveryPage() {
  const [step, setStep] = useState<"select" | "email" | "sent">("select");
  const [recoveryType, setRecoveryType] = useState<"username" | "password" | "both">("both");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!email.trim()) {
      setError("Email requis");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/account-recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase(),
          recoveryType,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setStep("sent");
      } else {
        setError(data.error || "Erreur lors de l'envoi");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#eceef1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 40,
          maxWidth: 500,
          width: "100%",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, color: "#232323", fontFamily: "'Cabin',sans-serif" }}>
          Récupérer votre compte
        </h1>
        <p style={{ margin: "0 0 32px", fontSize: 14, color: GRAY }}>
          Nous vous aiderons à récupérer l'accès à votre compte.
        </p>

        {step === "select" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#232323" }}>
                Que voulez-vous récupérer ?
              </label>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  { value: "username", label: "Identifiant oublié" },
                  { value: "password", label: "Mot de passe oublié" },
                  { value: "both", label: "Les deux" },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      borderRadius: 8,
                      border: `1.5px solid ${recoveryType === opt.value ? PINK : LINE}`,
                      background: recoveryType === opt.value ? "#fff5f8" : "#fff",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    <input
                      type="radio"
                      name="recovery"
                      value={opt.value}
                      checked={recoveryType === opt.value}
                      onChange={(e) => setRecoveryType(e.target.value as any)}
                      style={{ cursor: "pointer" }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStep("email")}
              style={{
                padding: "12px 20px",
                borderRadius: 8,
                border: "none",
                background: PINK,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Continuer
            </button>
          </div>
        )}

        {step === "email" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#232323" }}>
                Votre email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@example.com"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: `1.5px solid ${LINE}`,
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
                autoFocus
              />
              <p style={{ margin: "8px 0 0", fontSize: 12, color: GRAY }}>
                Nous enverrons un lien à cet email.
              </p>
            </div>

            {error && (
              <div style={{ padding: 12, background: "#fee2e2", borderRadius: 8, color: RED, fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button
                onClick={() => {
                  setStep("select");
                  setError("");
                }}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1.5px solid ${LINE}`,
                  background: "#fff",
                  color: "#232323",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Retour
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !email.trim()}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: PINK,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Envoi..." : "Envoyer"}
              </button>
            </div>
          </div>
        )}

        {step === "sent" && (
          <div style={{ display: "grid", gap: 16, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✉️</div>
            <div>
              <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: GREEN }}>Email envoyé !</h2>
              <p style={{ margin: 0, fontSize: 14, color: GRAY }}>
                Vérifiez votre boîte de réception {email}. Cliquez sur le lien pour continuer.
              </p>
            </div>
            <p style={{ margin: "16px 0 0", fontSize: 12, color: GRAY }}>
              Pas d'email ? Vérifiez les spams ou{" "}
              <button
                onClick={() => {
                  setStep("select");
                  setEmail("");
                  setError("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: PINK,
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontSize: 12,
                }}
              >
                réessayez
              </button>
            </p>
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${LINE}`, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: GRAY }}>
            Se souvient de votre identifiant ?{" "}
            <Link href="/login" style={{ color: PINK, textDecoration: "none", fontWeight: 600 }}>
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
