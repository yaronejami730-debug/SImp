"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders, getUser } from "@/lib/client";
import { extractUrl } from "@/lib/parse";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const ACCENT = "#24B9D7";

type Reminder = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  listing_url: string;
  note: string;
  remind_at: string;
  status: string;
  nrp_count: number;
  owner: string;
  lead_id: number | null;
  client_email?: string;
  created_at: string;
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: 12, fontSize: 15, borderRadius: 8,
  border: "1.5px solid #e5e7eb", background: "#fff", color: "#232323", boxSizing: "border-box", fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, color: "#6b7280", marginBottom: 6 };

const waPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("33")) return d;
  if (d.startsWith("0")) return "33" + d.slice(1);
  return d;
};
const waUrl = (raw: string, text?: string) =>
  `https://wa.me/${waPhone(raw)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** Texte WhatsApp pré-rempli pour confirmation d'un rappel téléphonique. */
function waMessage(r: { first_name: string; remind_at: string }): string {
  const dt = new Date(r.remind_at);
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(dt);
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(dt).replace(":", "h");
  const hello = r.first_name ? `Bonjour ${r.first_name},` : "Bonjour,";
  return [hello, "", "Nous avons bien pris note de votre demande et sommes ravis de pouvoir échanger avec vous.", "", `Votre rendez-vous téléphonique est confirmé pour le ${date} à ${heure}.`, "Nous restons disponibles pour toute question d'ici là.", "", "Cordialement,", "L'équipe Simplicicar Paris 17"].join("\n");
}

const parisDate = (d: Date) =>
  new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const platformOf = (url: string) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.includes("leboncoin")) return "LeBonCoin";
    if (h.includes("lacentrale")) return "LaCentrale";
    if (h.includes("seloger")) return "SeLoger";
    return h;
  } catch { return "Lien"; }
};

function Rappels() {
  const me = getUser();
  const isAdmin = me?.role === "admin";

  // ---------- Form state ----------
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [note, setNote] = useState("");
  const [remindDate, setRemindDate] = useState("");
  const [remindTime, setRemindTime] = useState("09:00");
  const [adding, setAdding] = useState(false);

  // ---------- List state ----------
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showDone, setShowDone] = useState(false);

  // ---------- Load ----------
  async function load() {
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/reminders", { headers: authHeaders() });
      const d = await res.json();
      if (d.ok) setReminders(d.reminders);
      else setErr(d.error ?? "Erreur");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // ---------- Prefill from sessionStorage (Prospection → Rappel) ----------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = sessionStorage.getItem("prefillReminderPhone");
    const u = sessionStorage.getItem("prefillReminderUrl");
    if (p) { setPhone(p); sessionStorage.removeItem("prefillReminderPhone"); }
    if (u) { setListingUrl(u); sessionStorage.removeItem("prefillReminderUrl"); }
  }, []);

  // ---------- Add ----------
  async function add() {
    if (!phone.trim() || !remindDate) return;
    setAdding(true);
    try {
      const remindAt = new Date(`${remindDate}T${remindTime}:00`).toISOString();
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ firstName, lastName, phone, listingUrl, note, remindAt }),
      });
      const d = await res.json();
      if (d.ok) {
        setFirstName(""); setLastName(""); setPhone(""); setListingUrl(""); setNote("");
        setRemindDate(""); setRemindTime("09:00");
        load();
        if (d.smsSent) alert("✅ Rappel créé + SMS envoyé au client");
        else alert(`✅ Rappel créé. SMS NON envoyé : ${d.smsError ?? "raison inconnue"}`);
      } else alert(d.error ?? "Erreur");
    } finally { setAdding(false); }
  }

  // ---------- Actions ----------
  async function setStatus(id: number, status: string) {
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    await fetch("/api/reminders", {
      method: "PATCH",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ id, status }),
    });
  }

  // "Ne répond pas" : incrémente le compteur (optimiste) puis sync serveur.
  async function markNrp(id: number) {
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, status: "nrp", nrp_count: (r.nrp_count ?? 0) + 1 } : r)));
    await fetch("/api/reminders", {
      method: "PATCH",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ id, status: "nrp" }),
    });
  }

  async function del(id: number) {
    if (!confirm("Supprimer ce rappel ?")) return;
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/reminders?id=${id}`, { method: "DELETE", headers: authHeaders() });
  }

  function prefill(r: Reminder) {
    sessionStorage.setItem("prefillPhone", r.phone);
    if (r.first_name) sessionStorage.setItem("prefillFirstName", r.first_name);
    if (r.last_name) sessionStorage.setItem("prefillLastName", r.last_name);
    if (r.client_email) sessionStorage.setItem("prefillEmail", r.client_email);
    if (r.listing_url) sessionStorage.setItem("prefillListingUrl", r.listing_url);
  }
  function goToRdv(r: Reminder) {
    prefill(r);
    window.location.href = "/";
  }
  function goToDeplacement(r: Reminder) {
    prefill(r);
    sessionStorage.setItem("prefillType", "deplacement");
    window.location.href = "/";
  }

  // ---------- Group reminders ----------
  const { overdue, today, upcoming, done } = useMemo(() => {
    const now = new Date();
    const todayStr = parisDate(now);
    const overdue: Reminder[] = [];
    const today: Reminder[] = [];
    const upcoming: Reminder[] = [];
    const done: Reminder[] = [];

    for (const r of reminders) {
      if (r.status === "done" || r.status === "skipped") {
        done.push(r);
        continue;
      }
      const rDate = parisDate(new Date(r.remind_at));
      if (rDate < todayStr) overdue.push(r);
      else if (rDate === todayStr) today.push(r);
      else upcoming.push(r);
    }
    done.reverse();
    return { overdue, today, upcoming, done };
  }, [reminders]);

  // ---------- Card ----------
  const card = (r: Reminder, isOverdue?: boolean) => (
    <div
      key={r.id}
      style={{
        background: "#fff",
        border: isOverdue ? "1.5px solid #fca5a5" : "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 14,
        ...(isOverdue ? { boxShadow: "0 0 0 1px rgba(220,38,38,0.08), 0 2px 8px rgba(220,38,38,0.10)" } : {}),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          {(r.first_name || r.last_name) && (
            <div style={{ fontWeight: 700, color: NAVY, fontSize: 16 }}>
              {r.first_name} {r.last_name}
            </div>
          )}
          <div style={{ fontWeight: 600, color: NAVY, fontSize: 15 }}>{r.phone}</div>
          {r.listing_url && (
            <a href={r.listing_url} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontSize: 13, textDecoration: "none", fontWeight: 600 }}>
              {platformOf(r.listing_url)} — ouvrir l&apos;annonce →
            </a>
          )}
          {r.note && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{r.note}</div>}
          {isAdmin && r.owner && <div style={{ fontSize: 11, color: "#9aa6b8", marginTop: 2 }}>par {r.owner}</div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: isOverdue ? "#dc2626" : NAVY }}>{fmtDateTime(r.remind_at)}</div>
          {isOverdue && <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginTop: 2 }}>⏰ En retard</div>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <a
          href={`tel:${r.phone.replace(/\s/g, "")}`}
          style={{
            flex: "1 1 auto", textAlign: "center", padding: "9px 10px", borderRadius: 8,
            background: "#16a34a", color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600,
          }}
        >
          📞 Appeler
        </a>
        <a
          href={waUrl(r.phone, waMessage(r))}
          target="_blank"
          rel="noreferrer"
          style={{
            flex: "1 1 auto", textAlign: "center", padding: "9px 10px", borderRadius: 8,
            background: "#25D366", color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600,
          }}
        >
          💬 Envoyer confirmation WhatsApp
        </a>
        <button
          onClick={() => goToRdv(r)}
          style={{
            flex: "1 1 auto", padding: "9px 10px", borderRadius: 8, border: "none", cursor: "pointer",
            background: PINK, color: "#fff", fontSize: 14, fontWeight: 600,
          }}
        >
          📅 RDV physique
        </button>
        <button
          onClick={() => goToDeplacement(r)}
          style={{
            flex: "1 1 auto", padding: "9px 10px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#38bdf8", color: "#fff", fontSize: 14, fontWeight: 600,
          }}
        >
          🚗 RDV déplacement
        </button>
        <button
          onClick={() => setStatus(r.id, "done")}
          style={{
            flex: "1 1 auto", padding: "9px 10px", borderRadius: 8, border: "1.5px solid #bbf7d0", cursor: "pointer",
            background: "#f0fdf4", color: "#166534", fontSize: 13, fontWeight: 600,
          }}
        >
          ✅ Fait
        </button>
        <button
          onClick={() => markNrp(r.id)}
          title="Ne répond pas"
          style={{
            flex: "0 1 auto", padding: "9px 10px", borderRadius: 8, border: "1.5px solid #fed7aa", cursor: "pointer",
            background: "#fff7ed", color: "#c2410c", fontSize: 13, fontWeight: 600,
          }}
        >
          📵 NRP{r.nrp_count > 0 ? ` ${r.nrp_count}` : ""}
        </button>
        <button
          onClick={() => setStatus(r.id, "skipped")}
          style={{
            flex: "0 1 auto", padding: "9px 10px", borderRadius: 8, border: "1.5px solid #e5e7eb", cursor: "pointer",
            background: "#fff", color: "#6b7280", fontSize: 13, fontWeight: 600,
          }}
        >
          ⏭️
        </button>
        <button
          onClick={() => del(r.id)}
          style={{
            flex: "0 1 auto", padding: "9px 10px", borderRadius: 8, border: "1.5px solid #fecaca", cursor: "pointer",
            background: "#fff", color: "#dc2626", fontSize: 13, fontWeight: 600,
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );

  const section = (title: string, emoji: string, list: Reminder[], color: string, isOverdue?: boolean) =>
    list.length === 0 ? null : (
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: "'Cabin',sans-serif", fontSize: 14, color, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>
          {emoji} {title} <span style={{ color: "#9aa6b8" }}>({list.length})</span>
        </h2>
        <div style={{ display: "grid", gap: 10 }}>{list.map((r) => card(r, isOverdue))}</div>
      </div>
    );

  const ready = phone.trim() && remindDate;

  return (
    <>
      {/* ── Formulaire d'ajout ── */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "18px 16px", marginBottom: 16, boxShadow: "0 4px 6px rgba(26,39,58,0.06)" }}>
        <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
          Nouveau rappel
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Prénom</label>
              <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jean" />
            </div>
            <div>
              <label style={labelStyle}>Nom</label>
              <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dupont" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Téléphone *</label>
            <input style={inputStyle} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" />
          </div>
          <div>
            <label style={labelStyle}>Lien de l&apos;annonce</label>
            <input style={inputStyle} value={listingUrl} onChange={(e) => setListingUrl(extractUrl(e.target.value))} onPaste={(e) => { e.preventDefault(); setListingUrl(extractUrl(e.clipboardData.getData("text"))); }} placeholder="Colle ici (texte ou lien complet)" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Date du rappel *</label>
              <input style={inputStyle} type="date" value={remindDate} onChange={(e) => setRemindDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Heure</label>
              <input style={inputStyle} type="time" value={remindTime} onChange={(e) => setRemindTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Note</label>
            <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optionnel)" />
          </div>
          <button
            onClick={add}
            disabled={adding || !ready}
            style={{
              padding: "14px 20px", fontSize: 16, fontWeight: 600, borderRadius: 8, border: "none", fontFamily: "inherit",
              cursor: adding || !ready ? "not-allowed" : "pointer",
              background: adding || !ready ? "#cbd5e1" : PINK, color: "#fff",
            }}
          >
            {adding ? "Ajout…" : "Ajouter le rappel"}
          </button>
        </div>
      </div>

      {/* ── Compteur résumé ── */}
      {!loading && (overdue.length > 0 || today.length > 0 || upcoming.length > 0) && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, textAlign: "center" }}>
            {[
              { n: overdue.length, l: "En retard", c: "#dc2626" },
              { n: today.length, l: "Aujourd'hui", c: "#ca8a04" },
              { n: upcoming.length, l: "À venir", c: NAVY },
            ].map((s) => (
              <div key={s.l}>
                <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: s.c }}>{s.n}</div>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Liste des rappels ── */}
      {err && <p style={{ color: "#dc2626" }}>❌ {err}</p>}

      {section("En retard", "🔴", overdue, "#dc2626", true)}
      {section("Aujourd'hui", "🟡", today, "#ca8a04")}
      {section("À venir", "🔵", upcoming, NAVY)}

      {overdue.length === 0 && today.length === 0 && upcoming.length === 0 && !loading && (
        <p style={{ color: "#6b7280", textAlign: "center", marginTop: 20 }}>Aucun rappel en attente.</p>
      )}

      {/* ── Terminés ── */}
      {done.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setShowDone((s) => !s)}
            style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}
          >
            {showDone ? "▲" : "▼"} Terminés / passés ({done.length})
          </button>
          {showDone && (
            <div style={{ marginTop: 10, opacity: 0.65 }}>
              <div style={{ display: "grid", gap: 10 }}>
                {done.map((r) => (
                  <div
                    key={r.id}
                    style={{ background: "#f8f9fa", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#6b7280", fontSize: 14 }}>
                        {r.first_name} {r.last_name} — {r.phone}
                      </div>
                      <div style={{ fontSize: 12, color: "#9aa6b8" }}>
                        {fmtDateTime(r.remind_at)} · {r.status === "done" ? "✅ Fait" : "⏭️ Passé"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => setStatus(r.id, "pending")}
                        style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#fff", color: NAVY, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        ↩️ Réactiver
                      </button>
                      <button
                        onClick={() => del(r.id)}
                        style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <Shell active="rappels"><Rappels /></Shell>;
}
