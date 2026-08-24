"use client";

import { T, R, S } from "./tokens";

export { T, R, S };
export { default as DatePicker, DateRange, dateFR } from "./DatePicker";

/** Titre de page : nom, phrase d'explication, actions à droite. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: S.md, flexWrap: "wrap", marginBottom: S.lg }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: T.ink }}>{title}</h1>
        {subtitle && <p style={{ margin: "6px 0 0", fontSize: 15, color: T.ink2, maxWidth: "60ch", lineHeight: 1.5 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: S.xs, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

/** Carte : le conteneur de base de tous les blocs. */
export function Card({ title, description, actions, children, padding = S.lg }: {
  title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; padding?: number;
}) {
  return (
    <section style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: R.lg, marginBottom: S.md }}>
      {(title || actions) && (
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S.md, flexWrap: "wrap", padding: `${S.md}px ${padding}px`, borderBottom: `1px solid ${T.line}` }}>
          <div>
            {title && <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.ink }}>{title}</h2>}
            {description && <p style={{ margin: "4px 0 0", fontSize: 14, color: T.ink2, maxWidth: "70ch", lineHeight: 1.5 }}>{description}</p>}
          </div>
          {actions && <div style={{ display: "flex", gap: S.xs, flexWrap: "wrap" }}>{actions}</div>}
        </header>
      )}
      <div style={{ padding }}>{children}</div>
    </section>
  );
}

/** Chiffre clé : une valeur, son libellé, éventuellement une précision.
 *  Avec `onClick`, la carte devient un filtre : cliquer montre les lignes qui la composent. */
export function StatCard({ label, value, hint, onClick, actif }: {
  label: string; value: string | number; hint?: string; onClick?: () => void; actif?: boolean;
}) {
  const contenu = (
    <>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: actif ? T.brand : T.ink3 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: T.ink, marginTop: 6, letterSpacing: "-0.02em" }}>{value}</div>
      {hint && <div style={{ fontSize: 13, color: T.ink2, marginTop: 2 }}>{hint}</div>}
      {onClick && (
        <div style={{ fontSize: 12, fontWeight: 700, color: actif ? T.brand : T.ink3, marginTop: 8 }}>
          {actif ? "Filtre appliqué" : "Voir le détail"}
        </div>
      )}
    </>
  );

  const base: React.CSSProperties = {
    background: T.surface, borderRadius: R.md, padding: S.md, textAlign: "left", width: "100%",
    border: `1px solid ${actif ? T.brand : T.line}`,
    boxShadow: actif ? `0 0 0 3px ${T.brandSoft}` : "none",
  };

  if (!onClick) return <div style={base}>{contenu}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={actif} style={{ ...base, cursor: "pointer", font: "inherit", color: "inherit" }}>
      {contenu}
    </button>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: S.sm, marginBottom: S.md }}>{children}</div>;
}

export type Ton = "neutre" | "succes" | "attente" | "danger" | "info";

const TONS: Record<Ton, { bg: string; fg: string }> = {
  neutre: { bg: T.surface3, fg: T.ink2 },
  succes: { bg: T.successSoft, fg: T.success },
  attente: { bg: T.warningSoft, fg: T.warning },
  danger: { bg: T.dangerSoft, fg: T.danger },
  info: { bg: T.brandSoft, fg: T.brand },
};

/** Pastille d'état, toujours lisible : fond doux, texte contrasté. */
export function Badge({ children, ton = "neutre" }: { children: React.ReactNode; ton?: Ton }) {
  const c = TONS[ton];
  return (
    <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: R.pill, fontSize: 12, fontWeight: 700, background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

type BoutonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "principal" | "secondaire" | "discret" | "danger" };

export function Button({ variante = "secondaire", style, ...rest }: BoutonProps) {
  const base: React.CSSProperties = {
    height: 38, padding: "0 14px", borderRadius: R.sm, fontSize: 13.5, fontWeight: 700,
    cursor: rest.disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 8,
  };
  const styles: Record<string, React.CSSProperties> = {
    principal: { ...base, border: "none", background: rest.disabled ? T.surface3 : T.brand, color: rest.disabled ? T.ink3 : "#fff" },
    secondaire: { ...base, border: `1px solid ${T.line}`, background: T.surface, color: T.ink },
    discret: { ...base, height: 32, padding: "0 10px", fontSize: 12.5, border: `1px solid ${T.line}`, background: T.surface, color: T.ink2 },
    danger: { ...base, height: 32, padding: "0 10px", fontSize: 12.5, border: `1px solid ${T.line}`, background: T.surface, color: T.danger },
  };
  return <button {...rest} style={{ ...styles[variante], ...style }} />;
}

/** Champ de formulaire : libellé au-dessus, aide en dessous. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 12.5, color: T.ink2, marginTop: 5 }}>{hint}</span>}
    </label>
  );
}

export const champ: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", height: 44, padding: "0 14px", fontSize: 15,
  border: `1px solid ${T.line}`, borderRadius: R.sm, background: T.surface, color: T.ink,
};

export function FormGrid({ children, colonnes = "repeat(auto-fit, minmax(200px, 1fr))" }: { children: React.ReactNode; colonnes?: string }) {
  return <div style={{ display: "grid", gridTemplateColumns: colonnes, gap: S.md, marginBottom: S.md }}>{children}</div>;
}

export type Colonne<L> = {
  cle: string;
  titre: string;
  aligne?: "gauche" | "droite" | "centre";
  rendu: (ligne: L) => React.ReactNode;
};

/** Table lisible : en-tête discret, lignes aérées, colonnes alignées selon leur nature. */
export function DataTable<L extends { id: number | string }>({ colonnes, lignes, vide }: {
  colonnes: Colonne<L>[]; lignes: L[]; vide: string;
}) {
  if (lignes.length === 0) {
    return <div style={{ padding: `${S.lg}px 0`, textAlign: "center", fontSize: 15, color: T.ink2 }}>{vide}</div>;
  }
  const align = (a?: string): "right" | "center" | "left" => (a === "droite" ? "right" : a === "centre" ? "center" : "left");
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {colonnes.map((c) => (
              <th key={c.cle} style={{ textAlign: align(c.aligne), padding: "0 12px 10px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: T.ink3, whiteSpace: "nowrap" }}>
                {c.titre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id}>
              {colonnes.map((c) => (
                <td key={c.cle} style={{ textAlign: align(c.aligne), padding: "14px 12px", borderTop: `1px solid ${T.line}`, fontSize: 14.5, color: T.ink, verticalAlign: "middle" }}>
                  {c.rendu(l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Montant : toujours aligné à droite, jamais ambigu. */
export function Euro({ montant, discret }: { montant: number; discret?: boolean }) {
  return (
    <span style={{ fontWeight: discret ? 500 : 700, color: discret ? T.ink2 : T.ink, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
      {montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })}
    </span>
  );
}
