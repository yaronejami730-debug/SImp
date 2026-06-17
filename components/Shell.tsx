"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/client";
import Login from "./Login";
import Nav from "./Nav";

/** Enveloppe les pages internes : exige la connexion, affiche la barre de nav. */
export default function Shell({ active, children }: { active: string; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!getToken());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <main style={{ minHeight: "100vh", background: "#eceef1", fontFamily: "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", color: "#232323", padding: "20px 16px" }}>
      <Nav active={active} />
      <div style={{ maxWidth: 720, margin: "0 auto" }}>{children}</div>
      {active !== "deplacement" && (
        <a
          href="/deplacement"
          title="Rendez-vous en déplacement"
          style={{
            position: "fixed", right: 20, bottom: 20, zIndex: 40,
            width: 56, height: 56, borderRadius: 28, background: "#38bdf8", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700,
            textDecoration: "none", boxShadow: "0 8px 20px rgba(56,189,248,0.45)",
          }}
        >
          ?
        </a>
      )}
    </main>
  );
}
