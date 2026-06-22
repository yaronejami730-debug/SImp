import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { google } from "googleapis";

const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const pool = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const tokset = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

const c = await pool.connect();

// 1) Chaque entité = un commercial (son admin). Marque les admins comme commerciaux.
const marked = await c.query("update users set is_commercial = true where role = 'admin' and is_commercial = false");
console.log(`Admins marqués commerciaux : ${marked.rowCount}`);

// Construit le résolveur nom -> email : comptes commerciaux + (entité.default_commercial -> admin).
const users = (await c.query("select email, name, role, call_center_id, is_commercial from users")).rows;
const ccs = (await c.query("select id, default_commercial from call_centers where default_commercial <> ''")).rows;
const adminByCc = {}; for (const u of users) if (u.role === "admin") adminByCc[u.call_center_id] = u.email;
function resolve(name){
  const t = tokset(name); if(!t) return "";
  const byName = users.find(u => u.is_commercial && tokset(u.name) === t);
  if (byName) return byName.email;
  const cc = ccs.find(x => tokset(x.default_commercial) === t);
  return cc ? (adminByCc[cc.id] ?? "") : "";
}

// 2) RDV déplacement : remplir commercial_email manquant.
const mob = (await c.query("select id, commercial from appointments_mobile where commercial <> '' and coalesce(commercial_email,'') = ''")).rows;
let mDone = 0; const mMap = {};
for (const r of mob){ const email = resolve(r.commercial); if(email){ await c.query("update appointments_mobile set commercial_email=$2 where id=$1",[r.id,email]); mDone++; mMap[r.commercial]=email; } else mMap[r.commercial]="(aucun compte)"; }
console.log(`Déplacement liés : ${mDone}/${mob.length}`, JSON.stringify(mMap));
c.release();

// 3) Events Google (physique + déplacement own) : remplir commercialEmail manquant.
const auth = new google.auth.OAuth2(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET);
auth.setCredentials({ refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN });
const cal = google.calendar({ version: "v3", auth });
const CAL = env.GOOGLE_CALENDAR_ID;
const now = Date.now();
let pageToken, all = [];
do {
  const r = await cal.events.list({ calendarId: CAL, singleEvents: true, maxResults: 2500, timeMin: new Date(now-120*864e5).toISOString(), timeMax: new Date(now+220*864e5).toISOString(), pageToken });
  all = all.concat(r.data.items ?? []); pageToken = r.data.nextPageToken;
} while (pageToken);

let gDone=0, gSkip=0; const gMap={};
for (const ev of all){
  const p = ev.extendedProperties?.private;
  if (!p || !ev.id || !p.commercial || p.commercialEmail) continue;
  const email = resolve(p.commercial);
  if (email){
    await cal.events.patch({ calendarId: CAL, eventId: ev.id, requestBody: { extendedProperties: { private: { commercialEmail: email } } } });
    gDone++; gMap[p.commercial]=email;
  } else { gSkip++; gMap[p.commercial]="(aucun compte)"; }
}
console.log(`Events Google liés : ${gDone}, non résolus : ${gSkip}`, JSON.stringify(gMap));
await pool.end();
process.exit(0);
