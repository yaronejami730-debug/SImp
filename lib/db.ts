import { Pool } from "pg";

let pool: Pool | undefined;

/** Pool Postgres (Supabase) partagé. */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 14, // Supabase session mode limit: 15. Use 14 to leave 1 margin
      idleTimeoutMillis: 10000, // Close idle connections faster (10s vs 30s)
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}
