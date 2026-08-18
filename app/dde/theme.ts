// Charte reprise telle quelle du HTML fourni (Adréminga / DDE) : beige + encre noire.
export const INK = "#1a1a1a";
export const BG = "#faf8f5";
export const LINE = "#b8b3ac";
export const MUTED = "#a8a39a";
export const SOFT = "#f2efe9";
export const DISABLED = "#e9e6e1";

export const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", height: 56, padding: "0 18px", fontSize: 16,
  border: `1px solid ${LINE}`, borderRadius: 10, background: "#fff",
};

export const label: React.CSSProperties = {
  display: "block", fontSize: 18, fontWeight: 700, color: INK, marginBottom: 12,
};

export const pill = (enabled: boolean): React.CSSProperties => ({
  height: 56, padding: "0 32px", borderRadius: 28, border: "none", fontSize: 17, fontWeight: 700,
  background: enabled ? INK : DISABLED, color: enabled ? "#fff" : MUTED, cursor: enabled ? "pointer" : "not-allowed",
});

export const WEEKDAYS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
export const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Groupe WhatsApp DDE (lien d'invitation fourni par l'admin). */
export const WHATSAPP_GROUP = "https://chat.whatsapp.com/KvI9SeS2MBT49rogGHa8ma?s=cl&p=i&ilr=0";
