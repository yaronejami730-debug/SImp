import { readFileSync } from "node:fs";
import { Pool } from "pg";

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

// Cherche le RDV de Sekou Toure pour récupérer le véhicule.
const timeMin = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
let vehicle = "", first = "Sekou", last = "Toure", email = "sekout508@gmail.com";
let pageToken;
do {
  const res = await calendar.events.list({ calendarId: CAL_ID, timeMin, timeMax, singleEvents: true, maxResults: 250, pageToken });
  for (const ev of res.data.items ?? []) {
    const p = ev.extendedProperties?.private ?? {};
    if ((p.clientEmail || "").toLowerCase() === email) {
      first = p.clientFirstName || first;
      last = p.clientLastName || last;
      vehicle = [p.carBrand, p.carModel, p.carFinish].filter(Boolean).join(" ");
    }
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);

console.log(`Véhicule trouvé: "${vehicle}" pour ${first} ${last}`);

const pool = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const c = await pool.connect();
try {
  await c.query(
    "update reviews set first_name=$1, last_name=$2, email=$3, vehicle=$4 where id=1",
    [first, last, email, vehicle],
  );
  const r = await c.query("select id, first_name, last_name, email, vehicle, rating from reviews where id=1");
  console.log("Avis #1 mis à jour:", r.rows[0]);
} finally {
  c.release();
  await pool.end();
}
