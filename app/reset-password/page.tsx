"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

const PINK = "var(--brand-primary)";
const GRAY = "#64748b";
const LINE = "#e8ebef";
const RED = "#dc2626";
const GREEN = "#16a34a";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Token invalide");
      setValidating(false);
      return;
    }

    // Validate token format (basic check, actual validation happens server-side)
    if (token.length < 32) {
      setError("Token invalide");
      setValidating(false);
      return;
    }

    setTokenValid(true);
    setValidating(false);
  }, [token]);

  async function handleReset() {
    if (!password || !confirmPassword) {
      setError("Les deux champs sont requis");
      return;
    }

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setSuccess(true);
        setTimeout(() => router.push("/login"), 3000);
      } else {
        setError(data.error || "Erreur lors de la réinitialisation");
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
          Nouveau mot de passe
        </h1>
        <p style={{ margin: "0 0 32px", fontSize: 14, color: GRAY }}>Créez un mot de passe sécurisé.</p>

        {validating ? (
          <div style={{ textAlign: "center", color: GRAY }}>Vérification du lien...</div>
        ) : !tokenValid ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ padding: 12, background: "#fee2e2", borderRadius: 8, color: RED, fontSize: 13 }}>
              {error}
            </div>
            <Link
              href="/account-recovery"
              style={{
                display: "block",
                padding: "12px 20px",
                borderRadius: 8,
                border: "none",
                background: PINK,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              Retour à la récupération
            </Link>
          </div>
        ) : success ? (
          <div style={{ display: "grid", gap: 16, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
            <div>
              <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: GREEN }}>
                Mot de passe réinitialisé !
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: GRAY }}>
                Redirection vers la connexion...
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#232323" }}>
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Au moins 8 caractères"
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
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#232323" }}>
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répétez le mot de passe"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: `1.5px solid ${LINE}`,
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {error && (
              <div style={{ padding: 12, background: "#fee2e2", borderRadius: 8, color: RED, fontSize: 13 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleReset}
              disabled={loading || !password || !confirmPassword}
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
              {loading ? "Réinitialisation..." : "Réinitialiser"}
            </button>
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${LINE}`, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: GRAY }}>
            <Link href="/login" style={{ color: PINK, textDecoration: "none", fontWeight: 600 }}>
              Retour à la connexion
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
