"use client";

import { useEffect, useState } from "react";
import { BRAND_LIST, CAR_CATALOG } from "@/lib/car-catalog";

const PINK = "var(--brand-primary)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: 12, fontSize: 15, borderRadius: 8,
  border: "1.5px solid #e5e7eb", background: "#fff", color: "#232323",
  boxSizing: "border-box", fontFamily: "inherit",
};

type Props = {
  brand: string;
  model: string;
  finish?: string;
  onChange: (brand: string, model: string, finish?: string) => void;
};

// L'état "autre" est local : on garde un flag pour afficher le champ texte
// même quand la marque/modèle libre est encore vide.
export default function VehiclePicker({ brand, model, finish = "", onChange }: Props) {
  const brandInList = BRAND_LIST.includes(brand);
  const [brandOther, setBrandOther] = useState(!!brand && !brandInList);
  const models = brandInList ? CAR_CATALOG[brand] : [];
  const modelInList = models.includes(model);
  const [modelOther, setModelOther] = useState(!!model && !modelInList);

  // Sync si on revient à une marque connue
  useEffect(() => { if (brandInList) setBrandOther(false); }, [brandInList]);
  useEffect(() => { if (modelInList) setModelOther(false); }, [modelInList]);

  const brandSelectValue = brandOther ? "__other__" : brand;
  const modelSelectValue = modelOther ? "__other__" : model;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <select
          value={brandSelectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__other__") { setBrandOther(true); setModelOther(false); onChange("", "", finish); }
            else { setBrandOther(false); onChange(v, "", finish); }
          }}
          style={inputStyle}
        >
          <option value="">— Marque —</option>
          {BRAND_LIST.map((b) => <option key={b} value={b}>{b}</option>)}
          <option value="__other__">Autre…</option>
        </select>
        {brandOther && (
          <input
            value={brand}
            onChange={(e) => onChange(e.target.value, model, finish)}
            placeholder="Marque (libre)"
            style={{ ...inputStyle, marginTop: 6, borderColor: PINK }}
          />
        )}
      </div>
      <div>
        {brandInList ? (
          <select
            value={modelSelectValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__other__") { setModelOther(true); onChange(brand, "", finish); }
              else { setModelOther(false); onChange(brand, v, finish); }
            }}
            style={inputStyle}
          >
            <option value="">— Modèle —</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="__other__">Autre…</option>
          </select>
        ) : (
          <input
            value={model}
            onChange={(e) => onChange(brand, e.target.value, finish)}
            placeholder="Modèle"
            disabled={!brandOther && brand === ""}
            style={{ ...inputStyle, opacity: !brandOther && brand === "" ? 0.5 : 1 }}
          />
        )}
        {brandInList && modelOther && (
          <input
            value={model}
            onChange={(e) => onChange(brand, e.target.value, finish)}
            placeholder="Modèle (libre)"
            autoFocus
            style={{ ...inputStyle, marginTop: 6, borderColor: PINK }}
          />
        )}
      </div>
      </div>
      <input
        value={finish}
        onChange={(e) => onChange(brand, model, e.target.value)}
        placeholder="Finition / version (ex: GT Line, dCi 110, Intens) — facultatif"
        style={inputStyle}
      />
    </div>
  );
}
