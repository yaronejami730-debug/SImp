import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
Object.assign(process.env, env);

const { google } = await import("googleapis");
const gMod = await import("../lib/google.ts");
const createGoogleContact = gMod.createGoogleContact;

const auth = new google.auth.OAuth2(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET);
auth.setCredentials({ refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN });

const calendar = google.calendar({ version: "v3", auth });
const people = google.people({ version: "v1", auth });

const CAL_ID = env.GOOGLE_CALENDAR_ID || "primary";
const DRY = process.argv.includes("--dry");

// Plage : depuis 6 mois en arrière jusqu'à demain.
const timeMin = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
const timeMax = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();

console.log(`Scan RDV simplici-rdv ${timeMin.slice(0, 10)} → ${timeMax.slice(0, 10)}${DRY ? " [DRY-RUN]" : ""}\n`);

const events = [];
let pageToken;
do {
  const res = await calendar.events.list({
    calendarId: CAL_ID,
    timeMin, timeMax,
    privateExtendedProperty: ["app=simplici-rdv"],
    singleEvents: true,
    maxResults: 250,
    pageToken,
  });
  events.push(...(res.data.items ?? []));
  pageToken = res.data.nextPageToken;
} while (pageToken);

console.log(`${events.length} RDV trouvés.`);

// Index contacts existants par téléphone (normalisé).
function normPhone(p) { return (p || "").replace(/\D/g, "").replace(/^0(\d{9})$/, "33$1"); }

const existingByPhone = new Map();
let nextPage;
do {
  const r = await people.people.connections.list({
    resourceName: "people/me",
    pageSize: 1000,
    personFields: "phoneNumbers",
    pageToken: nextPage,
  });
  for (const c of r.data.connections ?? []) {
    for (const p of c.phoneNumbers ?? []) {
      const np = normPhone(p.value);
      if (np) existingByPhone.set(np, c.resourceName);
    }
  }
  nextPage = r.data.nextPageToken;
} while (nextPage);

console.log(`${existingByPhone.size} contacts existants indexés par téléphone.\n`);

let created = 0, skipped = 0, failed = 0;
for (const ev of events) {
  const p = ev.extendedProperties?.private ?? {};
  const phone = p.clientPhone;
  const firstName = p.clientFirstName || "";
  const lastName = p.clientLastName || "";
  const email = p.clientEmail || "";
  const listingUrl = p.listingUrl || "";
  const platform = p.platform || "";

  if (!phone || !firstName) { skipped++; continue; }

  const np = normPhone(phone);
  if (existingByPhone.has(np)) {
    console.log(`  ⏭️  ${firstName} ${lastName} (${phone}) déjà contact`);
    skipped++;
    continue;
  }

  if (DRY) {
    console.log(`  + ${firstName} ${lastName} (${phone}) → CREATE`);
    created++;
    continue;
  }

  try {
    await createGoogleContact({
      firstName, lastName, phone, email,
      note: [platform, listingUrl].filter(Boolean).join(" — "),
    });
    existingByPhone.set(np, "new");
    created++;
    console.log(`  ✅ ${firstName} ${lastName} (${phone})`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${firstName} ${lastName}: ${e.message?.slice(0, 100)}`);
  }
}

console.log(`\nBilan: ${created} créés, ${skipped} ignorés (déjà contact / data manquante), ${failed} erreurs.`);
