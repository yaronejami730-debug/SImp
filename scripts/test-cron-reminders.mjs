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

// Pick a real user to use as owner.
const u = await pool.query("select email, name from users limit 1");
const owner = u.rows[0]?.email ?? "test@example.com";
const ownerName = u.rows[0]?.name ?? "";
console.log("Owner (organisateur) :", owner, `(${ownerName})`);

// Insert a fake reminder remind_at = now()+10min.
const insert = await pool.query(
  `insert into reminders (first_name, last_name, phone, listing_url, note, remind_at, owner, client_email)
   values ('Jean', 'Test', '06 00 00 00 00', 'https://leboncoin.fr/test', 'Test cron', now() + interval '10 minutes', $1, '')
   returning *`,
  [owner],
);
const r = insert.rows[0];
console.log("Inséré reminder id=", r.id, "remind_at=", r.remind_at);

// Run the same query as dueReminders(30).
const due = await pool.query(
  `select * from reminders
   where status = 'pending'
     and notified_at is null
     and remind_at <= now() + ($1 || ' minutes')::interval
     and remind_at >= now() - interval '1 hour'
   order by remind_at asc`,
  ["30"],
);
console.log(`dueReminders(30) -> ${due.rows.length} ligne(s). Contient notre id ?`, due.rows.some((x) => x.id === r.id));

// Generate organizer email HTML using the real template.
const tpl = await import("./_load-templates.mjs").catch(() => null);

// Cleanup.
await pool.query("delete from reminders where id = $1", [r.id]);
console.log("Cleanup OK.");
await pool.end();
