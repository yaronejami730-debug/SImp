import { readFileSync } from "node:fs";
import { Pool } from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const pool = new Pool({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const sql = readFileSync("supabase/commercial_accounts.sql", "utf8");

const client = await pool.connect();
try {
  await client.query(sql);
  const u = await client.query("select count(*)::int n from information_schema.columns where table_name='users' and column_name='is_commercial'");
  const m = await client.query("select count(*)::int n from information_schema.columns where table_name='appointments_mobile' and column_name='commercial_email'");
  console.log(`OK: users.is_commercial present=${u.rows[0].n}, appointments_mobile.commercial_email present=${m.rows[0].n}`);
} finally {
  client.release();
  await pool.end();
}
