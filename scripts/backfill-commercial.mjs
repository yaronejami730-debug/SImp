import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
Object.assign(process.env, env);

const { google } = await import("googleapis");

const auth = new google.auth.OAuth2(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET);
auth.setCredentials({ refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN });
const calendar = google.calendar({ version: "v3", auth });

const CAL_ID = env.GOOGLE_CALENDAR_ID || "primary";
const COMMERCIAL = "Raphaël Dahan";
const DRY = process.argv.includes("--dry");

// Plage : 3 ans en arrière → 1 an en avant.
const timeMin = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString();
const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

console.log(`Backfill commercial="${COMMERCIAL}" ${timeMin.slice(0, 10)} → ${timeMax.slice(0, 10)}${DRY ? " [DRY-RUN]" : ""}\n`);

const events = [];
let pageToken;
do {
  const res = await calendar.events.list({ calendarId: CAL_ID, timeMin, timeMax, singleEvents: true, maxResults: 250, pageToken });
  for (const ev of res.data.items ?? []) {
    const p = ev.extendedProperties?.private;
    if (p?.app === "simplici-rdv" || p?.clientEmail || p?.clientPhone) events.push(ev);
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);

console.log(`${events.length} RDV trouvés.\n`);

let patched = 0, skipped = 0, failed = 0;
for (const ev of events) {
  const p = ev.extendedProperties?.private ?? {};
  const name = `${p.clientFirstName ?? ""} ${p.clientLastName ?? ""}`.trim() || ev.id;
  if (p.commercial && p.commercial.trim()) { skipped++; continue; } // déjà attribué
  if (DRY) { console.log(`  + ${name} → ${COMMERCIAL}`); patched++; continue; }
  try {
    await calendar.events.patch({
      calendarId: CAL_ID,
      eventId: ev.id,
      requestBody: { extendedProperties: { private: { commercial: COMMERCIAL } } },
    });
    patched++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message?.slice(0, 100)}`);
  }
}

console.log(`\nBilan: ${patched} attribués, ${skipped} déjà attribués, ${failed} erreurs.`);
