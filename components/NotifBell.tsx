"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/client";

const NAVY = "var(--brand-dark)";

type Notif = { id: number; kind: string; title: string; body: string; link: string; read: boolean; created_at: string };

const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("fr-FR");
};

export default function NotifBell({ dark }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    try {
      const r = await fetch("/api/notifications", { headers: authHeaders() });
      const d = await r.json();
      if (d.ok) { setItems(d.notifications); setUnread(d.unread); }
    } catch { /* silencieux */ }
  }
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  async function act(action: string, id?: number) {
    await fetch("/api/notifications", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ action, id }) }).catch(() => {});
    load();
  }
  async function del(id: number) {
    await fetch(`/api/notifications?id=${id}`, { method: "DELETE", headers: authHeaders() }).catch(() => {});
    load();
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => { setOpen(!open); if (!open && unread) act("readAll"); }} title="Notifications"
        style={{ position: "relative", background: "transparent", border: "none", cursor: "pointer", fontSize: 20, padding: "4px 6px", color: dark ? "#fff" : NAVY }}>
        🔔
        {unread > 0 && (
          <span style={{ position: "absolute", top: -2, right: -4, background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "1px 5px", minWidth: 16, textAlign: "center" }}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 61, width: 340, maxWidth: "88vw", maxHeight: 440, overflowY: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, boxShadow: "0 12px 32px rgba(16,24,40,.16)" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #f0f1f3", fontWeight: 700, fontSize: 13, color: NAVY, display: "flex", justifyContent: "space-between" }}>
              Notifications
              <button onClick={() => act("readAll")} style={{ border: "none", background: "none", color: "#64748b", fontSize: 11.5, cursor: "pointer" }}>Tout marquer lu</button>
            </div>
            {items.length === 0 && <div style={{ padding: 18, fontSize: 13, color: "#94a3b8", textAlign: "center" }}>Aucune notification.</div>}
            {items.map((n) => (
              <div key={n.id} style={{ padding: "10px 14px", borderBottom: "1px solid #f6f7f9", background: n.read ? "#fff" : "#f0f7ff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    {n.link ? (
                      <a href={n.link} style={{ fontSize: 13, fontWeight: 600, color: NAVY, textDecoration: "none" }}>{n.title}</a>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{n.title}</span>
                    )}
                    {n.body && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{n.body}</div>}
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{ago(n.created_at)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => act("archive", n.id)} title="Archiver" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#94a3b8" }}>📥</button>
                    <button onClick={() => del(n.id)} title="Supprimer" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#94a3b8" }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
