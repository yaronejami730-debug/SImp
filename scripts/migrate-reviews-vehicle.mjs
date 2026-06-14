import { readFileSync } from "node:fs";
import { Pool } from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const pool = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const sql = readFileSync("supabase/reviews_vehicle.sql", "utf8");
const client = await pool.connect();
try {
  await client.query(sql);
  console.log("OK: colonne vehicle ajoutée à reviews + cancellation_followups.");
} finally {
  client.release();
  await pool.end();
}
