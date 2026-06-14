import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const KEY = env.BREVO_API_KEY;
const emails = ["sekout508@gmail.com", "bulut.osman@hotmail.fr"];

for (const email of emails) {
  console.log(`\n===== ${email} =====`);
  const url = `https://api.brevo.com/v3/smtp/statistics/events?limit=100&startDate=2026-05-30&endDate=2026-06-03&email=${encodeURIComponent(email)}&sort=asc`;
  const res = await fetch(url, { headers: { "api-key": KEY, accept: "application/json" } });
  if (!res.ok) { console.log(`  HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); continue; }
  const d = await res.json();
  const events = d.events ?? [];
  if (!events.length) { console.log("  (aucun évènement sur la période)"); continue; }
  for (const e of events) {
    console.log(`  ${e.date} | ${e.event} | subject="${e.subject ?? ""}" ${e.link ? `link=${e.link}` : ""}`);
  }
}
