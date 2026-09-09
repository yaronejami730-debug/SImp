"use client";

import { useEffect, useState } from "react";
import { getUser, tokenValide, clearAuth, authHeaders } from "@/lib/client";
import Sidebar from "./Sidebar";
import Icone from "./Icone";
import { T, R, S } from "@/components/ui/tokens";
import type { Groupe } from "./navigation";

const LARGEUR_SIDEBAR = 248;
const YJ_LOGO = "https://rz18xsip6ybhgfji.public.blob.vercel-storage.com/yj-solutions/logo.png";

export const AGENCE_GROUPES: Groupe[] = [
  {
    titre: "Prospection",
    entrees: [
      { key: "contacts", label: "Contacts", href: "/prospection-agence", icone: "personnes", visible: () => true },
      { key: "propositions", label: "Propositions envoyées", href: "/prospection-agence/propositions", icone: "euro", visible: () => true },
      { key: "reponses", label: "Réponses reçues", href: "/prospection-agence/reponses", icone: "enveloppe", visible: () => true },
    ],
  },
];

const PALETTES: { key: string; label: string; primary: string; dark: string }[] = [
  { key: "yj", label: "YJ Solutions (défaut)", primary: "#c21f2c", dark: "#12203a" },
  { key: "nb", label: "Noir & blanc", primary: "#111111", dark: "#000000" },
  { key: "rv", label: "Rouge & vert", primary: "#c21f2c", dark: "#0f3d2a" },
  { key: "bleu", label: "Bleu nuit", primary: "#2563eb", dark: "#0b1b3a" },
];

function palettePref(): typeof PALETTES[number] {
  try {
    const key = localStorage.getItem("yj_theme_preset");
    return PALETTES.find((p) => p.key === key) ?? PALETTES[0];
  } catch {
    return PALETTES[0];
  }
}

/** Coquille de l'espace isolé "Prospection agences" : même système de design que le CRM
 *  Simplicicar (Sidebar, boutons, tokens T/R/S), une autre carte de navigation et une autre
 *  identité (logo + couleurs YJ Solutions, réglables via le bouton Paramètres). Jamais mêlé au
 *  CRM Simplicicar — réservé au super-admin, réutilise juste le même jeton de connexion. */
export default function EspaceAgenceShell({ active, children }: { active: string; children: React.ReactNode }) {
  const [pret, setPret] = useState(false);
  const [autorise, setAutorise] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [reglagesOuvert, setReglagesOuvert] = useState(false);
  const [palette, setPalette] = useState(PALETTES[0]);

  useEffect(() => {
    setAutorise(tokenValide() && getUser()?.role === "admin");
    setPalette(palettePref());
    setPret(true);
  }, []);

  useEffect(() => {
    if (!autorise) return;
    const ping = () => { fetch("/api/presence", { method: "POST", headers: authHeaders() }).catch(() => {}); };
    ping();
    const id = setInterval(ping, 45000);
    return () => clearInterval(id);
  }, [autorise]);

  if (!pret) return null;

  if (!autorise) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Manrope',Arial,sans-serif" }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: T.ink, margin: "0 0 8px" }}>Accès réservé</h1>
          <p style={{ fontSize: 14, color: T.ink2, margin: "0 0 20px" }}>Cet espace est réservé au super-administrateur. Connecte-toi via le CRM Simplicicar.</p>
          <button onClick={() => { window.location.href = "/simplicicar"; }} style={{ height: 40, padding: "0 18px", borderRadius: 8, border: "none", background: "#12203a", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Aller au CRM</button>
        </div>
      </div>
    );
  }

  function choisirPalette(p: typeof PALETTES[number]) {
    setPalette(p);
    try { localStorage.setItem("yj_theme_preset", p.key); } catch {}
    setReglagesOuvert(false);
  }

  function deconnexion() {
    clearAuth();
    try { sessionStorage.removeItem("yj_espace"); } catch {}
    window.location.href = "/simplicicar";
  }

  const user = getUser();

  return (
    // Couleurs scopées à ce sous-arbre via variables CSS — jamais le thème Simplicicar global
    // (applyTheme()), qui reste posé au niveau racine pour le CRM.
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", ["--brand-primary" as string]: palette.primary, ["--brand-dark" as string]: palette.dark } as React.CSSProperties}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <aside className="yj-aside" style={{ position: "fixed", inset: "0 auto 0 0", width: LARGEUR_SIDEBAR, zIndex: 40 }}>
        <Sidebar active={active} user={user} marque="YJ Solutions" logo={YJ_LOGO} groupes={AGENCE_GROUPES} logoCentre />
      </aside>

      {menuOuvert && (
        <div className="yj-drawer" onClick={() => setMenuOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(18,32,58,0.4)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: LARGEUR_SIDEBAR, height: "100%" }}>
            <Sidebar active={active} user={user} marque="YJ Solutions" logo={YJ_LOGO} groupes={AGENCE_GROUPES} logoCentre onNaviguer={() => setMenuOuvert(false)} />
          </div>
        </div>
      )}

      <div className="yj-main" style={{ marginLeft: LARGEUR_SIDEBAR, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <header style={{ position: "sticky", top: 0, zIndex: 30, background: T.surface, borderBottom: `1px solid ${T.line}`, padding: `${S.sm}px ${S.md}px`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: S.sm, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="yj-burger" onClick={() => setMenuOuvert(true)} aria-label="Ouvrir la navigation"
              style={{ height: 38, width: 38, borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, cursor: "pointer", alignItems: "center", justifyContent: "center" }}>
              <Icone nom="menu" />
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.02em" }}>YJ Solutions</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", position: "relative" }}>
            {user && <span style={{ fontSize: 13.5, color: T.ink2 }}>{user.name} · admin</span>}
            <button onClick={() => setReglagesOuvert((v) => !v)} title="Paramètres — couleurs"
              style={{ height: 36, width: 36, borderRadius: R.pill, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icone nom="reglages" />
            </button>
            {reglagesOuvert && (
              <div style={{ position: "absolute", top: 44, right: 90, background: T.surface, border: `1px solid ${T.line}`, borderRadius: R.md, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", padding: 10, width: 200, zIndex: 70 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 6px 8px" }}>Nuances</div>
                {PALETTES.map((p) => (
                  <button
                    key={p.key} onClick={() => choisirPalette(p)}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 6px", borderRadius: R.sm, border: "none", background: palette.key === p.key ? T.surface3 : "transparent", cursor: "pointer", fontSize: 13, fontWeight: palette.key === p.key ? 700 : 500, color: T.ink, textAlign: "left" }}
                  >
                    <span style={{ display: "inline-flex", width: 18, height: 18, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `1px solid ${T.line}` }}>
                      <span style={{ flex: 1, background: p.dark }} />
                      <span style={{ flex: 1, background: p.primary }} />
                    </span>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <a href="/agenda" onClick={() => { try { sessionStorage.setItem("yj_espace", "crm"); } catch {} }}
              style={{ height: 36, padding: "0 14px", borderRadius: R.pill, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              → CRM Simplicicar
            </a>
            <button onClick={deconnexion} style={{ height: 36, padding: "0 14px", borderRadius: R.pill, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
              Déconnexion
            </button>
          </div>
        </header>

        <main style={{ flex: 1, padding: `${S.lg}px ${S.md}px ${S.xxl}px`, minWidth: 0 }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", minWidth: 0 }}>{children}</div>
        </main>
      </div>
    </div>
  );
}

const CSS = `
  .yj-burger { display: none; }
  @media (max-width: 900px) {
    .yj-aside { display: none; }
    .yj-main { margin-left: 0 !important; }
    .yj-burger { display: inline-flex !important; }
  }
`;
