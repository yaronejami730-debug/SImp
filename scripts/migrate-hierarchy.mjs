import { readFileSync } from "node:fs";
import { Pool } from "pg";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const pool = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const sql = readFileSync("supabase/entity_hierarchy.sql","utf8");
const c = await pool.connect();
try {
  await c.query(sql);
  const r = await c.query("select count(*)::int n from information_schema.columns where table_name='call_centers' and column_name='parent_id'");
  console.log(`OK: call_centers.parent_id present=${r.rows[0].n}`);
} finally { c.release(); await pool.end(); }
