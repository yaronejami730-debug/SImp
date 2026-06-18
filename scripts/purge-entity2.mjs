import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
Object.assign(process.env, env);
const { Pool } = await import("pg");
const { listEvents, deleteEvent } = await import("../lib/google.ts");
const { deleteMobileAppt } = await import("../lib/mobile.ts");
const p = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 });

// 1. RDV déplacement (table) cc=2 -> supprime row + events Google (own + bonamy)
const mob = await p.query("select id from appointments_mobile where call_center_id=2");
for (const r of mob.rows) { try { await deleteMobileAppt(r.id); console.log("mobile deleted", r.id); } catch(e){ console.log("mobile err", r.id, e.message); } }

// 2. Scan Google : tout event tagué cc=2 (physique + orphelins) -> delete
const now = Date.now();
const evs = await listEvents(new Date(now - 400*864e5), new Date(now + 400*864e5));
let g=0;
for (const ev of evs) {
  if (ev.extendedProperties?.private?.cc === "2") { try { await deleteEvent(ev.id); g++; } catch(e){ console.log("gerr", ev.id, e.message); } }
}
console.log("google cc=2 events deleted:", g);

const left = await p.query("select count(*)::int n from appointments_mobile where call_center_id=2");
console.log("mobile rows cc=2 restants:", left.rows[0].n);
await p.end();
