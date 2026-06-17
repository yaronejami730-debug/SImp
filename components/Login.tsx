"use client";

import { useState } from "react";
import { setAuth } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const LOGO = "/logo.png";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json();
      if (d.ok) {
        setAuth(d.token, { email: d.email, name: d.name, role: d.role, callCenterId: d.callCenterId });
        onLogin();
      } else setErr(d.error ?? "Erreur");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: 12, fontSize: 15, borderRadius: 8,
    border: "1.5px solid #e5e7eb", boxSizing: "border-box", marginTop: 10,
  };

  return (
    <main style={{ minHeight: "100vh", background: "#eceef1", fontFamily: "'Manrope',Arial,sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 380, margin: "60px auto", background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 15px rgba(26,39,58,0.12)" }}>
        <div style={{ background: "#fff", textAlign: "center", padding: "26px 24px 18px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Simplicicar" width={230} style={{ width: 230, maxWidth: "78%", height: "auto" }} />
        </div>
        <div style={{ height: 4, background: PINK }} />
        <div style={{ padding: 28 }}>
          <h1 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 20, color: NAVY, margin: "0 0 8px", textTransform: "uppercase" }}>Connexion</h1>
          <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse e-mail" />
          <input style={inp} type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Mot de passe" />
          {err && <p style={{ color: "#dc2626", fontSize: 14 }}>❌ {err}</p>}
          <button onClick={submit} disabled={loading || !email || !password} style={{ marginTop: 16, width: "100%", padding: 13, borderRadius: 8, border: "none", background: loading || !email || !password ? "#cbd5e1" : PINK, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
            {loading ? "…" : "Se connecter"}
          </button>
        </div>
      </div>
    </main>
  );
}
