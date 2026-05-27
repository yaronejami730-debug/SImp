"use client";

import { useEffect, useState } from "react";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const FONT_HEAD = "'Cabin','Manrope',Arial,sans-serif";
const FONT_BODY = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

export default function UnsubscribePage() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    if (!t) { setStatus("error"); return; }
    fetch(`/api/unsubscribe?t=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d) => setStatus(d.ok ? "ok" : "error"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, background: "#fafbfc", padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Simplicicar" width={200} style={{ width: 200, maxWidth: "60%", height: "auto", marginBottom: 32 }} />

        {status === "loading" && (
          <p style={{ color: "#6b7280", fontSize: 16 }}>Traitement en cours…</p>
        )}

        {status === "ok" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h1 style={{ fontFamily: FONT_HEAD, fontSize: 24, color: NAVY, margin: "0 0 14px" }}>
              Demande prise en compte
            </h1>
            <p style={{ fontSize: 16, color: "#4b5563", lineHeight: 1.6, margin: "0 0 8px" }}>
              Vous ne serez plus recontacté concernant ce véhicule.
            </p>
            <p style={{ fontSize: 14, color: "#9aa6b8", margin: 0 }}>
              Vos données de suivi ont été supprimées.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontFamily: FONT_HEAD, fontSize: 24, color: NAVY, margin: "0 0 14px" }}>
              Lien invalide ou expiré
            </h1>
            <p style={{ fontSize: 16, color: "#6b7280", lineHeight: 1.6 }}>
              Ce lien n&apos;est plus valide. Contactez-nous directement si vous souhaitez ne plus être recontacté.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
