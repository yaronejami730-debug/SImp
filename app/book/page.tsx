"use client";

import { useEffect, useState } from "react";
import SlotPicker from "@/components/SlotPicker";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";
const LOGO = "/logo.png";

const inp: React.CSSProperties = { width: "100%", padding: 12, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box", fontFamily: "inherit" };
const lab: React.CSSProperties = { display: "block", fontSize: 13, color: "#6b7280", marginBottom: 6 };

function frSlot(date: string, time: string): string {
  try {
    const [y, mo, da] = date.split("-").map(Number);
    const d = new Date(Date.UTC(y, mo - 1, da, 12, 0));
    const jour = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(d);
    return `${jour} à ${time.replace(":", "h")}`;
  } catch { return `${date} ${time}`; }
}

export default function Book() {
  const [token, setToken] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);
  const [civility, setCivility] = useState("Monsieur");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // Pré-rempli par le commercial (read-only) :
  const [vehicle, setVehicle] = useState("");
  const [fixedSlot, setFixedSlot] = useState(false);
  const [needEmail, setNeedEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ startDateTime: string } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? "";
    setToken(t);
    if (!t) { setValid(false); return; }
    fetch(`/api/book?t=${encodeURIComponent(t)}`).then((r) => r.json()).then((d) => {
      setValid(!!d.ok);
      if (!d.ok) return;
      if (d.civility) setCivility(d.civility);
      setVehicle(d.vehicle ?? "");
      setFixedSlot(!!d.fixedSlot);
      setNeedEmail(!!d.needEmail);
      if (d.fixedSlot) { setDate(d.date); setTime(d.time); }
    }).catch(() => setValid(false));
  }, []);

  const ready = firstName.trim() && lastName.trim() && phone.trim() && date && time && (!needEmail || email.trim());

  async function submit() {
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/book", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, civility, firstName, lastName, phone, email: needEmail ? email : undefined, date: fixedSlot ? undefined : date, time: fixedSlot ? undefined : time }),
      });
      const d = await res.json();
      if (d.ok) setDone({ startDateTime: d.startDateTime });
      else setErr(d.error ?? "Erreur");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#ffffff", fontFamily: "'Manrope',Arial,sans-serif", color: "#232323", padding: "30px 18px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Simplicicar" width={230} style={{ width: 230, maxWidth: "68%", height: "auto" }} />
        </div>

        {valid === false && <p style={{ color: "#dc2626", textAlign: "center" }}>❌ Lien invalide ou expiré. Contactez l&apos;agence.</p>}

        {valid && !done && (
          <>
            <h1 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 22, color: NAVY, textTransform: "uppercase", margin: "0 0 6px", textAlign: "center" }}>
              {fixedSlot ? "Confirmez votre rendez-vous" : "Prenez votre rendez-vous"}
            </h1>
            <p style={{ color: "#6b7280", textAlign: "center", marginTop: 0, marginBottom: 22, fontSize: 14 }}>Agence : 3 rue Bélidor 75017 Paris</p>

            {/* Récap pré-rempli par l'agence */}
            {(fixedSlot || vehicle) && (
              <div style={{ background: "#f8f9fa", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 18 }}>
                {fixedSlot && <div style={{ fontSize: 15, color: NAVY, fontWeight: 700 }}>📅 {frSlot(date, time)}</div>}
                {vehicle && <div style={{ fontSize: 14, color: "#475569", marginTop: fixedSlot ? 4 : 0 }}>🚗 {vehicle}</div>}
              </div>
            )}

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={lab}>Civilité</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Monsieur", "Madame"].map((c) => (
                    <button key={c} type="button" onClick={() => setCivility(c)} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: civility === c ? `1.5px solid ${PINK}` : "1.5px solid #e5e7eb", background: civility === c ? PINK : "#fff", color: civility === c ? "#fff" : "#6b7280" }}>{c}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div><label style={lab}>Prénom</label><input style={inp} value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
                <div><label style={lab}>Nom</label><input style={inp} value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
              </div>
              <div><label style={lab}>Téléphone</label><input style={inp} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" /></div>
              {needEmail && <div><label style={lab}>E-mail</label><input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@email.com" /></div>}
              {!fixedSlot && <div><label style={lab}>Choisissez votre créneau</label><SlotPicker value={{ date, time }} onChange={(v) => { setDate(v.date); setTime(v.time); }} allowCustom={false} endpoint={`/api/availability?t=${encodeURIComponent(token)}`} /></div>}
            </div>

            {err && <p style={{ color: "#dc2626", marginTop: 14 }}>❌ {err}</p>}

            <button onClick={submit} disabled={loading || !ready} style={{ marginTop: 22, width: "100%", padding: "14px 20px", fontSize: 16, fontWeight: 600, borderRadius: 8, border: "none", cursor: loading || !ready ? "not-allowed" : "pointer", background: loading || !ready ? "#cbd5e1" : PINK, color: "#fff" }}>
              {loading ? "Confirmation…" : "Confirmer mon rendez-vous"}
            </button>
          </>
        )}

        {done && (
          <div style={{ padding: 20, borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", textAlign: "center" }}>
            <strong style={{ fontSize: 18 }}>✅ Rendez-vous confirmé</strong>
            <p style={{ margin: "10px 0 0" }}>{new Date(done.startDateTime).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" })}</p>
            <p style={{ margin: "8px 0 0", fontSize: 13 }}>Un e-mail de confirmation vous a été envoyé.</p>
          </div>
        )}
      </div>
    </main>
  );
}
