import { readFileSync } from "node:fs";
import { Pool } from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const pool = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const c = await pool.connect();
try {
  console.log("=== AVIS (reviews) ===");
  const r = await c.query("select id, first_name, last_name, email, rating, q_accueil, q_recommande, commentaire, created_at from reviews order by created_at");
  for (const x of r.rows) console.log(`#${x.id} ${x.created_at.toISOString()} | ${x.rating}/5 | nom="${x.first_name} ${x.last_name}" mail="${x.email}" | accueil=${x.q_accueil} reco=${x.q_recommande}`);

  console.log("\n=== RELANCES signed (cancellation_followups type=signed) ===");
  const f = await c.query("select id, email, first_name, last_name, stage, next_send_at, done, type from cancellation_followups where type='signed' order by next_send_at");
  for (const x of f.rows) console.log(`#${x.id} ${x.email} | ${x.first_name} ${x.last_name} | next_send=${x.next_send_at?.toISOString?.() ?? x.next_send_at} done=${x.done} stage=${x.stage}`);

  console.log("\n=== TOUTES relances (pour contexte timing) ===");
  const all = await c.query("select email, first_name, last_name, type, next_send_at, done from cancellation_followups order by next_send_at");
  for (const x of all.rows) console.log(`${x.type} | ${x.first_name} ${x.last_name} <${x.email}> next=${x.next_send_at?.toISOString?.() ?? x.next_send_at} done=${x.done}`);
} finally {
  c.release();
  await pool.end();
}
