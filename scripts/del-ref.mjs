import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
Object.assign(process.env, env);
const REF = process.argv[2];
const { Pool } = await import("pg");
const { listEvents, deleteEvent } = await import("../lib/google.ts");
const { deleteMobileAppt } = await import("../lib/mobile.ts");
const p = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 });
// 1. mobile table
const mob = await p.query("select id, ref from appointments_mobile where ref ilike $1", ["%"+REF+"%"]);
for (const r of mob.rows) { try { await deleteMobileAppt(r.id); console.log("mobile deleted", r.ref); } catch(e){ console.log("mobile err", e.message); } }
// 2. Google events with private.ref == REF
const now = Date.now();
const evs = await listEvents(new Date(now-400*864e5), new Date(now+400*864e5));
let g=0;
for (const ev of evs) { if ((ev.extendedProperties?.private?.ref||"").toUpperCase().includes(REF.toUpperCase())) { try { await deleteEvent(ev.id); g++; console.log("google deleted", ev.id, ev.summary); } catch(e){ console.log("gerr", e.message); } } }
console.log("done. google deleted:", g, "mobile:", mob.rows.length);
await p.end();
