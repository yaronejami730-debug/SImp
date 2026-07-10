"use client";

import { useEffect, useState } from "react";
import SlotPicker from "@/components/SlotPicker";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";
const LOGO = "/logo.png";

export default function Reschedule() {
  const [eid, setEid] = useState("");
  const [info, setInfo] = useState<{ firstName?: string; startDateTime?: string | null; location?: string } | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ startDateTime: string } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("eid") ?? "";
    setEid(id);
    if (!id) {
      setLoadErr("Lien invalide (identifiant manquant).");
      return;
    }
    fetch(`/api/reschedule?eid=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setInfo(d);
        else setLoadErr(d.error ?? "Rendez-vous introuvable.");
      })
      .catch(() => setLoadErr("Erreur de chargement."));
  }, []);

  async function submit() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/reschedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eid, date, time }),
      });
      const d = await res.json();
      if (d.ok) setDone({ startDateTime: d.startDateTime });
      else setErr(d.error ?? "Erreur.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setLoading(false);
    }
  }

  const current = info?.startDateTime
    ? new Date(info.startDateTime).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        dateStyle: "full",
        timeStyle: "short",
      })
    : null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#eceef1",
        fontFamily: "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif",
        color: "#232323",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 10px 15px rgba(26,39,58,0.12)",
        }}
      >
        <div style={{ background: "#fff", textAlign: "center", padding: "26px 24px 18px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Simplicicar" width={230} style={{ width: 230, maxWidth: "78%", height: "auto" }} />
        </div>
        <div style={{ height: 4, background: PINK }} />

        <div style={{ padding: "30px 28px" }}>
          <h1
            style={{
              margin: "0 0 18px",
              fontFamily: "'Cabin','Manrope',Arial,sans-serif",
              fontSize: 22,
              fontWeight: 700,
              color: NAVY,
              textTransform: "uppercase",
            }}
          >
            Reprogrammer le rendez-vous
          </h1>

          {loadErr && <p style={{ color: "#dc2626" }}>❌ {loadErr}</p>}

          {!loadErr && !done && (
            <>
              {current && (
                <p style={{ color: "#6b7280", marginTop: 0 }}>
                  Rendez-vous actuel : <strong style={{ color: "#232323" }}>{current}</strong>
                  {info?.firstName ? ` — ${info.firstName}` : ""}
                </p>
              )}
              <p style={{ marginBottom: 16 }}>Choisissez un nouveau créneau :</p>

              <SlotPicker value={{ date, time }} onChange={(v) => { setDate(v.date); setTime(v.time); }} />

              {err && <p style={{ color: "#dc2626", marginTop: 14 }}>❌ {err}</p>}

              <button
                onClick={submit}
                disabled={loading || !date || !time}
                style={{
                  marginTop: 22,
                  width: "100%",
                  padding: "14px 18px",
                  fontSize: 15,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "none",
                  cursor: loading || !date || !time ? "not-allowed" : "pointer",
                  background: loading || !date || !time ? "#cbd5e1" : PINK,
                  color: "#fff",
                  fontFamily: "inherit",
                }}
              >
                {loading ? "Mise à jour…" : "Confirmer la nouvelle date"}
              </button>
            </>
          )}

          {done && (
            <div
              style={{
                padding: 18,
                borderRadius: 10,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                color: "#166534",
              }}
            >
              <strong>✅ Rendez-vous reprogrammé</strong>
              <p style={{ margin: "8px 0 0" }}>
                Nouvelle date :{" "}
                {new Date(done.startDateTime).toLocaleString("fr-FR", {
                  timeZone: "Europe/Paris",
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </p>
              <p style={{ margin: "8px 0 0", fontSize: 13 }}>Un e-mail de confirmation vous a été envoyé.</p>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
