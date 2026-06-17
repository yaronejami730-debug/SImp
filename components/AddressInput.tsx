"use client";

import { useEffect, useRef, useState } from "react";
import { authHeaders } from "@/lib/client";

type Suggestion = { label: string; lat: number; lng: number };

/** Champ adresse avec autocomplétion (Nominatim via /api/geocode/suggest). */
export default function AddressInput({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [sugg, setSugg] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const justPicked = useRef(false);

  // Debounce de la recherche.
  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return; }
    const q = value.trim();
    if (q.length < 3) { setSugg([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
        const d = await r.json();
        if (d.ok) { setSugg(d.suggestions); setOpen(d.suggestions.length > 0); setActive(-1); }
      } catch { /* ignore */ }
    }, 350);
    return () => clearTimeout(t);
  }, [value]);

  // Ferme au clic extérieur.
  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function pick(s: Suggestion) {
    justPicked.current = true;
    onChange(s.label);
    setOpen(false); setSugg([]);
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => sugg.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, sugg.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(sugg[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        style={style}
      />
      {open && sugg.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 8px 20px rgba(0,0,0,0.12)", overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
          {sugg.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActive(i)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", fontSize: 13, color: "#232323", background: i === active ? "#f1f5f9" : "#fff", border: "none", borderBottom: "1px solid #f1f3f5", cursor: "pointer" }}
            >
              📍 {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
