"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/client";
import Login from "./Login";
import Nav from "./Nav";

/** Enveloppe les pages internes : exige la connexion, affiche la barre de nav. */
export default function Shell({ active, children, wide }: { active: string; children: React.ReactNode; wide?: boolean }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!getToken());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <main style={{ minHeight: "100vh", background: "#eceef1", fontFamily: "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", color: "#232323", padding: "20px 16px", overflowX: "hidden", width: "100%", boxSizing: "border-box" }}>
      <Nav active={active} />
      <div style={{ maxWidth: wide ? 1400 : 720, margin: "0 auto", minWidth: 0 }}>{children}</div>
    </main>
  );
}
