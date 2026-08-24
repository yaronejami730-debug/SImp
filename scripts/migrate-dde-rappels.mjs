// Crée la table des rappels téléphoniques DDE.
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const pool = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await pool.query(readFileSync("supabase/dde_rappels.sql", "utf8"));
const { rows } = await pool.query(`select column_name from information_schema.columns where table_name = 'dde_callbacks' order by ordinal_position`);
console.log("dde_callbacks :", rows.map((r) => r.column_name).join(", "));
await pool.end();
