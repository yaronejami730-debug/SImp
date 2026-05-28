"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Shell from "@/components/Shell";
import { authHeaders } from "@/lib/client";

const NAVY = "#1a273a";
const PINK = "#DB407A";
const ACCENT = "#24B9D7";

type Lead = {
  id: number;
  phone: string;
  listing_url: string;
  note: string | null;
  status: string;
  lead_ref: string;
  created_at: string;
};

const platformOf = (url: string) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.includes("leboncoin")) return "LeBonCoin";
    if (h.includes("lacentrale")) return "LaCentrale";
    if (h.includes("paruvendu")) return "ParuVendu";
    return h;
  } catch { return "Lien"; }
};

const waPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("33")) return d;
  if (d.startsWith("0")) return "33" + d.slice(1);
  return d;
};

function LeadDetail() {
  const { ref } = useParams<{ ref: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/lead?ref=${encodeURIComponent(ref)}`, { headers: authHeaders() });
        const d = await res.json();
        if (d.ok) setLead(d.lead);
        else setErr(d.error ?? "Lead introuvable");
      } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
      finally { setLoading(false); }
    })();
  }, [ref]);

  if (loading) return <p style={{ color: "#6b7280", textAlign: "center" }}>Chargement…</p>;
  if (err || !lead) return <p style={{ color: "#dc2626", textAlign: "center" }}>❌ {err || "Lead introuvable"}</p>;

  const fmtDate = new Date(lead.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" });

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 24, boxShadow: "0 4px 6px rgba(26,39,58,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Cabin',sans-serif", fontSize: 13, color: PINK, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Lead {lead.lead_ref}
          </div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: 28 }}>{lead.phone}</div>
        </div>
        <div style={{ fontSize: 13, color: "#9aa6b8", textAlign: "right" }}>
          Créé le {fmtDate}
        </div>
      </div>

      {lead.listing_url && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Annonce</div>
          <a href={lead.listing_url} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontSize: 15, fontWeight: 600, textDecoration: "none", wordBreak: "break-all" }}>
            {platformOf(lead.listing_url)} — ouvrir l&apos;annonce →
          </a>
        </div>
      )}

      {lead.note && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Note</div>
          <div style={{ fontSize: 15, color: NAVY }}>{lead.note}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
        <a
          href={`tel:${lead.phone.replace(/\s/g, "")}`}
          style={{ flex: "1 1 auto", textAlign: "center", padding: "13px 16px", borderRadius: 10, background: "#16a34a", color: "#fff", textDecoration: "none", fontSize: 16, fontWeight: 600 }}
        >
          📞 Appeler
        </a>
        <a
          href={`https://wa.me/${waPhone(lead.phone)}`}
          target="_blank"
          rel="noreferrer"
          style={{ flex: "1 1 auto", textAlign: "center", padding: "13px 16px", borderRadius: 10, background: "#25D366", color: "#fff", textDecoration: "none", fontSize: 16, fontWeight: 600 }}
        >
          💬 WhatsApp
        </a>
      </div>
    </div>
  );
}

export default function Page() {
  return <Shell active="prospection"><LeadDetail /></Shell>;
}
