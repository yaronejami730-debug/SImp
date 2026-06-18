"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SlotPicker from "@/components/SlotPicker";
import VehiclePicker from "@/components/VehiclePicker";
import AddressInput from "@/components/AddressInput";
import { authHeaders } from "@/lib/client";
import { COMMERCIAUX } from "@/lib/commerciaux";

const NAVY = "#1a273a";
const SKY = "#38bdf8";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

type Status = "prospect" | "booked" | "confirmed" | "done" | "cancelled";
type Appt = {
  id: number; teleprospecteur: string; commercial: string; civility: string;
  first_name: string; last_name: string; email: string; phone: string;
  car_brand: string; car_model: string; immatriculation: string; address: string;
  start_datetime: string; notes: string; status: Status; google_event_id: string;
};

const STATUSES: { key: Status; label: string; color: string }[] = [
  { key: "prospect", label: "Prospect", color: "#6b7280" },
  { key: "booked", label: "RDV pris", color: SKY },
  { key: "confirmed", label: "Confirmé", color: "#7c3aed" },
  { key: "done", label: "Réalisé", color: "#16a34a" },
  { key: "cancelled", label: "Annulé", color: "#dc2626" },
];
const stConf = (s: Status) => STATUSES.find((x) => x.key === s)!;

const inp: React.CSSProperties = { width: "100%", padding: 11, fontSize: 14, borderRadius: 8, border: `1.5px solid ${LINE}`, boxSizing: "border-box", fontFamily: "inherit" };
const lab: React.CSSProperties = { display: "block", fontSize: 12.5, color: MUTED, marginBottom: 5 };

const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const EMPTY = { civility: "Monsieur", firstName: "", lastName: "", email: "", phone: "", carBrand: "", carModel: "", immatriculation: "", address: "", date: "", time: "", notes: "", commercial: "Jeremy Bonamy" };

function Deplacement() {
  const [form, setForm] = useState({ ...EMPTY });
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showForm, setShowForm] = useState(true);
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/mobile", { headers: authHeaders() });
      const d = await r.json();
      if (d.ok) setAppts(d.appointments);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Pré-remplissage depuis un rappel (bouton "RDV déplacement").
  useEffect(() => {
    const phone = sessionStorage.getItem("prefillPhone");
    const fn = sessionStorage.getItem("prefillFirstName");
    const ln = sessionStorage.getItem("prefillLastName");
    const em = sessionStorage.getItem("prefillEmail");
    if (phone || fn || ln || em) {
      setForm((f) => ({ ...f, phone: phone ?? f.phone, firstName: fn ?? f.firstName, lastName: ln ?? f.lastName, email: em ?? f.email }));
      ["prefillPhone", "prefillFirstName", "prefillLastName", "prefillEmail", "prefillListingUrl"].forEach((k) => sessionStorage.removeItem(k));
      setShowForm(true);
    }
  }, []);

  const ready = form.firstName.trim() && form.address.trim() && form.date && form.time;

  async function create() {
    setBusy(true); setFlash(null);
    try {
      const r = await fetch("/api/mobile", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(form) });
      const d = await r.json();
      if (d.ok) {
        setFlash({ ok: true, msg: d.synced ? "✅ RDV déplacement créé + synchronisé Google" : "✅ RDV déplacement créé (Google non configuré)" });
        setForm({ ...EMPTY });
        load();
      } else setFlash({ ok: false, msg: d.error ?? "Erreur" });
    } finally { setBusy(false); }
  }

  async function setStatus(id: number, status: Status) {
    setAppts((l) => l.map((a) => (a.id === id ? { ...a, status } : a)));
    await fetch(`/api/mobile/${id}`, { method: "PATCH", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ status }) });
  }
  async function del(id: number) {
    if (!confirm("Supprimer ce RDV déplacement ?")) return;
    setAppts((l) => l.filter((a) => a.id !== id));
    await fetch(`/api/mobile/${id}`, { method: "DELETE", headers: authHeaders() });
  }

  const active = appts.filter((a) => a.status !== "cancelled" && a.status !== "done");

  // ── Tournée ──
  const [tourDate, setTourDate] = useState("");
  const [tourBusy, setTourBusy] = useState(false);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [tour, setTour] = useState<{ count: number; totalKm: number; stops: { rank: number; client: string; address: string; time: string; vehicle: string; legKm: number | null; geocoded: boolean }[] } | null>(null);

  function locate() {
    if (!navigator.geolocation) { setFlash({ ok: false, msg: "Géolocalisation non supportée." }); return; }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocBusy(false); setFlash({ ok: true, msg: "📍 Position récupérée — départ depuis ta position." }); },
      () => { setLocBusy(false); setFlash({ ok: false, msg: "Localisation refusée." }); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function loadTournee() {
    if (!tourDate) return;
    setTourBusy(true); setTour(null);
    try {
      const pos = myPos ? `&lat=${myPos.lat}&lng=${myPos.lng}` : "";
      const r = await fetch(`/api/mobile/tournee?date=${tourDate}${pos}`, { headers: authHeaders() });
      const d = await r.json();
      if (d.ok) setTour(d); else setFlash({ ok: false, msg: d.error ?? "Erreur" });
    } finally { setTourBusy(false); }
  }
  const origin = myPos ? `${myPos.lat},${myPos.lng}` : "3 rue Bélidor 75017 Paris";
  const mapsUrl = tour && tour.stops.length
    ? "https://www.google.com/maps/dir/" + [origin, ...tour.stops.map((s) => s.address)].map((a) => encodeURIComponent(a)).join("/")
    : "";

  return (
    <>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>🚗 Rendez-vous en déplacement</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Module séparé (Jérémy Bonamy). Agenda &amp; disponibilités indépendants des RDV physiques. Synchro Google bleu ciel.</p>
      </header>

      {flash && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: flash.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${flash.ok ? "#bbf7d0" : "#fecaca"}`, fontSize: 13, color: flash.ok ? "#166534" : "#dc2626" }}>{flash.msg}</div>}

      {/* Formulaire */}
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <button onClick={() => setShowForm((s) => !s)} style={{ background: "none", border: "none", color: SKY, fontSize: 14, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: showForm ? 14 : 0 }}>
          {showForm ? "▲ " : "▼ "}Nouveau rendez-vous déplacement
        </button>
        {showForm && (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={lab}>Civilité</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["Monsieur", "Madame"].map((c) => (
                  <button key={c} type="button" onClick={() => set("civility", c)} style={{ flex: 1, padding: 9, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: form.civility === c ? `1.5px solid ${SKY}` : `1.5px solid ${LINE}`, background: form.civility === c ? SKY : "#fff", color: form.civility === c ? "#fff" : MUTED }}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={lab}>Prénom</label><input style={inp} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></div>
              <div><label style={lab}>Nom</label><input style={inp} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={lab}>E-mail</label><input style={inp} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
              <div><label style={lab}>Téléphone</label><input style={inp} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            </div>
            <div><label style={lab}>Véhicule</label><VehiclePicker brand={form.carBrand} model={form.carModel} finish="" onChange={(b, m) => setForm((f) => ({ ...f, carBrand: b, carModel: m }))} /></div>
            <div><label style={lab}>Immatriculation</label><input style={inp} value={form.immatriculation} onChange={(e) => set("immatriculation", e.target.value.toUpperCase())} placeholder="AA-123-BB" /></div>
            <div><label style={lab}>Adresse complète du client (déplacement)</label><AddressInput value={form.address} onChange={(v) => set("address", v)} placeholder="Saisis l'adresse, des suggestions apparaissent…" style={inp} /></div>
            <div><label style={lab}>Commercial (réalise le RDV)</label>
              <select style={inp} value={form.commercial} onChange={(e) => set("commercial", e.target.value)}>
                {["Jeremy Bonamy", ...COMMERCIAUX].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={lab}>Créneau (disponibilité déplacement)</label><SlotPicker value={{ date: form.date, time: form.time }} onChange={(v) => setForm((f) => ({ ...f, date: v.date, time: v.time }))} endpoint="/api/mobile/availability" /></div>
            <div><label style={lab}>Notes</label><textarea style={{ ...inp, resize: "vertical" }} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
            <button onClick={create} disabled={busy || !ready} style={{ padding: "13px", borderRadius: 8, border: "none", fontSize: 15, fontWeight: 700, cursor: busy || !ready ? "not-allowed" : "pointer", background: busy || !ready ? "#cbd5e1" : SKY, color: "#fff" }}>
              {busy ? "Création…" : "Créer le RDV déplacement"}
            </button>
          </div>
        )}
      </div>

      {/* Tournée */}
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 6px", fontFamily: "'Cabin',sans-serif", fontSize: 13, fontWeight: 700, color: SKY, textTransform: "uppercase", letterSpacing: 0.6 }}>🗺️ Tournée du jour</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: MUTED }}>Ordre de passage optimisé (trajet le plus court depuis l&apos;agence).</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <input type="date" value={tourDate} onChange={(e) => setTourDate(e.target.value)} style={{ ...inp, width: "auto", flex: "1 1 160px" }} />
          <button onClick={loadTournee} disabled={tourBusy || !tourDate} style={{ padding: "11px 16px", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 700, cursor: tourBusy || !tourDate ? "default" : "pointer", background: tourBusy || !tourDate ? "#cbd5e1" : SKY, color: "#fff" }}>
            {tourBusy ? "Calcul…" : "Calculer"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={locate} disabled={locBusy} style={{ padding: "9px 14px", borderRadius: 8, border: `1.5px solid ${SKY}`, background: myPos ? SKY : "#fff", color: myPos ? "#fff" : SKY, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {locBusy ? "Localisation…" : myPos ? "📍 Position OK — recalcule" : "📍 Me localiser (départ d'ici)"}
          </button>
          <span style={{ fontSize: 12, color: MUTED }}>{myPos ? "Départ = ta position actuelle" : "Sinon départ = agence"}</span>
        </div>
        {tour && (tour.stops.length === 0 ? <div style={{ fontSize: 13, color: "#9aa6b8" }}>Aucun RDV déplacement ce jour.</div> : (
          <>
            <div style={{ fontSize: 13, color: NAVY, marginBottom: 10 }}><strong>{tour.count}</strong> RDV · ~<strong>{tour.totalKm} km</strong> de trajet · départ {myPos ? "ta position" : "agence"}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {tour.stops.map((s) => (
                <div key={s.rank} style={{ display: "flex", gap: 10, alignItems: "center", border: `1px solid ${LINE}`, borderRadius: 9, padding: "9px 11px" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 13, background: SKY, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{s.rank}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>{s.client} <span style={{ fontWeight: 400, color: MUTED }}>· {new Date(s.time).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })}</span></div>
                    <div style={{ fontSize: 12, color: MUTED }}>📍 {s.address || "—"} {!s.geocoded && <span style={{ color: "#ca8a04" }}>(adresse non localisée)</span>}</div>
                  </div>
                  {s.legKm != null && <div style={{ fontSize: 11.5, color: "#9aa6b8", flexShrink: 0 }}>+{s.legKm} km</div>}
                </div>
              ))}
            </div>
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12, padding: "10px 14px", borderRadius: 8, background: NAVY, color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>🧭 Ouvrir l&apos;itinéraire dans Google Maps</a>}
          </>
        ))}
      </div>

      {/* Mini CRM */}
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <h2 style={{ margin: "0 0 12px", fontFamily: "'Cabin',sans-serif", fontSize: 13, fontWeight: 700, color: SKY, textTransform: "uppercase", letterSpacing: 0.6 }}>CRM déplacement ({active.length} actifs)</h2>
        {loading ? <div style={{ color: MUTED, fontSize: 13 }}>Chargement…</div>
          : appts.length === 0 ? <div style={{ color: "#9aa6b8", fontSize: 13 }}>Aucun RDV déplacement.</div>
          : (
            <div style={{ display: "grid", gap: 10 }}>
              {appts.map((a) => {
                const c = stConf(a.status);
                return (
                  <div key={a.id} style={{ border: `1px solid ${LINE}`, borderLeft: `4px solid ${c.color}`, borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{a.first_name} {a.last_name} <span style={{ fontSize: 12, fontWeight: 600, color: c.color }}>· {c.label}</span></div>
                        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>📅 {fmt(a.start_datetime)}</div>
                        <div style={{ fontSize: 12.5, color: MUTED }}>📍 {a.address || "—"}</div>
                        <div style={{ fontSize: 12, color: "#9aa6b8", marginTop: 2 }}>{[a.car_brand, a.car_model, a.immatriculation].filter(Boolean).join(" · ") || "—"} · {a.phone || "—"} · {a.commercial}</div>
                        {a.notes && <div style={{ fontSize: 12, color: "#475569", marginTop: 4, whiteSpace: "pre-wrap" }}>📝 {a.notes}</div>}
                      </div>
                      <button onClick={() => del(a.id)} title="Supprimer" style={{ border: "none", background: "#fff", color: "#dc2626", cursor: "pointer", fontSize: 15, flexShrink: 0 }}>🗑️</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
                      {STATUSES.map((st) => (
                        <button key={st.key} onClick={() => setStatus(a.id, st.key)} disabled={a.status === st.key}
                          style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 9px", borderRadius: 7, cursor: a.status === st.key ? "default" : "pointer",
                            border: `1px solid ${a.status === st.key ? st.color : LINE}`, background: a.status === st.key ? st.color : "#fff", color: a.status === st.key ? "#fff" : MUTED }}>
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Shell active="deplacement">
      <Deplacement />
    </Shell>
  );
}
