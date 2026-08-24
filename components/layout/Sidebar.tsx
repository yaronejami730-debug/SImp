"use client";

import Link from "next/link";
import Icone from "./Icone";
import { groupesVisibles, type ClientUserLite } from "./navigation";
import { T, R, S } from "@/components/ui/tokens";

/** Navigation latérale : où on est, ce à quoi on a droit, rien d'autre. */
export default function Sidebar({ active, user, marque, logo, onNaviguer }: {
  active: string; user: ClientUserLite | null; marque: string; logo: string; onNaviguer?: () => void;
}) {
  const groupes = groupesVisibles(user);

  return (
    <nav aria-label="Navigation principale" style={{ display: "flex", flexDirection: "column", height: "100%", background: T.surface, borderRight: `1px solid ${T.line}` }}>
      <div style={{ padding: `${S.md}px ${S.md}px ${S.sm}px`, borderBottom: `1px solid ${T.line}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={marque} style={{ maxWidth: "100%", maxHeight: 40, objectFit: "contain", objectPosition: "left" }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: `${S.md}px ${S.sm}px` }}>
        {groupes.map((g) => (
          <div key={g.titre} style={{ marginBottom: S.md }}>
            <div style={{ padding: "0 10px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.ink3 }}>
              {g.titre}
            </div>
            {g.entrees.map((e) => {
              const courant = active === e.key;
              return (
                <Link
                  key={e.key} href={e.href} onClick={onNaviguer}
                  aria-current={courant ? "page" : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: R.sm,
                    fontSize: 14.5, fontWeight: courant ? 700 : 500, textDecoration: "none",
                    background: courant ? T.brand : "transparent",
                    color: courant ? "#fff" : T.ink2,
                    marginBottom: 2,
                  }}
                >
                  <Icone nom={e.icone} />
                  {e.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
