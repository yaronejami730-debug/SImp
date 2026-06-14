"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

type TplMeta = { key: string; label: string; group: string };
type Preview = { key: string; label: string; subject: string; html: string };

export default function Page() {
  return (
    <Shell active="templates">
      <Templates />
    </Shell>
  );
}

function Templates() {
  const [list, setList] = useState<TplMeta[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [err, setErr] = useState("");

  // Charge la liste des templates.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/templates", { headers: authHeaders() });
        const d = await res.json();
        if (d.ok) {
          setList(d.templates);
          if (d.templates[0]) setSel(d.templates[0].key);
        } else setErr(d.error ?? "Erreur");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  // Charge l'aperçu du template sélectionné.
  useEffect(() => {
    if (!sel) return;
    let alive = true;
    setLoadingPrev(true);
    (async () => {
      try {
        const res = await fetch(`/api/templates?key=${sel}`, { headers: authHeaders() });
        const d = await res.json();
        if (alive && d.ok) setPreview(d);
      } finally {
        if (alive) setLoadingPrev(false);
      }
    })();
    return () => { alive = false; };
  }, [sel]);

  if (loadingList) return <div style={{ textAlign: "center", padding: 40, color: MUTED }}>Chargement…</div>;
  if (err) return <div style={{ padding: 20, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#dc2626" }}>❌ {err}</div>;

  // Regroupe par catégorie.
  const groups: { name: string; items: TplMeta[] }[] = [];
  for (const t of list) {
    let g = groups.find((x) => x.name === t.group);
    if (!g) { g = { name: t.group, items: [] }; groups.push(g); }
    g.items.push(t);
  }

  return (
    <>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontFamily: "'Cabin',sans-serif", fontSize: 24, fontWeight: 700, color: NAVY }}>Templates d'emails</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Aperçu de tous les mails envoyés ({list.length})</p>
      </header>

      {/* Sélecteur groupé */}
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        {groups.map((g) => (
          <div key={g.name} style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 12, fontWeight: 700, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{g.name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {g.items.map((t) => {
                const on = sel === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setSel(t.key)}
                    style={{
                      cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: "7px 11px", borderRadius: 8,
                      border: `1px solid ${on ? NAVY : LINE}`, background: on ? NAVY : "#fff", color: on ? "#fff" : MUTED,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Aperçu */}
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, opacity: loadingPrev ? 0.5 : 1, transition: "opacity .15s" }}>
        {preview ? (
          <>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Objet</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 12 }}>{preview.subject}</div>
            <iframe
              title="aperçu"
              srcDoc={preview.html}
              style={{ width: "100%", height: 620, border: `1px solid ${LINE}`, borderRadius: 10, background: "#fff" }}
            />
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 30, color: MUTED }}>Sélectionnez un template…</div>
        )}
      </div>
    </>
  );
}
