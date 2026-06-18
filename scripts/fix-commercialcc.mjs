import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
Object.assign(process.env, env);
const { Pool } = await import("pg");
const { entityIdByCommercial, patchMobileFirstClass } = await import("../lib/call-centers.ts").then(async m => ({ entityIdByCommercial: m.entityIdByCommercial, patchMobileFirstClass: (await import("../lib/google.ts")).patchMobileFirstClass }));
const p = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const { rows } = await p.query("select * from appointments_mobile where commercial_cc=0 and commercial<>''");
for (const a of rows) {
  const cc = await entityIdByCommercial(a.commercial) ?? 0;
  if (cc) {
    await p.query("update appointments_mobile set commercial_cc=$2 where id=$1", [a.id, cc]);
    // re-tag l'event Google avec commercialCc
    try {
      await patchMobileFirstClass(a.google_event_id_own, {
        firstName: a.first_name, lastName: a.last_name, email: a.email, phone: a.phone, civility: a.civility,
        vehicle: [a.car_brand,a.car_model].filter(Boolean).join(" "), carBrand: a.car_brand, carModel: a.car_model,
        immatriculation: a.immatriculation, commercial: a.commercial, address: a.address,
        startDateTime: a.start_datetime, durationMin: 40, notes: a.notes, ref: a.ref,
        owner: a.teleprospecteur, callCenterId: a.call_center_id, commercialCc: cc,
      });
    } catch(e){ console.log("patch err", a.id, e.message); }
    console.log("fixed", a.ref, "-> commercial_cc", cc);
  } else console.log("no entity for", a.ref, a.commercial);
}
await p.end();
