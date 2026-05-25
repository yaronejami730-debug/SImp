"use client";

import { useState } from "react";

type Result = {
  ok: boolean;
  eventLink?: string;
  appointment?: {
    firstName: string;
    lastName: string;
    email: string;
    platform: string;
    location: string;
    startDateTime: string;
  };
  error?: string;
};

const EMPTY = {
  firstName: "",
  lastName: "",
  email: "",
  listingUrl: "",
  location: "",
  date: "",
  time: "10:00",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  fontSize: 15,
  borderRadius: 10,
  border: "1px solid #1e293b",
  background: "#0f172a",
  color: "#e2e8f0",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#94a3b8",
  marginBottom: 6,
};

export default function Home() {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  function set(key: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const ready =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    form.listingUrl.trim() &&
    form.location.trim() &&
    form.date &&
    form.time;

  async function submit() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/appointment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px" }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Prise de rendez-vous</h1>
      <p style={{ color: "#94a3b8", marginTop: 0, marginBottom: 24 }}>
        Remplis les champs. Le rendez-vous est créé dans cal.com et un
        e-mail de confirmation est envoyé au client.
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Prénom</label>
            <input
              style={inputStyle}
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              placeholder="Jean"
            />
          </div>
          <div>
            <label style={labelStyle}>Nom</label>
            <input
              style={inputStyle}
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              placeholder="Dupont"
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>E-mail du client</label>
          <input
            style={inputStyle}
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="jean.dupont@email.com"
          />
        </div>

        <div>
          <label style={labelStyle}>Lien de l'annonce</label>
          <input
            style={inputStyle}
            value={form.listingUrl}
            onChange={(e) => set("listingUrl", e.target.value)}
            placeholder="https://www.leboncoin.fr/voitures/123456789"
          />
        </div>

        <div>
          <label style={labelStyle}>Lieu</label>
          <input
            style={inputStyle}
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="12 rue de la Gare, 75010 Paris"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input
              style={inputStyle}
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Heure</label>
            <input
              style={inputStyle}
              type="time"
              value={form.time}
              onChange={(e) => set("time", e.target.value)}
            />
          </div>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={loading || !ready}
        style={{
          marginTop: 24,
          width: "100%",
          padding: "14px 20px",
          fontSize: 16,
          fontWeight: 600,
          borderRadius: 12,
          border: "none",
          cursor: loading || !ready ? "not-allowed" : "pointer",
          background: loading || !ready ? "#334155" : "#2563eb",
          color: "#fff",
        }}
      >
        {loading ? "Création en cours…" : "Créer le rendez-vous"}
      </button>

      {result?.ok && result.appointment && (
        <div
          style={{
            marginTop: 24,
            padding: 20,
            borderRadius: 12,
            background: "#052e1a",
            border: "1px solid #14532d",
          }}
        >
          <strong style={{ color: "#4ade80" }}>✅ Rendez-vous créé</strong>
          <ul style={{ margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            <li>
              {result.appointment.firstName} {result.appointment.lastName} —{" "}
              {result.appointment.email}
            </li>
            <li>{result.appointment.platform}</li>
            <li>{result.appointment.location}</li>
            <li>
              {new Date(result.appointment.startDateTime).toLocaleString(
                "fr-FR",
                { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" },
              )}
            </li>
          </ul>
          {result.eventLink && (
            <a
              href={result.eventLink}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#60a5fa", display: "inline-block", marginTop: 12 }}
            >
              Ouvrir la réservation cal.com →
            </a>
          )}
        </div>
      )}

      {result && !result.ok && (
        <div
          style={{
            marginTop: 24,
            padding: 20,
            borderRadius: 12,
            background: "#3f1212",
            border: "1px solid #7f1d1d",
            color: "#fca5a5",
          }}
        >
          ❌ {result.error}
        </div>
      )}
    </main>
  );
}
