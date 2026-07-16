import { Pool } from "pg";

let pool: Pool | undefined;

/** Pool Postgres (Supabase) partagé. */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      // Pooler Supabase en mode TRANSACTION (port 6543) : ~200 connexions globales,
      // multiplexées. max modéré par instance = bon citoyen en serverless.
      max: 5,
      idleTimeoutMillis: 5000,     // libère vite les connexions inactives
      connectionTimeoutMillis: 10000, // patiente au lieu d'échouer sous contention
    });
  }
  return pool;
}
