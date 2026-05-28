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

const BASE = (env.APP_URL || "https://simplicicar.store").replace(/\/$/, "");

const { rows: leads } = await pool.query("select * from leads order by created_at asc");
console.log(`Re-creating ${leads.length} lead contacts with refs...\n`);

let created = 0;
for (const l of leads) {
  const websites = [l.listing_url, `${BASE}/lead/${l.lead_ref}`].filter(Boolean);
  try {
    await createGoogleContact({
      firstName: l.lead_ref,
      lastName: "",
      phone: l.phone,
      note: l.note || "",
      websites,
    });
    created++;
    console.log(`  ✅ ${l.lead_ref} — ${l.phone}`);
  } catch (e) {
    console.log(`  ❌ ${l.lead_ref}: ${e.message?.slice(0, 80)}`);
  }
}

await pool.end();
console.log(`\n✅ ${created}/${leads.length} contacts créés avec ref + websites`);
