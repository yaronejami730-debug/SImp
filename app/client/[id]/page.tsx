"use client";

import { use, useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import VehiclePicker from "@/components/VehiclePicker";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const BASE_COMMISSION = 50;
const NEGO_RATE = 0.1;

type Sign = "" | "signed" | "thinking" | "unsigned";
type Appt = {
  id: string; startDateTime: string | null; firstName: string; lastName: string;
  civility: string; email: string; phone: string; platform: string; listingUrl: string;
  carBrand: string; carModel: string; carFinish: string; location: string;
  present: boolean; signStatus: Sign; negotiation: number; owner: string;
  createdAt: string | null; history: { t: string; at: string; info?: string }[];
  parkingRequested: boolean; parkingSent: boolean; cancelled: boolean;
  reminder24Sent: boolean; reminder2Sent: boolean;
};

const histLabel = (t: string) =>
  ({
    created: "RDV créé + mail de confirmation",
    rescheduled: "RDV reprogrammé",
    reminder_24h: "Rappel 24h envoyé",
    reminder_2h: "Rappel 2h envoyé",
    parking_requested: "Place de parking réservée",
    parking_cancelled: "Réservation parking annulée",
    parking_sent: "Mail parking envoyé au client",
    cancelled: "RDV annulé",
  } as Record<string, string>)[t] ?? t;

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const commission = (a: Appt) => (a.signStatus === "signed" ? BASE_COMMISSION + NEGO_RATE * (a.negotiation || 0) : 0);

function ClientPage({ id }: { id: string }) {
  const [a, setA] = useState<Appt | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [editVehicle, setEditVehicle] = useState(false);
  const [draftBrand, setDraftBrand] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [draftFinish, setDraftFinish] = useState("");
  const [editContact, setEditContact] = useState(false);
  const [draftPhone, setDraftPhone] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [photos, setPhotos] = useState<{ path: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`/api/client/${encodeURIComponent(id)}`, { headers: authHeaders() });
      const d = await r.json();
      if (d.ok) setA(d.appointment);
      else setErr(d.error ?? "Erreur");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadPhotos = useCallback(async () => {
    try {
      const r = await fetch(`/api/client/${encodeURIComponent(id)}/photos`, { headers: authHeaders() });
      const d = await r.json();
      if (d.ok) setPhotos(d.photos);
    } catch {}
  }, [id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  async function uploadPhoto(file: File) {
    setUploading(true); setFlash(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/client/${encodeURIComponent(id)}/photos`, {
        method: "POST", headers: authHeaders(), body: fd,
      });
      const d = await r.json();
      if (d.ok) { setPhotos((p) => [...p, d.photo]); setFlash({ kind: "ok", msg: "Photo ajoutée" }); }
      else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } catch (e) {
      setFlash({ kind: "err", msg: e instanceof Error ? e.message : "Erreur" });
    } finally { setUploading(false); }
  }

  async function removePhoto(path: string) {
    if (!confirm("Supprimer cette photo ?")) return;
    try {
      const r = await fetch(`/api/client/${encodeURIComponent(id)}/photos?path=${encodeURIComponent(path)}`, {
        method: "DELETE", headers: authHeaders(),
      });
      const d = await r.json();
      if (d.ok) setPhotos((ps) => ps.filter((p) => p.path !== path));
      else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } catch (e) {
      setFlash({ kind: "err", msg: e instanceof Error ? e.message : "Erreur" });
    }
  }

  async function act(action: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(action); setFlash(null);
    try {
      const r = await fetch(`/api/client/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (d.ok) {
        setFlash({ kind: "ok", msg: d.message ?? "OK" });
        load();
      } else {
        setFlash({ kind: "err", msg: d.error ?? "Erreur" });
      }
    } catch (e) {
      setFlash({ kind: "err", msg: e instanceof Error ? e.message : "Erreur" });
    } finally { setBusy(""); }
  }

  async function saveStatus(patch: { present?: boolean; signStatus?: Sign; negotiation?: number }) {
    if (!a) return;
    setA({ ...a, ...patch });
    await fetch("/api/status", {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ eid: a.id, ...patch }),
    }).catch(() => {});
  }

  async function toggleParking() {
    if (!a) return;
    const next = !a.parkingRequested;
    if (next && !confirm(`Envoyer le mail de réservation parking à ${a.firstName} ${a.lastName} (${a.email}) ?`)) return;
    setBusy("parking");
    try {
      const r = await fetch("/api/parking", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ eid: a.id, requested: next }),
      });
      const d = await r.json();
      if (d.ok) {
        setFlash({ kind: "ok", msg: next ? (d.emailSent ? `✅ Mail parking envoyé à ${a.email}` : "Réservation OK, mail non envoyé") : "Réservation parking annulée" });
        load();
      } else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  async function saveContact() {
    if (!a) return;
    setBusy("contact");
    try {
      const r = await fetch(`/api/client/${encodeURIComponent(a.id)}`, {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ phone: draftPhone, email: draftEmail }),
      });
      const d = await r.json();
      if (d.ok) {
        setA({ ...a, phone: draftPhone, email: draftEmail });
        setEditContact(false);
        setFlash({ kind: "ok", msg: "Contact mis à jour" });
      } else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  async function saveVehicle() {
    if (!a) return;
    setBusy("vehicle");
    try {
      const r = await fetch(`/api/client/${encodeURIComponent(a.id)}`, {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ carBrand: draftBrand, carModel: draftModel, carFinish: draftFinish }),
      });
      const d = await r.json();
      if (d.ok) {
        setA({ ...a, carBrand: draftBrand, carModel: draftModel, carFinish: draftFinish });
        setEditVehicle(false);
        setFlash({ kind: "ok", msg: "Véhicule mis à jour" });
      } else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  async function cancelRdv() {
    if (!a) return;
    if (!confirm(`Annuler définitivement le RDV de ${a.firstName} ${a.lastName} ? Un mail d'annulation sera envoyé au client.`)) return;
    setBusy("cancel");
    try {
      const r = await fetch("/api/cancel", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ eid: a.id }),
      });
      const d = await r.json();
      if (d.ok) { setFlash({ kind: "ok", msg: "RDV annulé" }); load(); }
      else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  if (loading) return <div style={{ color: "#6b7280" }}>Chargement…</div>;
  if (err) return <div style={{ color: "#dc2626" }}>❌ {err} <a href="/agenda" style={{ color: PINK }}>Retour</a></div>;
  if (!a) return null;

  const fmtLong = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const vehicle = [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" ") || "—";

  const sectionTitle: React.CSSProperties = { fontFamily: "'Cabin',sans-serif", fontSize: 12, color: PINK, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 12px", fontWeight: 700 };
  const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 14 };
  const actionRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10 };

  const actionBtn = (label: string, sub: string, action: string, opts?: { color?: string; outline?: boolean; disabled?: boolean; onClick?: () => void; confirmMsg?: string }) => {
    const color = opts?.color ?? NAVY;
    const bg = opts?.outline ? "#fff" : color;
    const fg = opts?.outline ? color : "#fff";
    const isBusy = busy === action;
    const click = opts?.onClick ?? (() => act(action, opts?.confirmMsg));
    return (
      <button
        onClick={click}
        disabled={isBusy || opts?.disabled}
        title={sub}
        style={{
          flex: "1 1 calc(50% - 5px)", minWidth: 160, padding: "12px 14px", borderRadius: 8,
          background: opts?.disabled ? "#f0f1f3" : bg, color: opts?.disabled ? "#9aa6b8" : fg,
          border: `1.5px solid ${opts?.disabled ? "#e5e7eb" : color}`,
          fontSize: 14, fontWeight: 600, cursor: isBusy || opts?.disabled ? "default" : "pointer",
          textAlign: "left", lineHeight: 1.3,
        }}
      >
        <div>{isBusy ? "…" : label}</div>
        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>{sub}</div>
      </button>
    );
  };

  const signBtn = (val: Sign, label: string, color: string) => {
    const locked = !!a.signStatus;
    const active = a.signStatus === val;
    return (
      <button
        onClick={() => { if (locked) return; saveStatus({ signStatus: val }); }}
        disabled={locked && !active}
        style={{
          flex: 1, padding: "10px 6px", fontSize: 13, fontWeight: 600, borderRadius: 8,
          cursor: locked ? "default" : "pointer",
          border: active ? `1.5px solid ${color}` : "1.5px solid #e5e7eb",
          background: active ? color : "#fff",
          color: active ? "#fff" : "#6b7280",
          opacity: locked && !active ? 0.45 : 1,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <a href="/agenda" style={{ color: PINK, fontSize: 14, textDecoration: "none", fontWeight: 600 }}>← Retour à l&apos;agenda</a>
      </div>

      {/* === EN-TÊTE CLIENT === */}
      <div style={card}>
        {a.cancelled && <div style={{ display: "inline-block", padding: "3px 9px", borderRadius: 6, background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>RDV ANNULÉ</div>}
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, color: NAVY }}>{a.civility} {a.firstName} {a.lastName}</h1>
        {!editContact ? (
          <>
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 14 }}>
              <div><div style={{ color: "#9aa6b8", fontSize: 11, textTransform: "uppercase" }}>Téléphone</div><a href={`tel:${a.phone}`} style={{ color: NAVY, textDecoration: "none", fontWeight: 600 }}>{a.phone || "—"}</a></div>
              <div><div style={{ color: "#9aa6b8", fontSize: 11, textTransform: "uppercase" }}>E-mail</div><a href={`mailto:${a.email}`} style={{ color: NAVY, textDecoration: "none", fontWeight: 600, wordBreak: "break-all" }}>{a.email || "—"}</a></div>
              <div><div style={{ color: "#9aa6b8", fontSize: 11, textTransform: "uppercase" }}>Plateforme</div><div>{a.platform || "—"}</div></div>
              <div><div style={{ color: "#9aa6b8", fontSize: 11, textTransform: "uppercase" }}>Date du RDV</div><div style={{ fontWeight: 600, color: PINK }}>{a.startDateTime ? fmtLong(a.startDateTime) : "—"}</div></div>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => { setDraftPhone(a.phone); setDraftEmail(a.email); setEditContact(true); }} style={{ padding: "7px 12px", borderRadius: 7, background: "#fff", color: PINK, border: `1.5px solid ${PINK}`, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                ✏️ Modifier téléphone / e-mail
              </button>
              {a.listingUrl && <a href={a.listingUrl} target="_blank" rel="noreferrer" style={{ color: PINK, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>🔗 Voir l&apos;annonce</a>}
            </div>
          </>
        ) : (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Corrige le téléphone ou l&apos;e-mail si erreur de saisie. Les futurs rappels utiliseront les nouvelles coordonnées.</p>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Téléphone</label>
              <input value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} type="tel" placeholder="06 12 34 56 78" style={{ width: "100%", padding: 11, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>E-mail</label>
              <input value={draftEmail} onChange={(e) => setDraftEmail(e.target.value)} type="email" placeholder="client@email.com" style={{ width: "100%", padding: 11, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveContact} disabled={busy === "contact"} style={{ flex: 1, padding: "10px 14px", borderRadius: 7, background: PINK, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                {busy === "contact" ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button onClick={() => setEditContact(false)} style={{ padding: "10px 14px", borderRadius: 7, background: "#fff", color: "#6b7280", border: "1.5px solid #e5e7eb", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
            </div>
          </div>
        )}
      </div>

      {/* === VÉHICULE === */}
      <div style={card}>
        <h2 style={sectionTitle}>🚗 Véhicule</h2>
        {!editVehicle ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 16, color: NAVY, fontWeight: 600 }}>
              {vehicle === "—" ? <span style={{ color: "#9aa6b8", fontStyle: "italic" }}>Non renseigné (annonce supprimée ?)</span> : vehicle}
            </div>
            <button onClick={() => { setDraftBrand(a.carBrand); setDraftModel(a.carModel); setDraftFinish(a.carFinish); setEditVehicle(true); }} style={{ padding: "8px 14px", borderRadius: 7, background: "#fff", color: PINK, border: `1.5px solid ${PINK}`, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ✏️ {vehicle === "—" ? "Renseigner" : "Modifier"}
            </button>
          </div>
        ) : (
          <>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>Sélectionne la marque + modèle. Choisis &laquo; Autre… &raquo; pour saisir librement.</p>
            <VehiclePicker brand={draftBrand} model={draftModel} finish={draftFinish} onChange={(b, m, f) => { setDraftBrand(b); setDraftModel(m); setDraftFinish(f ?? ""); }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={saveVehicle} disabled={busy === "vehicle"} style={{ flex: 1, padding: "10px 14px", borderRadius: 7, background: PINK, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                {busy === "vehicle" ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button onClick={() => setEditVehicle(false)} style={{ padding: "10px 14px", borderRadius: 7, background: "#fff", color: "#6b7280", border: "1.5px solid #e5e7eb", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Annuler
              </button>
            </div>
          </>
        )}
      </div>

      {flash && (
        <div style={{ ...card, background: flash.kind === "ok" ? "#f0fdf4" : "#fef2f2", borderColor: flash.kind === "ok" ? "#bbf7d0" : "#fecaca", color: flash.kind === "ok" ? "#166534" : "#dc2626", fontWeight: 600, fontSize: 14 }}>
          {flash.kind === "ok" ? "✅ " : "❌ "}{flash.msg}
        </div>
      )}

      {/* === PHOTOS === */}
      <div style={card}>
        <h2 style={sectionTitle}>📷 Photos du véhicule</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>Sauvegarde les photos de l&apos;annonce / du véhicule avant que le lien soit supprimé.</p>
        <label style={{ display: "inline-block", padding: "10px 14px", borderRadius: 7, background: PINK, color: "#fff", fontSize: 14, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.6 : 1 }}>
          {uploading ? "Upload…" : "📤 Ajouter une photo"}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.currentTarget.value = ""; }}
            style={{ display: "none" }}
          />
        </label>
        {photos.length > 0 && (
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
            {photos.map((p) => (
              <div key={p.path} style={{ position: "relative", paddingTop: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /></a>
                <button onClick={() => removePhoto(p.path)} title="Supprimer" style={{ position: "absolute", top: 4, right: 4, padding: "3px 7px", borderRadius: 6, background: "rgba(220,38,38,0.85)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* === COMMUNICATION === */}
      <div style={card}>
        <h2 style={sectionTitle}>✉️ Communication client</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>Renvoyer manuellement un mail ou un SMS au client. Utile si le client dit ne pas avoir reçu, ou pour une relance rapide.</p>
        <div style={actionRow}>
          {actionBtn("📧 Renvoyer le mail de confirmation", `Renvoyé à ${a.email || "—"}`, "resend_confirmation_mail", { outline: true, disabled: !a.email || a.cancelled })}
          {actionBtn("📱 Renvoyer le SMS de confirmation", `Renvoyé au ${a.phone || "—"}`, "resend_confirmation_sms", { outline: true, disabled: !a.phone || a.cancelled })}
          {actionBtn(
            a.reminder24Sent ? "✓ Rappel 24h déjà envoyé — renvoyer" : "⏰ Envoyer le rappel 24h maintenant",
            "Mail rappel (envoyé automatiquement 24h avant)",
            "send_reminder_24h",
            { outline: true, color: PINK, disabled: !a.email || a.cancelled }
          )}
          {actionBtn(
            a.reminder2Sent ? "✓ Rappel 2h déjà envoyé — renvoyer" : "⏰ Envoyer le rappel 2h maintenant",
            "Mail rappel (envoyé automatiquement 2h avant)",
            "send_reminder_2h",
            { outline: true, color: PINK, disabled: !a.email || a.cancelled }
          )}
        </div>
      </div>

      {/* === LOGISTIQUE === */}
      <div style={card}>
        <h2 style={sectionTitle}>🚗 Logistique</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>Réserver une place de parking, changer le créneau du RDV.</p>
        <div style={actionRow}>
          {actionBtn(
            a.parkingSent ? "✓ Mail parking envoyé" : a.parkingRequested ? "✓ Parking réservé" : "🅿️ Réserver parking + envoyer mail",
            a.parkingRequested ? "Cliquer pour annuler la réservation" : "Envoie un mail avec les infos parking immédiatement",
            "parking",
            { onClick: toggleParking, color: a.parkingRequested ? PINK : NAVY, outline: !a.parkingRequested }
          )}
          {a.cancelled
            ? actionBtn("📅 Reprogrammer", "RDV annulé", "noop", { disabled: true })
            : <a href={`/reschedule?eid=${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer" title="Ouvre la page pour choisir un nouveau créneau (envoie un mail de reprogrammation au client)" style={{ flex: "1 1 calc(50% - 5px)", minWidth: 160, padding: "12px 14px", borderRadius: 8, background: NAVY, color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600, textAlign: "left", lineHeight: 1.3, border: `1.5px solid ${NAVY}` }}>
                <div>📅 Reprogrammer le RDV</div>
                <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>Page créneaux → mail de reprogrammation</div>
              </a>
          }
        </div>
      </div>

      {/* === STATUT === */}
      <div style={card}>
        <h2 style={sectionTitle}>📊 Statut & commission</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>À remplir après le RDV pour suivre le résultat et calculer ta commission.</p>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={a.present} onChange={(e) => saveStatus({ present: e.target.checked })} /> Client présent au RDV
        </label>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {signBtn("signed", "✅ A signé", "#16a34a")}
          {signBtn("thinking", "🤔 Réfléchit", "#ca8a04")}
          {signBtn("unsigned", "❌ Pas signé", "#dc2626")}
        </div>
        {a.signStatus === "signed" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Montant négocié €</span>
            <input
              type="number"
              value={a.negotiation || ""}
              onChange={(e) => setA({ ...a, negotiation: Number(e.target.value) })}
              onBlur={(e) => saveStatus({ negotiation: Number(e.target.value) })}
              placeholder="0"
              style={{ width: 120, padding: "8px 10px", fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb" }}
            />
            <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 700 }}>= {eur(commission(a))} <span style={{ color: "#9aa6b8", fontWeight: 400 }}>(50€ + 10%)</span></span>
          </div>
        )}
      </div>

      {/* === HISTORIQUE === */}
      {a.history.length > 0 && (
        <div style={card}>
          <h2 style={sectionTitle}>📜 Historique</h2>
          <div style={{ borderLeft: `2px solid ${PINK}`, paddingLeft: 12 }}>
            {a.history.slice().reverse().map((h, i) => (
              <div key={i} style={{ fontSize: 13, color: "#6b7280", padding: "4px 0" }}>
                <span style={{ color: NAVY, fontWeight: 600 }}>{histLabel(h.t)}</span>
                {h.t === "rescheduled" && h.info ? ` → ${new Date(h.info).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}` : ""}
                {" · "}
                {new Date(h.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === ZONE DANGEREUSE === */}
      {!a.cancelled && (
        <div style={{ ...card, borderColor: "#fecaca", background: "#fff" }}>
          <h2 style={{ ...sectionTitle, color: "#dc2626" }}>⚠️ Zone d&apos;annulation</h2>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>Annule le RDV et envoie un mail d&apos;annulation au client. Action réversible (le RDV reste visible, marqué annulé).</p>
          <button onClick={cancelRdv} disabled={busy === "cancel"} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, background: "#fff", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {busy === "cancel" ? "Annulation…" : "❌ Annuler le RDV (envoie un mail au client)"}
          </button>
        </div>
      )}
    </>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Shell active="agenda"><ClientPage id={id} /></Shell>;
}
