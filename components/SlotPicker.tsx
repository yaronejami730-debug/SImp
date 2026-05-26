"use client";

import { useEffect, useState } from "react";

const PINK = "#DB407A";
const NAVY = "#1a273a";

type Slot = { time: string; taken: boolean };
type DayCache = { loading: boolean; closed?: boolean; slots: Slot[] };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const label = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

// Horaires au pas de 5 min (08:00 → 21:00) pour le menu "Autre horaire".
const CUSTOM_TIMES = (() => {
  const out: string[] = [];
  for (let m = 8 * 60; m <= 21 * 60; m += 5) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
})();

function upcomingWeekdays(n = 12): Date[] {
  const out: Date[] = [];
  for (let i = 0; out.length < n && i < 200; i++) {
    const x = new Date();
    x.setHours(12, 0, 0, 0);
    x.setDate(x.getDate() + i);
    const wd = x.getDay();
    if (wd >= 1 && wd <= 5) out.push(x);
  }
  return out;
}

export default function SlotPicker({
  value,
  onChange,
  allowCustom = true,
}: {
  value: { date: string; time: string };
  onChange: (v: { date: string; time: string }) => void;
  allowCustom?: boolean;
}) {
  const [count, setCount] = useState(12);
  const days = upcomingWeekdays(count);
  const [open, setOpen] = useState<string>(value.date || "");
  const [cache, setCache] = useState<Record<string, DayCache>>({});

  async function loadDay(date: string) {
    if (cache[date] && !cache[date].loading) return;
    setCache((c) => ({ ...c, [date]: { loading: true, slots: [] } }));
    try {
      const r = await fetch(`/api/availability?date=${date}`);
      const d = await r.json();
      setCache((c) => ({ ...c, [date]: { loading: false, slots: d.slots ?? [], closed: d.closed } }));
    } catch {
      setCache((c) => ({ ...c, [date]: { loading: false, slots: [] } }));
    }
  }

  useEffect(() => {
    if (open) loadDay(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
      {days.map((d) => {
        const date = ymd(d);
        const isOpen = open === date;
        const day = cache[date];
        const selectedHere = value.date === date && value.time;
        return (
          <div key={date} style={{ borderBottom: "1px solid #f0f1f3" }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? "" : date)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "12px 14px",
                background: isOpen ? "#f8f9fa" : "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 600,
                color: NAVY,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                textTransform: "capitalize",
              }}
            >
              <span>{label(d)}</span>
              <span style={{ fontSize: 13, color: selectedHere ? PINK : "#9aa6b8", fontWeight: 600 }}>
                {selectedHere ? `✓ ${value.time}` : isOpen ? "▲" : "▼"}
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: "10px 14px 14px" }}>
                {day?.loading && <div style={{ color: "#9aa6b8", fontSize: 14 }}>Chargement…</div>}
                {day && !day.loading && day.slots.length === 0 && (
                  <div style={{ color: "#9aa6b8", fontSize: 14 }}>Aucun créneau.</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(72px,1fr))", gap: 8 }}>
                  {day?.slots.map((s) => {
                    const sel = value.date === date && value.time === s.time;
                    return (
                      <button
                        key={s.time}
                        type="button"
                        disabled={s.taken}
                        onClick={() => onChange({ date, time: s.time })}
                        style={{
                          padding: "9px 4px",
                          fontSize: 14,
                          fontWeight: 600,
                          borderRadius: 7,
                          cursor: s.taken ? "not-allowed" : "pointer",
                          border: sel ? `1.5px solid ${PINK}` : "1.5px solid #e5e7eb",
                          background: s.taken ? "#f1f2f4" : sel ? PINK : "#fff",
                          color: s.taken ? "#c2c8d0" : sel ? "#fff" : NAVY,
                          textDecoration: s.taken ? "line-through" : "none",
                        }}
                      >
                        {s.time}
                      </button>
                    );
                  })}
                </div>
                {allowCustom && (
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Autre horaire :</span>
                    <select
                      value={value.date === date ? value.time : ""}
                      onChange={(e) => e.target.value && onChange({ date, time: e.target.value })}
                      style={{ padding: "8px 10px", borderRadius: 7, border: `1.5px solid ${value.date === date && value.time ? PINK : "#e5e7eb"}`, fontSize: 14, fontFamily: "inherit", background: "#fff" }}
                    >
                      <option value="">--:--</option>
                      {CUSTOM_TIMES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {count < 80 && (
        <button
          type="button"
          onClick={() => setCount((c) => c + 20)}
          style={{ width: "100%", padding: "11px", background: "#f8f9fa", border: "none", borderTop: "1px solid #f0f1f3", cursor: "pointer", fontSize: 14, fontWeight: 600, color: PINK }}
        >
          Voir plus de dates ▾
        </button>
      )}
    </div>
  );
}
