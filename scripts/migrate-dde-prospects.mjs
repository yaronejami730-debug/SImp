// Crée la table des prospects DDE et ajoute e-mail / prospect_id aux rendez-vous.
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const pool = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await pool.query(readFileSync("supabase/dde_prospects.sql", "utf8"));

for (const table of ["dde_prospects", "dde_appointments"]) {
  const { rows } = await pool.query(
    `select column_name from information_schema.columns where table_name = $1 order by ordinal_position`, [table],
  );
  console.log(`${table} :`, rows.map((r) => r.column_name).join(", "));
}
await pool.end();
