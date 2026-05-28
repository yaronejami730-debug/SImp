import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
Object.assign(process.env, env);

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

const gMod = await import("../lib/google.ts");
const createGoogleContact = gMod.createGoogleContact ?? gMod.default?.createGoogleContact;

const seen = new Set();
let created = 0;
let skipped = 0;
let errors = 0;

async function sync(firstName, lastName, phone, email, note) {
  const key = (phone || "").replace(/\D/g, "") + "|" + (email || "").toLowerCase();
  if (seen.has(key)) { skipped++; return; }
  seen.add(key);
  try {
    await createGoogleContact({ firstName: firstName || "", lastName: lastName || "", phone: phone || "", email: email || "", note: note || "" });
    created++;
    console.log(`  ✅ ${firstName || ""} ${lastName || ""} — ${phone}`);
  } catch (e) {
    errors++;
    console.log(`  ❌ ${phone}: ${e.message?.slice(0, 80)}`);
  }
}

// 1. Leads
console.log("\n=== LEADS ===");
const leads = await pool.query("select phone, listing_url, note from leads order by created_at desc");
for (const l of leads.rows) {
  await sync("", "", l.phone, "", [l.note, l.listing_url].filter(Boolean).join(" — "));
}

// 2. Reminders
console.log("\n=== RAPPELS ===");
const rem = await pool.query("select first_name, last_name, phone, client_email, listing_url, note from reminders");
for (const r of rem.rows) {
  await sync(r.first_name, r.last_name, r.phone, r.client_email, [r.note, r.listing_url].filter(Boolean).join(" — "));
}

// 3. Google Calendar events (RDV existants)
console.log("\n=== RDV GOOGLE AGENDA ===");
const listAppointments = gMod.listAppointments ?? gMod.default?.listAppointments;
const now = new Date();
const past = new Date(now.getTime() - 90 * 24 * 3600 * 1000); // 90 jours en arrière
const appts = await listAppointments(past, new Date(now.getTime() + 30 * 24 * 3600 * 1000));
console.log(`  ${appts.length} RDV trouvés`);
for (const a of appts) {
  await sync(a.firstName, a.lastName, a.phone, a.email, [a.platform, a.listingUrl].filter(Boolean).join(" — "));
}

await pool.end();
console.log(`\n✅ Terminé: ${created} contacts créés, ${skipped} doublons ignorés, ${errors} erreurs`);
