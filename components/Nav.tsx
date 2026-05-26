"use client";

import { getUser, clearAuth } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const LOGO = "/logo.png";

const TABS = [
  { key: "rdv", label: "Prise de RDV", href: "/" },
  { key: "agenda", label: "Agenda", href: "/agenda" },
  { key: "prospection", label: "Prospection", href: "/prospection" },
  { key: "rappels", label: "Rappels", href: "/rappels" },
  { key: "scan", label: "Scan", href: "/scan" },
];

export default function Nav({ active }: { active: string }) {
  const user = getUser();

  function logout() {
    clearAuth();
    window.location.href = "/";
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto 16px" }}>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="Simplicicar" width={150} style={{ width: 150, maxWidth: "42%", height: "auto" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {user && (
            <span style={{ color: "#6b7280", fontSize: 12 }}>
              {user.name}{user.role === "admin" ? " (admin)" : ""}
            </span>
          )}
          <button onClick={logout} style={{ color: NAVY, fontSize: 12, background: "#fff", border: "1px solid #e5e7eb", padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}>
            Déconnexion
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <a
            key={t.key}
            href={t.href}
            style={{
              flex: "1 1 auto",
              textAlign: "center",
              padding: "10px 12px",
              borderRadius: 9,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              background: active === t.key ? PINK : "#fff",
              color: active === t.key ? "#fff" : NAVY,
              border: "1px solid " + (active === t.key ? PINK : "#e5e7eb"),
            }}
          >
            {t.label}
          </a>
        ))}
        {user?.role === "admin" && (
          <a
            href="/comptes"
            style={{
              flex: "1 1 auto", textAlign: "center", padding: "10px 12px", borderRadius: 9, fontSize: 14, fontWeight: 600, textDecoration: "none",
              background: active === "comptes" ? PINK : "#fff", color: active === "comptes" ? "#fff" : NAVY, border: "1px solid " + (active === "comptes" ? PINK : "#e5e7eb"),
            }}
          >
            Comptes
          </a>
        )}
      </div>
    </div>
  );
}
