import { google } from "googleapis";
import { getPool } from "./db";
import { getTokens, touchSync } from "./google-connections";
import { listAppointments, type AppointmentItem } from "./google";

/** Sync ONE-WAY (CRM -> agenda perso de l'utilisateur) :
 *  Les RDV visibles de l'utilisateur (créés ou affectés) sont copiés/à jour dans SON agenda Google.
 *  Le CRM est la SEULE référence : toute modification/suppression faite côté Google est écrasée/recréée
 *  à la sync suivante et n'affecte JAMAIS le CRM.
 *  Les copies sont mappées via google_event_map (pas de doublon). RDV annulé côté CRM -> copie supprimée. */

const tok = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

function userClient(refreshToken: string) {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth });
}

async function getMap(email: string): Promise<Map<string, string>> {
  const { rows } = await getPool().query<{ crm_event_id: string; g_event_id: string }>(
    `select crm_event_id, g_event_id from google_event_map where user_email = lower($1)`,
    [email],
  );
  return new Map(rows.map((r) => [r.crm_event_id, r.g_event_id]));
}
async function setMap(email: string, crmId: string, gId: string) {
  await getPool().query(
    `insert into google_event_map (user_email, crm_event_id, g_event_id) values (lower($1),$2,$3)
     on conflict (user_email, crm_event_id) do update set g_event_id = excluded.g_event_id, updated_at = now()`,
    [email, crmId, gId],
  );
}
async function delMap(email: string, crmId: string) {
  await getPool().query(`delete from google_event_map where user_email = lower($1) and crm_event_id = $2`, [email, crmId]);
}

// Même format que les événements du calendrier principal (createEvent) : titre, description, lieu identiques.
const BUSINESS = process.env.BUSINESS_NAME ?? "Simplicicar";
function summaryFor(a: AppointmentItem): string {
  const vehicle = [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" ");
  return `${a.type === "deplacement" ? "🚗 Déplacement" : "RDV"} ${a.firstName} ${a.lastName}${vehicle ? ` — ${vehicle}` : ""} — ${BUSINESS}`;
}
function descFor(a: AppointmentItem): string {
  const vehicle = [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" ");
  return [
    `Mode : ${a.type === "deplacement" ? "Déplacement" : "Agence"}`,
    `Client : ${a.firstName} ${a.lastName}`,
    a.email ? `E-mail : ${a.email}` : "",
    a.phone ? `Téléphone : ${a.phone}` : "",
    vehicle ? `Véhicule : ${vehicle}` : "",
    a.immatriculation ? `Immatriculation : ${a.immatriculation}` : "",
    a.platform ? `Plateforme : ${a.platform}` : "",
    a.listingUrl ? `Annonce : ${a.listingUrl}` : "",
    a.commercial ? `Commercial : ${a.commercial}` : "",
    a.teleprospector ? `Téléprospecteur : ${a.teleprospector}` : "",
    `Lieu : ${a.location || (a.type === "deplacement" ? a.address : "")}`,
  ].filter(Boolean).join("\n") + `\n\nRéférence : ${a.ref || a.id}`;
}
function locationFor(a: AppointmentItem): string {
  return a.location || (a.type === "deplacement" ? a.address : "") || "";
}

export type SyncResult = { pushed: number; updated: number; removed: number; pulledBack: number; errors: string[] };

export async function syncUser(email: string, name: string): Promise<SyncResult> {
  const res: SyncResult = { pushed: 0, updated: 0, removed: 0, pulledBack: 0, errors: [] };
  const tokens = await getTokens(email);
  if (!tokens?.refresh_token) throw new Error("Google non connecté.");
  const cal = userClient(tokens.refresh_token);

  // RDV visibles : créés par lui OU affectés à lui (comme /api/appointments).
  const now = new Date();
  const all = await listAppointments(new Date(now.getTime() - 7 * 86400e3), new Date(now.getTime() + 180 * 86400e3));
  const meLc = email.toLowerCase();
  const meTok = tok(name);
  const mine = all.filter((a) =>
    a.owner === email ||
    (!!a.commercialEmail && a.commercialEmail.toLowerCase() === meLc) ||
    (!a.commercialEmail && !!meTok && tok(a.commercial) === meTok));

  const map = await getMap(email);

  for (const a of mine) {
    if (!a.startDateTime) continue;
    const gId = map.get(a.id);
    try {
      if (a.cancelled) {
        if (gId) { try { await cal.events.delete({ calendarId: "primary", eventId: gId }); } catch { /* déjà supprimé */ } await delMap(email, a.id); res.removed++; }
        continue;
      }
      const crmStart = new Date(a.startDateTime);
      const crmEnd = new Date(crmStart.getTime() + 40 * 60000);
      if (!gId) {
        const ins = await cal.events.insert({
          calendarId: "primary",
          requestBody: {
            summary: summaryFor(a), description: descFor(a), location: locationFor(a),
            start: { dateTime: crmStart.toISOString(), timeZone: "Europe/Paris" },
            end: { dateTime: crmEnd.toISOString(), timeZone: "Europe/Paris" },
          },
        });
        if (ins.data.id) { await setMap(email, a.id, ins.data.id); res.pushed++; }
        continue;
      }
      // Copie existante : lire pour détecter un déplacement côté Google.
      let gEv: { start?: { dateTime?: string | null } | null; status?: string | null } | null = null;
      try { gEv = (await cal.events.get({ calendarId: "primary", eventId: gId })).data; } catch { gEv = null; }
      if (!gEv || gEv.status === "cancelled") {
        // Supprimée côté Google -> on la recrée (le CRM reste la référence d'existence).
        const ins = await cal.events.insert({
          calendarId: "primary",
          requestBody: {
            summary: summaryFor(a), description: descFor(a), location: locationFor(a),
            start: { dateTime: crmStart.toISOString(), timeZone: "Europe/Paris" },
            end: { dateTime: crmEnd.toISOString(), timeZone: "Europe/Paris" },
          },
        });
        if (ins.data.id) { await setMap(email, a.id, ins.data.id); res.pushed++; }
        continue;
      }
      // ONE-WAY : le CRM est la seule référence. Aucune modification/suppression côté Google
      // n'est rapatriée — la copie est simplement remise à jour depuis le CRM.
      await cal.events.patch({
        calendarId: "primary", eventId: gId,
        requestBody: {
          summary: summaryFor(a), description: descFor(a),
          start: { dateTime: crmStart.toISOString(), timeZone: "Europe/Paris" },
          end: { dateTime: crmEnd.toISOString(), timeZone: "Europe/Paris" },
        },
      });
      res.updated++;
    } catch (e) {
      res.errors.push(`${a.firstName} ${a.lastName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await touchSync(email, res.errors.length ? "error" : "connected");
  return res;
}
