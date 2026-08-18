// Crée les tables de l'espace DDE et le compte administrateur.
// Usage : node scripts/migrate-dde.mjs [email] [motDePasse] [nom]
import { readFileSync } from "node:fs";
import { scryptSync, randomBytes } from "node:crypto";
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

const hash = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
};

const [email = "admin@dde.fr", password = "Dde-Admin-2026!", name = "Administrateur DDE"] = process.argv.slice(2);

const pool = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await pool.query(readFileSync("supabase/dde.sql", "utf8"));
await pool.query(
  `insert into dde_users (email, password_hash, name, role)
   values ($1,$2,$3,'admin')
   on conflict (email) do update set password_hash = excluded.password_hash, name = excluded.name, role = 'admin', active = true`,
  [email.toLowerCase(), hash(password), name],
);
const { rows } = await pool.query(`select email, name, role, active from dde_users order by role, name`);
console.table(rows);
await pool.end();
