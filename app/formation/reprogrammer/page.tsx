"use client";

import { useEffect, useState } from "react";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

type Slot = { id: number; date: string; startTime: string; endTime: string; type: "individuel" | "groupe"; partnerName: string };

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export default function Page() {
  const [rid, setRid] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [firstName, setFirstName] = useState("");
  const [currentSlot, setCurrentSlot] = useState<Slot | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [done, setDone] = useState<Slot | null>(null);

  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("rid") || 0);
    if (!id) { setErr("Lien invalide."); setLoading(false); return; }
    setRid(id);
    (async () => {
      try {
        const r = await fetch(`/api/formation/reschedule?rid=${id}`);
        const d = await r.json();
        if (!d.ok) { setErr(d.error ?? "Erreur."); return; }
        setFirstName(d.registration.firstName);
        setCurrentSlot(d.currentSlot);
        setSlots(d.slots);
      } catch (e) { setErr(e instanceof Error ? e.message : "Erreur."); }
      finally { setLoading(false); }
    })();
  }, []);

  async function choisir(slot: Slot) {
    if (!rid) return;
    setBusyId(slot.id); setErr("");
    try {
      const r = await fetch("/api/formation/reschedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rid, newSlotId: slot.id }) });
      const d = await r.json();
      if (!d.ok) { setErr(d.error ?? "Erreur."); return; }
      setDone(d.slot);
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur."); }
    finally { setBusyId(null); }
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px", fontFamily: "'Manrope',Arial,sans-serif", color: NAVY }}>
      <h1 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Reprogrammer votre formation</h1>

      {loading && <p style={{ color: MUTED }}>Chargement…</p>}
      {!loading && err && !done && <p style={{ color: "#dc2626", fontWeight: 600 }}>{err}</p>}

      {!loading && !err && done && (
        <div style={{ padding: 16, borderRadius: 10, background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
          <p style={{ margin: 0, color: "#065f46", fontWeight: 700 }}>✅ Formation reprogrammée</p>
          <p style={{ margin: "8px 0 0", fontSize: 14 }}>Nouveau créneau : {fmtDate(done.date)} de {done.startTime} à {done.endTime}.</p>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: MUTED }}>Un e-mail de confirmation vous a été renvoyé.</p>
        </div>
      )}

      {!loading && !err && !done && (
        <>
          {firstName && <p style={{ color: MUTED, marginBottom: 4 }}>Bonjour {firstName},</p>}
          {currentSlot && (
            <p style={{ marginBottom: 20, fontSize: 14 }}>
              Votre créneau actuel : <strong>{fmtDate(currentSlot.date)} de {currentSlot.startTime} à {currentSlot.endTime}</strong> — {currentSlot.partnerName}.
            </p>
          )}
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Choisissez un nouveau créneau :</p>
          {slots.length === 0 && <p style={{ color: MUTED, fontSize: 14 }}>Aucun autre créneau disponible pour l&apos;instant — contactez-nous directement.</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {slots.map((slot) => (
              <button key={slot.id} onClick={() => choisir(slot)} disabled={busyId === slot.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${LINE}`, background: "#fff", cursor: busyId === slot.id ? "wait" : "pointer", textAlign: "left" }}>
                <span>
                  <strong style={{ display: "block", fontSize: 14 }}>{fmtDate(slot.date)}</strong>
                  <span style={{ fontSize: 13, color: MUTED }}>{slot.startTime}–{slot.endTime} · {slot.type === "groupe" ? "Groupe" : "Individuel"} · {slot.partnerName}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: PINK }}>{busyId === slot.id ? "…" : "Choisir →"}</span>
              </button>
            ))}
          </div>
          {err && <p style={{ color: "#dc2626", marginTop: 12, fontSize: 13.5 }}>{err}</p>}
        </>
      )}
    </div>
  );
}
