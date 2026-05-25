import { Pool } from "pg";

let pool: Pool | undefined;

/** Pool Postgres (Supabase) partagé. */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}
