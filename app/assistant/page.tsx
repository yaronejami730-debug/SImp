"use client";

import { useEffect, useRef, useState } from "react";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const BG = "#eceef1";
const FONT = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

type Msg = { role: "user" | "bot"; text: string };

export default function Page() {
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [checking, setChecking] = useState(false);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Code mémorisé localement.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("assistant_code") : null;
    if (saved) { setCode(saved); verify(saved); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

  async function verify(c: string) {
    setChecking(true); setCodeErr("");
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c }) });
      if (r.ok) { setUnlocked(true); localStorage.setItem("assistant_code", c); }
      else { setCodeErr("Code invalide."); localStorage.removeItem("assistant_code"); }
    } catch { setCodeErr("Erreur réseau."); }
    finally { setChecking(false); }
  }

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, question: q }) });
      const d = await r.json();
      setMsgs((m) => [...m, { role: "bot", text: d.ok ? d.answer : `❌ ${d.error ?? "Erreur"}` }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "bot", text: `❌ ${e instanceof Error ? e.message : "Erreur"}` }]);
    } finally { setBusy(false); }
  }

  // ── Écran code ──
  if (!unlocked) {
    return (
      <main style={{ minHeight: "100vh", background: BG, fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 28, maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 38 }}>🤖</div>
          <h1 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 22, fontWeight: 700, color: NAVY, margin: "8px 0 4px" }}>Assistant Simplicicar</h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 18px" }}>Entre le code d&apos;accès pour poser tes questions.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") verify(code); }}
            type="password"
            placeholder="Code d'accès"
            style={{ width: "100%", padding: 13, fontSize: 16, borderRadius: 10, border: "1.5px solid #e5e7eb", boxSizing: "border-box", textAlign: "center", letterSpacing: 2 }}
          />
          {codeErr && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{codeErr}</div>}
          <button onClick={() => verify(code)} disabled={checking || !code.trim()} style={{ width: "100%", marginTop: 14, padding: 13, borderRadius: 10, background: PINK, color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: checking || !code.trim() ? 0.6 : 1 }}>
            {checking ? "Vérification…" : "Déverrouiller"}
          </button>
        </div>
      </main>
    );
  }

  // ── Chat ──
  const suggestions = [
    "As-tu déjà rentré une Classe A ?",
    "Quels mails ont été envoyés à Jean Dupont ?",
    "Le client du 12/06 a-t-il signé ?",
  ];

  return (
    <main style={{ minHeight: "100vh", background: BG, fontFamily: FONT, color: "#232323", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🤖</span>
        <div>
          <div style={{ fontFamily: "'Cabin',sans-serif", fontWeight: 700, color: NAVY }}>Assistant Simplicicar</div>
          <div style={{ fontSize: 11, color: "#9aa6b8" }}>Preuves mails / SMS · statuts RDV</div>
        </div>
      </header>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, maxWidth: 760, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: "center", color: "#6b7280", marginTop: 30 }}>
            <p style={{ fontSize: 14 }}>Pose une question sur un client, un RDV ou un véhicule.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 14 }}>
              {suggestions.map((s) => (
                <button key={s} onClick={() => setInput(s)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "8px 13px", fontSize: 12.5, color: NAVY, cursor: "pointer" }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
            <div style={{
              maxWidth: "85%", padding: "11px 14px", borderRadius: 14, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: m.role === "user" ? NAVY : "#fff", color: m.role === "user" ? "#fff" : "#232323",
              border: m.role === "user" ? "none" : "1px solid #e5e7eb",
            }}>
              {linkify(m.text)}
            </div>
          </div>
        ))}
        {busy && <div style={{ color: "#9aa6b8", fontSize: 13, paddingLeft: 4 }}>L&apos;assistant cherche les preuves…</div>}
      </div>

      <div style={{ background: "#fff", borderTop: "1px solid #e5e7eb", padding: 12 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Ta question…"
            style={{ flex: 1, padding: 13, fontSize: 15, borderRadius: 12, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }}
          />
          <button onClick={send} disabled={busy || !input.trim()} style={{ padding: "0 20px", borderRadius: 12, background: PINK, color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: busy || !input.trim() ? "default" : "pointer", opacity: busy || !input.trim() ? 0.6 : 1 }}>
            Envoyer
          </button>
        </div>
      </div>
    </main>
  );
}

// Transforme les URLs en liens cliquables.
function linkify(text: string): React.ReactNode {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: PINK, fontWeight: 600 }}>{p}</a>
      : <span key={i}>{p}</span>
  );
}
