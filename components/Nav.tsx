"use client";

import { getUser, getTheme, clearAuth } from "@/lib/client";
import NotifBell from "./NotifBell";

const NAVY = "var(--brand-dark)";
const PINK = "var(--brand-primary)";
const LOGO = "/logo.png";

// teleOnly = réservé aux téléprospecteurs (et admin) : créer des RDV / gérer les prospects.
const TABS = [
  { key: "rdv", label: "Prise de RDV", href: "/", teleOnly: true },
  { key: "agenda", label: "Agenda", href: "/agenda" },
  { key: "crm", label: "CRM", href: "/crm" },
  { key: "bilan", label: "Bilan", href: "/bilan" },
  { key: "prospection", label: "Prospection", href: "/prospection", teleOnly: true },
  { key: "rappels", label: "Rappels", href: "/rappels", teleOnly: true },
  { key: "statistiques", label: "Stats", href: "/statistiques" },
  { key: "parametres", label: "Paramètres", href: "/parametres" },
  // Masqués pour l'instant (code conservé) : recherche, relances, hesitants, assistant.
];

export default function Nav({ active }: { active: string; callCenterId?: number }) {
  const user = getUser();
  const theme = getTheme(); // logo + nom de la franchise (white-label)
  const logoSrc = theme?.logo || LOGO;
  const brandName = theme?.name || "Simplicicar";
  // Bandeau clair (défaut) ou foncé : pour les logos à écriture blanche.
  const headerDark = !!theme?.headerDark;
  const headerBg = headerDark ? "var(--brand-dark)" : "#fff";
  const headerInk = headerDark ? "#fff" : NAVY;
  const headerSub = headerDark ? "rgba(255,255,255,0.75)" : "#6b7280";
  // Téléprospecteur (ou admin) = peut créer des RDV / gérer les prospects.
  // Commercial pur = voit seulement Agenda / CRM / Stats (ses RDV affectés).
  const canCreate = user?.role === "admin" || !!user?.isTeleprospector;
  // Vues par rôle : commercial pur = Agenda + Stats uniquement ; Bilan (financier) = admin seulement.
  const commercialPur = user?.role !== "admin" && !!user?.isCommercial && !user?.isTeleprospector;
  const tabs = TABS.filter((t) => {
    // Commercial pur : menu minimal Agenda + Paramètres (cahier des charges).
    if (commercialPur) return t.key === "agenda" || t.key === "parametres";
    if (t.key === "parametres") return user?.role === "admin" || !!user?.isCommercial; // réglages de dispo = commerciaux
    if (t.key === "bilan" && user?.role !== "admin") return false;
    return !t.teleOnly || canCreate;
  });

  function logout() {
    clearAuth();
    window.location.href = "/";
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto 16px" }}>
      <div style={{ background: headerBg, border: `1px solid ${headerDark ? "transparent" : "#e5e7eb"}`, borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt={brandName} width={150} style={{ width: 150, maxWidth: "42%", height: "auto", maxHeight: 48, objectFit: "contain" }} />
        {/* Nom de l'agence, centré */}
        <div style={{ flex: 1, textAlign: "center", minWidth: 120 }}>
          <span style={{ fontFamily: "'Cabin',sans-serif", fontSize: 15, fontWeight: 700, color: headerInk, letterSpacing: 0.4, textTransform: "uppercase" }}>{brandName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <NotifBell dark={headerDark} />
          {user && (
            <span style={{ color: headerSub, fontSize: 12 }}>
              {user.name}{user.role === "admin" ? " (admin)" : ""}
            </span>
          )}
          <button onClick={logout} style={{ color: headerInk, fontSize: 12, background: headerDark ? "rgba(255,255,255,0.12)" : "#fff", border: `1px solid ${headerDark ? "rgba(255,255,255,0.3)" : "#e5e7eb"}`, padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}>
            Déconnexion
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {tabs.map((t) => (
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
            href="/avis-admin"
            style={{
              flex: "1 1 auto", textAlign: "center", padding: "10px 12px", borderRadius: 9, fontSize: 14, fontWeight: 600, textDecoration: "none",
              background: active === "avis-admin" ? PINK : "#fff", color: active === "avis-admin" ? "#fff" : NAVY, border: "1px solid " + (active === "avis-admin" ? PINK : "#e5e7eb"),
            }}
          >
            ⭐ Avis
          </a>
        )}
        {user?.role === "admin" && (
          <a
            href="/templates"
            style={{
              flex: "1 1 auto", textAlign: "center", padding: "10px 12px", borderRadius: 9, fontSize: 14, fontWeight: 600, textDecoration: "none",
              background: active === "templates" ? PINK : "#fff", color: active === "templates" ? "#fff" : NAVY, border: "1px solid " + (active === "templates" ? PINK : "#e5e7eb"),
            }}
          >
            📧 Templates
          </a>
        )}
        {(user?.role === "admin" || user?.role === "responsable") && (
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
