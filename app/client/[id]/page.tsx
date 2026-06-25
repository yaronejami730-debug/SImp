"use client";

import { use, useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import VehiclePicker from "@/components/VehiclePicker";
import { authHeaders } from "@/lib/client";
import { MAIL_TEMPLATES, TEMPLATE_CATEGORIES, fillVars } from "@/lib/mail-templates-list";
import { SMS_TEMPLATES, SMS_TEMPLATE_CATEGORIES } from "@/lib/sms-templates-list";
import { COMMERCIAUX } from "@/lib/commerciaux";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const BASE_COMMISSION = 50;
const NEGO_RATE = 0.1;

type Sign = "" | "signed" | "thinking" | "unsigned";
type Appt = {
  id: string; startDateTime: string | null; firstName: string; lastName: string;
  civility: string; email: string; phone: string; platform: string; listingUrl: string;
  carBrand: string; carModel: string; carFinish: string; location: string;
  immatriculation?: string; vehiclePhotoUrl?: string; teleprospector?: string;
  note: string;
  present: boolean; signStatus: Sign; negotiation: number; owner: string; commercial: string;
  commissionBase?: number; commissionPct?: number; ref?: string; deplacement?: boolean; address?: string;
  createdAt: string | null; history: { t: string; at: string; info?: string }[];
  parkingRequested: boolean; parkingSent: boolean; cancelled: boolean;
  reminder24Sent: boolean; reminder2Sent: boolean;
  bcSigned: boolean; bcSignedAt: string | null;
  vehicleSold: boolean; soldAt: string | null;
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
    note: "💬 Note",
  } as Record<string, string>)[t] ?? t;

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const commission = (a: Appt) => (a.signStatus === "signed" ? (a.commissionBase ?? BASE_COMMISSION) + ((a.commissionPct ?? 10) / 100) * (a.negotiation || 0) : 0);

// ───────────────── Timeline messages (mails + SMS, preuves) ─────────────────
const fmtDT = (iso: string) => {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d);
  return `${date} à ${heure}`;
};

type MsgMeta = {
  key: string; source: "db" | "brevo"; channel: "email" | "sms"; templateKey: string; subject: string; preview: string;
  toEmail: string; toPhone: string; provider: string; providerMessageId: string; status: string; origin: string; error: string; sentAt: string;
};
function OriginTag({ origin }: { origin: string }) {
  if (origin === "manual") return <span style={{ fontSize: 10.5, fontWeight: 700, color: "#7c3aed", background: "#f3e8ff", padding: "1px 6px", borderRadius: 5 }}>✋ Manuel</span>;
  if (origin === "auto") return <span style={{ fontSize: 10.5, fontWeight: 700, color: "#0369a1", background: "#e0f2fe", padding: "1px 6px", borderRadius: 5 }}>🤖 Auto</span>;
  return null;
}
type MsgDetail = { channel: "email" | "sms"; templateKey: string; subject: string; bodyHtml: string; bodyText: string; toEmail?: string; toPhone?: string; provider: string; providerMessageId: string; status?: string; error?: string; sentAt?: string };
type BrevoEvt = { event: string; date: string; ip?: string; reason?: string };

// Libellé de provenance des données (exigé : on cite les prestataires).
const SOURCE_LABEL: Record<string, string> = {
  db: "Données issues de la base de données",
  brevo: "Données issues du système de mailing (Brevo)",
  allmysms: "Données issues du distributeur SMS (AllMySMS)",
};
function SourceTag({ source }: { source: string }) {
  return <span style={{ fontSize: 10.5, color: "#9aa6b8", fontStyle: "italic" }}>({SOURCE_LABEL[source] ?? source})</span>;
}

const TPL_LABEL: Record<string, string> = {
  confirmation: "Confirmation RDV", sms_confirmation: "SMS confirmation",
  reminder24: "Rappel 24h", reminder2: "Rappel 2h", sms_reminder24: "SMS rappel 24h", sms_reminder2: "SMS rappel 2h",
  parking: "Parking réservé", rescheduled: "RDV reprogrammé", cancelled: "RDV annulé", custom: "Mail personnalisé", sms_custom: "SMS personnalisé",
  sms_rappel_confirm: "SMS rappel confirmé", phone_rappel_client: "Rappel tél (client)", phone_rappel_organizer: "Rappel tél (collab)",
  noshow: "Absent — relance",
};
const tplLabel = (k: string) => TPL_LABEL[k] ?? k.replace(/^followup_/, "Relance ").replace(/_/g, " ");

// Traduit un event Brevo en libellé FR.
const EVT_LABEL: Record<string, { label: string; color: string }> = {
  requests: { label: "Envoyé", color: "#6b7280" }, request: { label: "Envoyé", color: "#6b7280" },
  delivered: { label: "Délivré", color: "#16a34a" },
  opened: { label: "Ouvert", color: "#2563eb" }, uniqueOpened: { label: "1ère ouverture", color: "#2563eb" }, firstOpening: { label: "1ère ouverture", color: "#2563eb" },
  click: { label: "Clic", color: "#7c3aed" }, clicks: { label: "Clic", color: "#7c3aed" },
  softBounce: { label: "Échec (soft)", color: "#ca8a04" }, hardBounce: { label: "Échec (hard)", color: "#dc2626" },
  blocked: { label: "Bloqué", color: "#dc2626" }, spam: { label: "Spam", color: "#dc2626" }, invalid: { label: "Email invalide", color: "#dc2626" }, error: { label: "Erreur", color: "#dc2626" }, deferred: { label: "Différé", color: "#ca8a04" }, unsubscribed: { label: "Désinscrit", color: "#6b7280" },
};
const evtInfo = (e: string) => EVT_LABEL[e] ?? { label: e, color: "#6b7280" };

function MessageModal({ meta, onClose }: { meta: MsgMeta; onClose: () => void }) {
  const [m, setM] = useState<MsgDetail | null>(null);
  const [events, setEvents] = useState<BrevoEvt[]>([]);
  const [evErr, setEvErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const smsSource = meta.channel === "sms" ? (meta.source === "db" ? "db" : "allmysms") : meta.source;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let url: string;
        if (meta.source === "brevo") {
          const uuid = meta.key.replace(/^brevo:/, "");
          url = `/api/messages/brevo/${encodeURIComponent(uuid)}?mid=${encodeURIComponent(meta.providerMessageId)}`;
        } else {
          const dbId = meta.key.replace(/^db:/, "");
          url = `/api/messages/${dbId}`;
        }
        const r = await fetch(url, { headers: authHeaders() });
        const d = await r.json();
        if (!alive) return;
        if (d.ok) { setM(d.message); setEvents(d.events ?? []); setEvErr(d.eventsError ?? ""); }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [meta]);

  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid #f1f3f5", fontSize: 13 }}>
      <div style={{ width: 130, color: "#9aa6b8", flexShrink: 0 }}>{k}</div>
      <div style={{ color: NAVY, wordBreak: "break-all" }}>{v}</div>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 560, width: "100%", margin: "24px 0", padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 30, color: "#6b7280" }}>Chargement…</div>
        ) : !m ? (
          <div style={{ textAlign: "center", padding: 30, color: "#dc2626" }}>Message introuvable.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: PINK, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {meta.channel === "sms" ? "📱 SMS" : "📧 Mail"} {meta.templateKey ? `· ${tplLabel(meta.templateKey)}` : ""}
                </div>
                <h3 style={{ margin: "4px 0 2px", fontSize: 17, fontWeight: 700, color: NAVY }}>{meta.channel === "sms" ? "SMS envoyé" : (m.subject || meta.subject)}</h3>
                <SourceTag source={smsSource} />
              </div>
              <button onClick={onClose} style={{ border: "none", background: "#f1f3f5", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 15, color: "#6b7280", flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "4px 14px", marginBottom: 14 }}>
              {row("Envoyé le", fmtDT(m.sentAt ?? meta.sentAt))}
              {meta.channel === "email" ? row("Destinataire", m.toEmail ?? meta.toEmail) : row("Destinataire", m.toPhone ?? meta.toPhone)}
              {row("Statut", <StatusBadge status={m.status ?? meta.status} />)}
              {meta.origin && row("Origine", <span><OriginTag origin={meta.origin} /> {meta.origin === "manual" ? "envoyé manuellement (bouton)" : "envoyé automatiquement"}</span>)}
              {(m.providerMessageId || meta.providerMessageId) && row("ID message", <span style={{ fontFamily: "monospace", fontSize: 11 }}>{m.providerMessageId || meta.providerMessageId}</span>)}
              {(m.error || meta.error) && row("Erreur", <span style={{ color: "#dc2626" }}>{m.error || meta.error}</span>)}
            </div>

            {meta.channel === "sms" ? (
              <>
                <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: 14, fontSize: 14, color: "#064e3b", whiteSpace: "pre-wrap" }}>
                  {m.bodyText || meta.preview || "—"}
                </div>
                <div style={{ marginTop: 8, textAlign: "right" }}><SourceTag source="allmysms" /></div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, margin: "4px 0 4px" }}>📜 Historique de livraison <SourceTag source="brevo" /></div>
                {evErr ? (
                  <div style={{ fontSize: 12.5, color: "#ca8a04", marginBottom: 12 }}>⚠️ {evErr}</div>
                ) : events.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "#6b7280", marginBottom: 12 }}>Aucun event Brevo pour le moment (peut prendre quelques minutes).</div>
                ) : (
                  <div style={{ marginBottom: 14 }}>
                    {events.map((e, i) => {
                      const info = evtInfo(e.event);
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f1f3f5" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 4, background: info.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: info.color, width: 110 }}>{info.label}</span>
                          <span style={{ fontSize: 12, color: "#6b7280", flex: 1 }}>{fmtDT(e.date)}</span>
                          {e.ip && <span style={{ fontSize: 11, color: "#9aa6b8", fontFamily: "monospace" }}>{e.ip}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <button onClick={() => setShowPreview((v) => !v)} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "#fff", border: `1.5px solid ${PINK}`, color: PINK, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {showPreview ? "Masquer l'aperçu" : "👁️ Ouvrir l'aperçu du mail"}
                </button>
                {showPreview && (
                  <iframe title="aperçu" srcDoc={m.bodyHtml} style={{ width: "100%", height: 520, border: "1px solid #e5e7eb", borderRadius: 10, marginTop: 10, background: "#fff" }} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { t: string; bg: string; c: string }> = {
    sent: { t: "Envoyé", bg: "#eff6ff", c: "#2563eb" },
    delivered: { t: "Délivré", bg: "#ecfdf5", c: "#16a34a" },
    opened: { t: "Ouvert", bg: "#eef2ff", c: "#4f46e5" },
    error: { t: "Échec", bg: "#fef2f2", c: "#dc2626" },
    skipped: { t: "Désactivé", bg: "#fff7ed", c: "#c2410c" },
    pending: { t: "En attente", bg: "#f1f5f9", c: "#64748b" },
  };
  const s = map[status] ?? { t: status, bg: "#f1f3f5", c: "#6b7280" };
  return <span style={{ background: s.bg, color: s.c, fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>{s.t}</span>;
}

// Matrice de suivi des notifications attendues pour un RDV : confirmation + rappel 24h, mail & SMS.
const NOTIF_SLOTS: { label: string; channel: "email" | "sms"; keys: string[] }[] = [
  { label: "Confirmation — Email", channel: "email", keys: ["confirmation", "mobile_confirmation"] },
  { label: "Confirmation — SMS", channel: "sms", keys: ["sms_confirmation", "sms_mobile_confirmation"] },
  { label: "Rappel 24h — Email", channel: "email", keys: ["reminder24", "mobile_reminder24"] },
  { label: "Rappel 24h — SMS", channel: "sms", keys: ["sms_reminder24", "sms_mobile_reminder24"] },
];

function NotifMatrix({ msgs, startDateTime }: { msgs: MsgMeta[]; startDateTime?: string | null }) {
  // RDV passé depuis > 24h : un rappel manquant = vrai trou (sinon "en attente" normal).
  const past24 = startDateTime ? new Date(startDateTime).getTime() < Date.now() : false;
  const rows = NOTIF_SLOTS.map((slot) => {
    const matches = msgs
      .filter((m) => m.channel === slot.channel && slot.keys.includes(m.templateKey))
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    const m = matches[0];
    const isReminder = slot.keys[0].includes("reminder");
    // Pas de message : "en attente" pour un rappel futur, "manquant" si le RDV est passé.
    const status = m?.status ?? (isReminder && !past24 ? "pending" : past24 ? "error" : "pending");
    const error = m?.error ?? (status === "error" && !m ? "Aucun envoi enregistré." : "");
    return { label: slot.label, status, error, sentAt: m?.sentAt };
  });
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 14, background: "#fafbfc" }}>
      <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 12, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>📋 Suivi des notifications</div>
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: NAVY, fontWeight: 600 }}>{r.label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {r.sentAt && <span style={{ fontSize: 10.5, color: "#9aa6b8" }}>{fmtDT(r.sentAt)}</span>}
              <StatusBadge status={r.status} />
            </span>
          </div>
        ))}
      </div>
      {rows.some((r) => r.error) && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#dc2626" }}>
          {rows.filter((r) => r.error).map((r) => <div key={r.label}>⚠️ {r.label} : {r.error}</div>)}
        </div>
      )}
    </div>
  );
}

function MessageTimeline({ id, refreshKey, startDateTime }: { id: string; refreshKey: number; startDateTime?: string | null }) {
  const [msgs, setMsgs] = useState<MsgMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [brevoErr, setBrevoErr] = useState("");
  const [openMsg, setOpenMsg] = useState<MsgMeta | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/client/${encodeURIComponent(id)}/messages`, { headers: authHeaders() });
        const d = await r.json();
        if (alive && d.ok) { setMsgs(d.messages); setBrevoErr(d.brevoError ?? ""); }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [id, refreshKey]);

  const mails = msgs.filter((m) => m.channel === "email");
  const sms = msgs.filter((m) => m.channel === "sms");

  const item = (m: MsgMeta) => {
    const src = m.channel === "sms" ? (m.source === "db" ? "db" : "allmysms") : m.source;
    return (
      <button
        key={m.key}
        onClick={() => setOpenMsg(m)}
        style={{ textAlign: "left", width: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 9, padding: "10px 12px", marginBottom: 8, cursor: "pointer", display: "block" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{m.templateKey ? tplLabel(m.templateKey) : (m.channel === "sms" ? "SMS" : "Mail")}</span>
          <span style={{ display: "flex", gap: 5, alignItems: "center" }}><OriginTag origin={m.origin} /><StatusBadge status={m.status} /></span>
        </div>
        <div style={{ fontSize: 12.5, color: "#475569", margin: "4px 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.preview || "—"}</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#9aa6b8" }}>{fmtDT(m.sentAt)}</span>
          <SourceTag source={src} />
        </div>
      </button>
    );
  };

  const col = (title: string, list: MsgMeta[]) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 12, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
        {title} <span style={{ color: "#9aa6b8" }}>({list.length})</span>
      </div>
      {list.length === 0 ? <div style={{ fontSize: 12.5, color: "#9aa6b8", padding: "8px 0" }}>Aucun</div> : list.map(item)}
    </div>
  );

  return (
    <>
      {loading ? (
        <div style={{ color: "#9aa6b8", fontSize: 13 }}>Chargement…</div>
      ) : (
        <>
          <NotifMatrix msgs={msgs} startDateTime={startDateTime} />
          {msgs.length === 0 ? (
            <div style={{ color: "#9aa6b8", fontSize: 13 }}>Aucun message envoyé pour le moment.</div>
          ) : (
            <details>
              <summary style={{ cursor: "pointer", fontSize: 12.5, color: "#6b7280", fontWeight: 600, padding: "4px 0" }}>
                Historique détaillé ({msgs.length} messages)
              </summary>
              <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
                {col("📧 Mails", mails)}
                {col("📱 SMS", sms)}
              </div>
            </details>
          )}
        </>
      )}
      {brevoErr && <div style={{ marginTop: 10, fontSize: 11.5, color: "#ca8a04" }}>⚠️ Récupération Brevo : {brevoErr}</div>}
      {openMsg && <MessageModal meta={openMsg} onClose={() => setOpenMsg(null)} />}
    </>
  );
}

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
  const [customMailOpen, setCustomMailOpen] = useState(false);
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [customSmsOpen, setCustomSmsOpen] = useState(false);
  const [customSmsText, setCustomSmsText] = useState("");
  const [photos, setPhotos] = useState<{ path: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null); // URL photo plein écran
  const [zoomed, setZoomed] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [timelineDraft, setTimelineDraft] = useState("");
  const [msgKey, setMsgKey] = useState(0); // force le refresh de la timeline messages

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`/api/client/${encodeURIComponent(id)}`, { headers: authHeaders() });
      const d = await r.json();
      if (d.ok) { setA(d.appointment); setNoteDraft(d.appointment.note ?? ""); setNoteDirty(false); setMsgKey((k) => k + 1); }
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

  async function markPresent() {
    setBusy("present");
    try {
      await saveStatus({ present: true });
      // Stoppe la séquence no-show si elle tournait.
      await fetch(`/api/client/${encodeURIComponent(id)}`, {
        method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ action: "cancel_noshow" }),
      });
      load();
    } finally { setBusy(""); }
  }

  async function markAbsent() {
    if (!a) return;
    if (!confirm(`Marquer ${a.firstName} ${a.lastName} absent et lancer la séquence de relance (mail tous les 2 jours) ?`)) return;
    setBusy("noshow"); setFlash(null);
    try {
      await saveStatus({ present: false });
      const r = await fetch(`/api/client/${encodeURIComponent(id)}`, {
        method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ action: "mark_noshow" }),
      });
      const d = await r.json();
      if (d.ok) { setFlash({ kind: "ok", msg: d.message ?? "Absent enregistré" }); load(); }
      else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  async function saveStatus(patch: { present?: boolean; signStatus?: Sign; negotiation?: number; bcSigned?: boolean; vehicleSold?: boolean }) {
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

  async function saveNote() {
    if (!a) return;
    setBusy("note");
    try {
      const r = await fetch(`/api/client/${encodeURIComponent(a.id)}`, {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ note: noteDraft }),
      });
      const d = await r.json();
      if (d.ok) { setA({ ...a, note: noteDraft }); setNoteDirty(false); setFlash({ kind: "ok", msg: "Note enregistrée" }); }
      else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  async function sendCustomMail() {
    if (!a || !customBody.trim()) return;
    setBusy("custom_mail"); setFlash(null);
    try {
      const r = await fetch(`/api/client/${encodeURIComponent(a.id)}`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action: "send_custom_mail", subject: customSubject, body: customBody }),
      });
      const d = await r.json();
      if (d.ok) {
        setFlash({ kind: "ok", msg: d.message ?? "Mail envoyé" });
        setCustomMailOpen(false); setCustomSubject(""); setCustomBody(""); setMsgKey((k) => k + 1);
      } else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  async function sendCustomSms() {
    if (!a || !customSmsText.trim()) return;
    setBusy("custom_sms"); setFlash(null);
    try {
      const r = await fetch(`/api/client/${encodeURIComponent(a.id)}`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action: "send_custom_sms", text: customSmsText }),
      });
      const d = await r.json();
      if (d.ok) {
        setFlash({ kind: "ok", msg: d.message ?? "SMS envoyé" });
        setCustomSmsOpen(false); setCustomSmsText(""); setMsgKey((k) => k + 1);
      } else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
    } finally { setBusy(""); }
  }

  async function addTimelineNote() {
    if (!a || !timelineDraft.trim()) return;
    setBusy("timeline");
    try {
      const r = await fetch(`/api/client/${encodeURIComponent(a.id)}/timeline`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ text: timelineDraft }),
      });
      const d = await r.json();
      if (d.ok) { setTimelineDraft(""); load(); }
      else setFlash({ kind: "err", msg: d.error ?? "Erreur" });
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

  async function saveCommercial(commercial: string) {
    if (!a) return;
    setA({ ...a, commercial });
    await fetch(`/api/client/${encodeURIComponent(a.id)}`, {
      method: "PATCH",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ commercial }),
    }).catch(() => {});
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
    const active = a.signStatus === val;
    return (
      <button
        onClick={() => saveStatus({ signStatus: active ? "" : val })}
        style={{
          flex: 1, padding: "10px 6px", fontSize: 13, fontWeight: 600, borderRadius: 8,
          cursor: "pointer",
          border: active ? `1.5px solid ${color}` : "1.5px solid #e5e7eb",
          background: active ? color : "#fff",
          color: active ? "#fff" : "#6b7280",
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
        {a.deplacement && <div style={{ display: "inline-block", padding: "3px 9px", borderRadius: 6, background: "#38bdf8", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8, marginLeft: a.cancelled ? 6 : 0 }}>🚗 DÉPLACEMENT</div>}
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, color: NAVY }}>{a.civility} {a.firstName} {a.lastName}</h1>
        {a.deplacement && a.address && <div style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>📍 {a.address}</div>}
        {a.ref && <div style={{ marginTop: 4, fontSize: 11, color: "#9aa6b8", fontFamily: "monospace" }}>🔖 {a.ref}</div>}
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
              {a.listingUrl && <a href={/^https?:\/\//i.test(a.listingUrl) ? a.listingUrl : `https://${a.listingUrl}`} target="_blank" rel="noopener noreferrer" style={{ color: PINK, fontSize: 13, fontWeight: 600, textDecoration: "underline" }}>🔗 Voir l&apos;annonce</a>}
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
              {a.immatriculation && <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 6, background: "#1a273a", color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>{a.immatriculation}</span>}
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

      {/* === COMMERCIAL === */}
      <div style={card}>
        <h2 style={sectionTitle}>👤 Commercial</h2>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>Le commercial qui gère ce rendez-vous.</p>
        <select
          value={COMMERCIAUX.includes(a.commercial as typeof COMMERCIAUX[number]) ? a.commercial : ""}
          onChange={(e) => saveCommercial(e.target.value)}
          style={{ width: "100%", padding: 12, fontSize: 15, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box", background: "#fff", color: NAVY, fontFamily: "inherit" }}
        >
          <option value="">— Non attribué —</option>
          {COMMERCIAUX.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {a.teleprospector && <div style={{ marginTop: 12, fontSize: 14 }}><span style={{ color: "#9aa6b8", fontSize: 11, textTransform: "uppercase" }}>Téléprospecteur</span><div style={{ fontWeight: 600, color: NAVY }}>📞 {a.teleprospector}</div></div>}
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
        {(() => {
          // Photo prise au RDV (vehiclePhotoUrl) en tête + photos ajoutées ensuite.
          const all = [
            ...(a.vehiclePhotoUrl ? [{ path: "__vehicle", url: a.vehiclePhotoUrl }] : []),
            ...photos,
          ];
          if (!all.length) return null;
          return (
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
              {all.map((p) => (
                <div key={p.path} style={{ position: "relative", paddingTop: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" onClick={() => { setLightbox(p.url); setZoomed(false); }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }} />
                  {p.path === "__vehicle"
                    ? <span style={{ position: "absolute", bottom: 4, left: 4, padding: "2px 6px", borderRadius: 5, background: "rgba(26,39,58,0.85)", color: "#fff", fontSize: 10, fontWeight: 700 }}>RDV</span>
                    : <button onClick={() => removePhoto(p.path)} title="Supprimer" style={{ position: "absolute", top: 4, right: 4, padding: "3px 7px", borderRadius: 6, background: "rgba(220,38,38,0.85)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* === LIGHTBOX plein écran + zoom === */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, overflow: "auto" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" onClick={(e) => { e.stopPropagation(); setZoomed((z) => !z); }} style={{ maxWidth: zoomed ? "none" : "100%", maxHeight: zoomed ? "none" : "100%", width: zoomed ? "auto" : undefined, transform: zoomed ? "scale(2)" : "scale(1)", transformOrigin: "center", transition: "transform 0.2s", cursor: zoomed ? "zoom-out" : "zoom-in", objectFit: "contain" }} />
          <button onClick={() => setLightbox(null)} style={{ position: "fixed", top: 16, right: 16, width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* === NOTES === */}
      <div style={card}>
        <h2 style={sectionTitle}>📝 Notes internes</h2>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>Note libre sur ce client / RDV. Visible uniquement en interne. Max 1000 caractères.</p>
        <textarea
          value={noteDraft}
          onChange={(e) => { setNoteDraft(e.target.value); setNoteDirty(true); }}
          placeholder="Ex: client intéressé par garantie 12 mois, rappeler le 15…"
          rows={5}
          maxLength={1000}
          style={{ width: "100%", padding: 12, fontSize: 14, borderRadius: 8, border: "1.5px solid #e5e7eb", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "#9aa6b8" }}>{noteDraft.length}/1000</span>
          <button
            onClick={saveNote}
            disabled={!noteDirty || busy === "note"}
            style={{ padding: "9px 16px", borderRadius: 7, background: !noteDirty || busy === "note" ? "#cbd5e1" : PINK, color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: !noteDirty ? "default" : "pointer" }}
          >
            {busy === "note" ? "Enregistrement…" : noteDirty ? "Enregistrer la note" : "✓ Note enregistrée"}
          </button>
        </div>
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
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed #e5e7eb" }}>
          {!customMailOpen ? (
            <button onClick={() => setCustomMailOpen(true)} disabled={!a.email} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, background: "#fff", border: `1.5px solid ${PINK}`, color: PINK, fontSize: 14, fontWeight: 600, cursor: a.email ? "pointer" : "not-allowed", opacity: a.email ? 1 : 0.5 }}>
              ✉️ Envoyer un mail personnalisé
            </button>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>📋 Templates rapides (clique pour pré-remplir)</label>
                <select
                  onChange={(e) => {
                    const tpl = MAIL_TEMPLATES.find((t) => t.key === e.target.value);
                    if (!tpl) return;
                    const vehicle = [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" ");
                    setCustomSubject(fillVars(tpl.subject, { firstName: a.firstName, lastName: a.lastName, vehicle }));
                    setCustomBody(fillVars(tpl.body, { firstName: a.firstName, lastName: a.lastName, vehicle }));
                    e.target.value = "";
                  }}
                  style={{ width: "100%", padding: 10, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box", background: "#fff" }}
                  defaultValue=""
                >
                  <option value="">— Choisir un template —</option>
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {MAIL_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <input value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} placeholder="Objet du mail (optionnel)" style={{ padding: 11, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }} />
              <textarea value={customBody} onChange={(e) => setCustomBody(e.target.value)} rows={10} placeholder="Texte libre. Le mail aura le même design Simplicicar (logo, footer). Bonjour [Civilité Nom] sera ajouté automatiquement avant ton message." style={{ padding: 11, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={sendCustomMail} disabled={busy === "custom_mail" || !customBody.trim()} style={{ flex: 1, padding: "11px 14px", borderRadius: 7, background: !customBody.trim() ? "#cbd5e1" : PINK, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: !customBody.trim() ? "default" : "pointer" }}>
                  {busy === "custom_mail" ? "Envoi…" : `📧 Envoyer à ${a.email}`}
                </button>
                <button onClick={() => { setCustomMailOpen(false); setCustomBody(""); setCustomSubject(""); }} style={{ padding: "11px 14px", borderRadius: 7, background: "#fff", color: "#6b7280", border: "1.5px solid #e5e7eb", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
              </div>
            </div>
          )}
        </div>
        <div style={{ marginTop: 12, paddingTop: 14, borderTop: "1px dashed #e5e7eb" }}>
          {!customSmsOpen ? (
            <button onClick={() => setCustomSmsOpen(true)} disabled={!a.phone} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, background: "#fff", border: `1.5px solid ${NAVY}`, color: NAVY, fontSize: 14, fontWeight: 600, cursor: a.phone ? "pointer" : "not-allowed", opacity: a.phone ? 1 : 0.5 }}>
              📱 Envoyer un SMS personnalisé
            </button>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>📋 Templates SMS (clique pour pré-remplir)</label>
                <select
                  onChange={(e) => {
                    const tpl = SMS_TEMPLATES.find((t) => t.key === e.target.value);
                    if (!tpl) return;
                    const vehicle = [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" ");
                    setCustomSmsText(fillVars(tpl.text, { firstName: a.firstName, lastName: a.lastName, vehicle }));
                    e.target.value = "";
                  }}
                  style={{ width: "100%", padding: 10, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box", background: "#fff" }}
                  defaultValue=""
                >
                  <option value="">— Choisir un template —</option>
                  {SMS_TEMPLATE_CATEGORIES.map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {SMS_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <textarea
                value={customSmsText}
                onChange={(e) => setCustomSmsText(e.target.value)}
                rows={4}
                maxLength={612}
                placeholder="Texte du SMS envoyé au client. Pense à signer (ex: Simplicicar) et à ajouter STOP au 36180 si besoin."
                style={{ padding: 11, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
              />
              <div style={{ fontSize: 11, color: "#9aa6b8", textAlign: "right" }}>{customSmsText.length} caractères · ~{Math.max(1, Math.ceil(customSmsText.length / 160))} SMS</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={sendCustomSms} disabled={busy === "custom_sms" || !customSmsText.trim()} style={{ flex: 1, padding: "11px 14px", borderRadius: 7, background: !customSmsText.trim() ? "#cbd5e1" : NAVY, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: !customSmsText.trim() ? "default" : "pointer" }}>
                  {busy === "custom_sms" ? "Envoi…" : `📱 Envoyer au ${a.phone}`}
                </button>
                <button onClick={() => { setCustomSmsOpen(false); setCustomSmsText(""); }} style={{ padding: "11px 14px", borderRadius: 7, background: "#fff", color: "#6b7280", border: "1.5px solid #e5e7eb", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === NOTIFICATIONS & PREUVES === */}
      <div style={card}>
        <h2 style={sectionTitle}>📨 Notifications</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>Suivi des envois attendus (confirmation + rappel 24h, mail &amp; SMS) et historique détaillé avec statut, date et erreur éventuelle.</p>
        <MessageTimeline id={a.id} refreshKey={msgKey} startDateTime={a.startDateTime} />
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
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {(() => {
            const isNoShow = a.history.some((h) => h.t === "noshow");
            const base: React.CSSProperties = { flex: 1, padding: "12px 10px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" };
            return (
              <>
                <button
                  onClick={markPresent}
                  disabled={busy === "present"}
                  style={{ ...base, border: `1.5px solid ${a.present ? "#16a34a" : "#e5e7eb"}`, background: a.present ? "#16a34a" : "#fff", color: a.present ? "#fff" : NAVY }}
                >
                  🙋 Client présent
                </button>
                <button
                  onClick={markAbsent}
                  disabled={busy === "noshow"}
                  style={{ ...base, border: `1.5px solid ${isNoShow ? "#dc2626" : "#e5e7eb"}`, background: isNoShow ? "#dc2626" : "#fff", color: isNoShow ? "#fff" : NAVY }}
                >
                  {busy === "noshow" ? "Envoi…" : isNoShow ? "🚫 Absent — relances en cours" : "🚫 Ne s'est pas présenté"}
                </button>
              </>
            );
          })()}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {signBtn("signed", "✅ A signé", "#16a34a")}
          {signBtn("thinking", "🤔 Réfléchit", "#ca8a04")}
          {signBtn("unsigned", "❌ Pas signé", "#dc2626")}
        </div>
        {a.signStatus === "signed" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>Montant négocié €</span>
              <input
                type="number"
                value={a.negotiation || ""}
                onChange={(e) => setA({ ...a, negotiation: Number(e.target.value) })}
                onBlur={(e) => saveStatus({ negotiation: Number(e.target.value) })}
                placeholder="0"
                style={{ width: 120, padding: "8px 10px", fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb" }}
              />
              <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 700 }}>= {eur(commission(a))} <span style={{ color: "#9aa6b8", fontWeight: 400 }}>({a.commissionBase ?? 50}€{(a.commissionPct ?? 10) > 0 ? ` + ${a.commissionPct ?? 10}%` : ""})</span></span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: a.bcSigned ? "#eff6ff" : "#fff", border: `1.5px solid ${a.bcSigned ? "#2563eb" : "#e5e7eb"}`, fontSize: 14, fontWeight: 600, color: a.bcSigned ? "#1d4ed8" : NAVY, cursor: "pointer", marginBottom: 8 }}>
              <input type="checkbox" checked={a.bcSigned} onChange={(e) => saveStatus({ bcSigned: e.target.checked })} />
              <div style={{ flex: 1 }}>
                📝 Bon de commande signé
                {a.bcSigned && a.bcSignedAt && <div style={{ fontSize: 11, fontWeight: 400, color: "#1d4ed8", marginTop: 2 }}>Signé le {new Date(a.bcSignedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}</div>}
              </div>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: a.vehicleSold ? "#f0fdf4" : "#fff", border: `1.5px solid ${a.vehicleSold ? "#16a34a" : "#e5e7eb"}`, fontSize: 14, fontWeight: 600, color: a.vehicleSold ? "#166534" : NAVY, cursor: "pointer" }}>
              <input type="checkbox" checked={a.vehicleSold} onChange={(e) => saveStatus({ vehicleSold: e.target.checked })} />
              <div style={{ flex: 1 }}>
                🏁 Véhicule vendu (livré / payé)
                {a.vehicleSold && a.soldAt && <div style={{ fontSize: 11, fontWeight: 400, color: "#166534", marginTop: 2 }}>Vendu le {new Date(a.soldAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}</div>}
              </div>
            </label>
          </>
        )}
      </div>

      {/* === TIMELINE === */}
      <div style={card}>
        <h2 style={sectionTitle}>📜 Timeline</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>Chronologie des événements + ajout de notes datées (ex: &laquo; appelé, ne répond pas &raquo;).</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            value={timelineDraft}
            onChange={(e) => setTimelineDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTimelineNote(); }}
            placeholder="Ajouter une note datée…"
            style={{ flex: 1, padding: 10, fontSize: 14, borderRadius: 7, border: "1.5px solid #e5e7eb", boxSizing: "border-box" }}
          />
          <button onClick={addTimelineNote} disabled={!timelineDraft.trim() || busy === "timeline"} style={{ padding: "10px 14px", borderRadius: 7, background: !timelineDraft.trim() ? "#cbd5e1" : PINK, color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: !timelineDraft.trim() ? "default" : "pointer" }}>
            {busy === "timeline" ? "…" : "Ajouter"}
          </button>
        </div>
        {a.history.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9aa6b8", fontStyle: "italic", margin: 0 }}>Aucun événement.</p>
        ) : (
          <div style={{ borderLeft: `2px solid ${PINK}`, paddingLeft: 14 }}>
            {a.history.slice().reverse().map((h, i) => (
              <div key={i} style={{ position: "relative", padding: "8px 0", borderBottom: i < a.history.length - 1 ? "1px solid #f0f1f3" : "none" }}>
                <div style={{ position: "absolute", left: -19, top: 12, width: 8, height: 8, borderRadius: "50%", background: PINK }} />
                <div style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>{histLabel(h.t)}</div>
                {h.t === "note" && h.info && <div style={{ fontSize: 13, color: "#232323", marginTop: 2, whiteSpace: "pre-wrap" }}>{h.info}</div>}
                {h.t === "rescheduled" && h.info && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>→ {new Date(h.info).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}</div>}
                <div style={{ fontSize: 11, color: "#9aa6b8", marginTop: 2 }}>{new Date(h.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}</div>
              </div>
            ))}
          </div>
        )}
      </div>

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
