import { Pool } from "pg";

let pool: Pool | undefined;

/** Pool Postgres (Supabase) partagé. */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 10, // Supabase session mode limit: 15. Use 10 to leave margin
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}
