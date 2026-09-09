"use client";

import { useEffect, useState } from "react";
import { getUser, getTheme, clearAuth, applyTheme, tokenValide, authHeaders } from "@/lib/client";
import Login from "@/components/Login";
import NotifBell from "@/components/NotifBell";
import Sidebar from "./Sidebar";
import Icone from "./Icone";
import { T, R, S } from "@/components/ui/tokens";

const LARGEUR_SIDEBAR = 248;

/** Coquille du CRM : navigation latérale à gauche, contenu à droite.
 *  Sous 900px, la navigation se replie derrière un bouton. */
export default function AppShell({ active, children, wide }: { active: string; children: React.ReactNode; wide?: boolean }) {
  const [pret, setPret] = useState(false);
  const [connecte, setConnecte] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [isGestionnaire, setIsGestionnaire] = useState<boolean | null>(null);
  const [espaceChoisi, setEspaceChoisi] = useState(false);

  useEffect(() => {
    applyTheme();
    // Jeton absent OU expiré : on nettoie et on redemande la connexion,
    // plutôt que d'afficher un écran vide qui répondrait « Non connecté » partout.
    if (tokenValide()) {
      setConnecte(true);
      try { setEspaceChoisi(sessionStorage.getItem("yj_espace") !== null); } catch { setEspaceChoisi(true); }
    } else {
      clearAuth();
      setConnecte(false);
    }
    setPret(true);
  }, []);

  // Statut gestionnaire vérifié en direct (pas seulement au login) : visible dans la nav
  // dès qu'un admin te rattache à un call center, sans attendre une reconnexion.
  useEffect(() => {
    if (!connecte) return;
    fetch("/api/me", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setIsGestionnaire(!!d.isGestionnaire); })
      .catch(() => {});
  }, [connecte]);

  // Présence : ping "connecté" toutes les 45s tant que le CRM reste ouvert (voir /comptes).
  useEffect(() => {
    if (!connecte) return;
    const ping = () => { fetch("/api/presence", { method: "POST", headers: authHeaders() }).catch(() => {}); };
    ping();
    const id = setInterval(ping, 45000);
    return () => clearInterval(id);
  }, [connecte]);

  if (!pret) return null;
  if (!connecte) return <Login onLogin={() => { try { sessionStorage.removeItem("yj_espace"); } catch {} setEspaceChoisi(false); setConnecte(true); }} />;

  const userBase = getUser();

  // Super-admin uniquement : à chaque connexion, on choisit son espace de travail — le CRM
  // Simplicicar (RDV, prospection lead, bilan, stock…) ou la prospection agences YJ Solutions
  // (démarchage B2B, e-mails au nom de YJ Solutions). Les deux univers ne se mélangent jamais :
  // aucun autre rôle ne voit ce choix ni la prospection agences.
  if (userBase?.role === "admin" && !espaceChoisi) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif" }}>
        <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: T.ink, margin: "0 0 8px" }}>Quel espace ?</h1>
          <p style={{ fontSize: 14, color: T.ink2, margin: "0 0 24px" }}>Réservé au super-administrateur — les deux espaces ne se mélangent jamais.</p>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
            <button
              onClick={() => { try { sessionStorage.setItem("yj_espace", "crm"); } catch {} setEspaceChoisi(true); }}
              style={{ padding: "28px 20px", borderRadius: R.md, border: `1.5px solid ${T.line}`, background: T.surface, cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 6 }}>CRM Simplicicar</div>
              <div style={{ fontSize: 13, color: T.ink2 }}>Agenda, prise de RDV, prospection lead, bilan, stock…</div>
            </button>
            <button
              onClick={() => { try { sessionStorage.setItem("yj_espace", "agence"); } catch {} window.location.href = "/prospection-agence"; }}
              style={{ padding: "28px 20px", borderRadius: R.md, border: `1.5px solid ${T.line}`, background: T.surface, cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 6 }}>Prospection agences</div>
              <div style={{ fontSize: 13, color: T.ink2 }}>Démarchage B2B — e-mails au nom de YJ Solutions.</div>
            </button>
          </div>
        </div>
      </div>
    );
  }
  const user = userBase && isGestionnaire !== null ? { ...userBase, isGestionnaire } : userBase;
  const theme = getTheme();
  const marque = theme?.name || "Simplicicar";
  const logo = theme?.logo || "/logo.png";

  let backup: { token?: string; user?: string; theme?: string | null } | null = null;
  try { backup = JSON.parse(localStorage.getItem("auth_backup") || "null"); } catch { backup = null; }

  function revenirAdmin() {
    if (!backup?.token || !backup?.user) return;
    localStorage.setItem("auth_token", backup.token);
    localStorage.setItem("auth_user", backup.user);
    if (backup.theme) localStorage.setItem("auth_theme", backup.theme); else localStorage.removeItem("auth_theme");
    localStorage.removeItem("auth_backup");
    window.location.href = "/comptes";
  }

  function deconnexion() {
    localStorage.removeItem("auth_backup");
    try { sessionStorage.removeItem("yj_espace"); } catch {}
    clearAuth();
    window.location.href = "/simplicicar";
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Navigation fixe (écran large) */}
      <aside className="crm-aside" style={{ position: "fixed", inset: "0 auto 0 0", width: LARGEUR_SIDEBAR, zIndex: 40 }}>
        <Sidebar active={active} user={user} marque={marque} logo={logo} />
      </aside>

      {/* Navigation repliée (mobile) */}
      {menuOuvert && (
        <div className="crm-drawer" onClick={() => setMenuOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(26,26,26,0.32)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: LARGEUR_SIDEBAR, height: "100%" }}>
            <Sidebar active={active} user={user} marque={marque} logo={logo} onNaviguer={() => setMenuOuvert(false)} />
          </div>
        </div>
      )}

      <div className="crm-main" style={{ marginLeft: LARGEUR_SIDEBAR, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <header style={{ position: "sticky", top: 0, zIndex: 30, background: T.surface, borderBottom: `1px solid ${T.line}`, padding: `${S.sm}px ${S.md}px`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: S.sm, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="crm-burger" onClick={() => setMenuOuvert(true)} aria-label="Ouvrir la navigation"
              style={{ height: 38, width: 38, borderRadius: R.sm, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, cursor: "pointer", alignItems: "center", justifyContent: "center" }}>
              <Icone nom="menu" />
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.02em" }}>{marque}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <NotifBell />
            {user && <span style={{ fontSize: 13.5, color: T.ink2 }}>{user.name}{user.role === "admin" ? " · admin" : ""}</span>}
            <button onClick={deconnexion} style={{ height: 36, padding: "0 14px", borderRadius: R.pill, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
              Déconnexion
            </button>
          </div>
        </header>

        {backup?.token && (
          <div style={{ background: T.infoSoft, borderBottom: `1px solid ${T.line}`, padding: `10px ${S.md}px`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, color: T.info, fontWeight: 600 }}>
              Vue de support : tu es connecté en tant que {user?.name ?? "un autre compte"}.
            </span>
            <button onClick={revenirAdmin} style={{ height: 32, padding: "0 12px", borderRadius: R.pill, border: `1px solid ${T.info}`, background: T.surface, color: T.info, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Revenir à mon compte
            </button>
          </div>
        )}

        <main style={{ flex: 1, padding: `${S.lg}px ${S.md}px ${S.xxl}px`, minWidth: 0 }}>
          <div style={{ maxWidth: wide ? 1400 : 1100, margin: "0 auto", minWidth: 0 }}>{children}</div>
        </main>
      </div>
    </div>
  );
}

const CSS = `
  .crm-burger { display: none; }
  @media (max-width: 900px) {
    .crm-aside { display: none; }
    .crm-main { margin-left: 0 !important; }
    .crm-burger { display: inline-flex !important; }
  }
`;
