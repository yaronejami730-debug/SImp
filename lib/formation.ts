import { getPool } from "./db";

/** MODULE FORMATION — créneaux (individuels/groupés), partenaires, inscriptions,
 *  contenu du programme et modèle horaire, tous éditables depuis l'admin (rien en dur). */

export type Partner = { id: number; name: string; active: boolean };

export type SlotTemplateEntry = { weekday: number; start: string; end: string; type: "individuel" | "groupe"; capacity: number };
export type ProgrammeStep = { title: string };

export type Settings = {
  slotTemplate: SlotTemplateEntry[];
  defaultPartnerId: number | null;
  autoSendEnabled: boolean;
  programme: ProgrammeStep[];
};

export type Slot = {
  id: number; date: string; startTime: string; endTime: string;
  type: "individuel" | "groupe"; partnerId: number; partnerName: string;
  capacity: number; active: boolean; registered: number;
};

export type Registration = {
  id: number; slotId: number; firstName: string; lastName: string; email: string;
  type: "individuel" | "groupe"; partnerId: number; status: "inscrit" | "annule";
  emailSent: boolean; emailSentAt: string | null; createdAt: string; calendarEventId: string | null;
};

export async function listPartners(activeOnly = false): Promise<Partner[]> {
  const { rows } = await getPool().query<{ id: number; name: string; active: boolean }>(
    `select id, name, active from formation_partners ${activeOnly ? "where active" : ""} order by name`,
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name, active: r.active }));
}

export async function createPartner(name: string): Promise<Partner> {
  const { rows } = await getPool().query<{ id: number; name: string; active: boolean }>(
    `insert into formation_partners (name) values ($1) returning id, name, active`,
    [name],
  );
  return { id: Number(rows[0].id), name: rows[0].name, active: rows[0].active };
}

export async function updatePartner(id: number, patch: { name?: string; active?: boolean }) {
  const sets: string[] = []; const vals: unknown[] = [];
  if (patch.name !== undefined) { vals.push(patch.name); sets.push(`name = $${vals.length}`); }
  if (patch.active !== undefined) { vals.push(patch.active); sets.push(`active = $${vals.length}`); }
  if (!sets.length) return;
  vals.push(id);
  await getPool().query(`update formation_partners set ${sets.join(", ")} where id = $${vals.length}`, vals);
}

const DEFAULT_SETTINGS: Settings = { slotTemplate: [], defaultPartnerId: null, autoSendEnabled: false, programme: [] };

export async function getSettings(): Promise<Settings> {
  const { rows } = await getPool().query<{ slot_template: SlotTemplateEntry[]; default_partner_id: number | null; auto_send_enabled: boolean; programme: ProgrammeStep[] }>(
    `select slot_template, default_partner_id, auto_send_enabled, programme from formation_settings where id = 1`,
  );
  const r = rows[0];
  if (!r) return DEFAULT_SETTINGS;
  return {
    slotTemplate: r.slot_template ?? [],
    defaultPartnerId: r.default_partner_id == null ? null : Number(r.default_partner_id),
    autoSendEnabled: !!r.auto_send_enabled,
    programme: r.programme ?? [],
  };
}

export async function updateSettings(patch: Partial<Settings>) {
  const sets: string[] = []; const vals: unknown[] = [];
  if (patch.slotTemplate !== undefined) { vals.push(JSON.stringify(patch.slotTemplate)); sets.push(`slot_template = $${vals.length}`); }
  if (patch.defaultPartnerId !== undefined) { vals.push(patch.defaultPartnerId); sets.push(`default_partner_id = $${vals.length}`); }
  if (patch.autoSendEnabled !== undefined) { vals.push(patch.autoSendEnabled); sets.push(`auto_send_enabled = $${vals.length}`); }
  if (patch.programme !== undefined) { vals.push(JSON.stringify(patch.programme)); sets.push(`programme = $${vals.length}`); }
  if (!sets.length) return;
  sets.push(`updated_at = now()`);
  await getPool().query(
    `insert into formation_settings (id) values (1) on conflict (id) do nothing`,
  );
  await getPool().query(`update formation_settings set ${sets.join(", ")} where id = 1`, vals);
}

export async function listSlots(from: string, to: string): Promise<Slot[]> {
  const { rows } = await getPool().query<{
    id: number; date: string; start_time: string; end_time: string; type: "individuel" | "groupe";
    partner_id: number; partner_name: string; capacity: number; active: boolean; registered: string;
  }>(
    `select s.id, s.date::text as date, s.start_time, s.end_time, s.type, s.partner_id, p.name as partner_name, s.capacity, s.active,
            coalesce((select count(*) from formation_registrations r where r.slot_id = s.id and r.status = 'inscrit'), 0) as registered
       from formation_slots s
       join formation_partners p on p.id = s.partner_id
      where s.date between $1 and $2
      order by s.date, s.start_time`,
    [from, to],
  );
  return rows.map((r) => ({
    id: Number(r.id), date: r.date, startTime: r.start_time, endTime: r.end_time, type: r.type,
    partnerId: Number(r.partner_id), partnerName: r.partner_name, capacity: Number(r.capacity),
    active: r.active, registered: Number(r.registered),
  }));
}

export async function getSlot(id: number): Promise<Slot | undefined> {
  const { rows } = await getPool().query<{
    id: number; date: string; start_time: string; end_time: string; type: "individuel" | "groupe";
    partner_id: number; partner_name: string; capacity: number; active: boolean; registered: string;
  }>(
    `select s.id, s.date::text as date, s.start_time, s.end_time, s.type, s.partner_id, p.name as partner_name, s.capacity, s.active,
            coalesce((select count(*) from formation_registrations r where r.slot_id = s.id and r.status = 'inscrit'), 0) as registered
       from formation_slots s join formation_partners p on p.id = s.partner_id where s.id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return undefined;
  return {
    id: Number(r.id), date: r.date, startTime: r.start_time, endTime: r.end_time, type: r.type,
    partnerId: Number(r.partner_id), partnerName: r.partner_name, capacity: Number(r.capacity),
    active: r.active, registered: Number(r.registered),
  };
}

export async function createSlot(input: { date: string; startTime: string; endTime: string; type: "individuel" | "groupe"; partnerId: number; capacity: number }) {
  await getPool().query(
    `insert into formation_slots (date, start_time, end_time, type, partner_id, capacity)
     values ($1,$2,$3,$4,$5,$6) on conflict (date, start_time, end_time, partner_id) do nothing`,
    [input.date, input.startTime, input.endTime, input.type, input.partnerId, input.capacity],
  );
}

export async function updateSlot(id: number, patch: { startTime?: string; endTime?: string; type?: string; partnerId?: number; capacity?: number; active?: boolean }) {
  const sets: string[] = []; const vals: unknown[] = [];
  const map: Record<string, unknown> = { start_time: patch.startTime, end_time: patch.endTime, type: patch.type, partner_id: patch.partnerId, capacity: patch.capacity, active: patch.active };
  for (const [col, v] of Object.entries(map)) if (v !== undefined) { vals.push(v); sets.push(`${col} = $${vals.length}`); }
  if (!sets.length) return;
  vals.push(id);
  await getPool().query(`update formation_slots set ${sets.join(", ")} where id = $${vals.length}`, vals);
}

/** Refusé si des inscriptions existent (même annulées, pour garder l'historique lisible) —
 *  utiliser `active=false` pour fermer un créneau sans le supprimer. */
export async function deleteSlot(id: number): Promise<{ ok: boolean; reason?: string }> {
  const { rows } = await getPool().query<{ n: string }>(`select count(*)::text as n from formation_registrations where slot_id = $1`, [id]);
  if (Number(rows[0]?.n ?? 0) > 0) return { ok: false, reason: "Des inscriptions existent sur ce créneau — ferme-le (actif=non) au lieu de le supprimer." };
  await getPool().query(`delete from formation_slots where id = $1`, [id]);
  return { ok: true };
}

/** Convertit un jour ISO (1=lundi..7=dimanche) depuis un objet Date UTC-naïf. */
function isoWeekday(d: Date): number {
  const js = d.getDay(); // 0=dimanche..6=samedi
  return js === 0 ? 7 : js;
}

/** Génère les créneaux concrets des `weeksAhead` prochaines semaines depuis slot_template
 *  (idempotent : ON CONFLICT DO NOTHING sur date+horaires+partenaire). */
export async function generateSlotsFromTemplate(weeksAhead = 4): Promise<number> {
  const settings = await getSettings();
  if (!settings.slotTemplate.length || !settings.defaultPartnerId) return 0;
  const pool = getPool();
  let created = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let day = 0; day < weeksAhead * 7; day++) {
    const d = new Date(today.getTime() + day * 86400000);
    const wd = isoWeekday(d);
    const entries = settings.slotTemplate.filter((t) => t.weekday === wd);
    if (!entries.length) continue;
    const iso = d.toISOString().slice(0, 10);
    for (const e of entries) {
      const { rowCount } = await pool.query(
        `insert into formation_slots (date, start_time, end_time, type, partner_id, capacity)
         values ($1,$2,$3,$4,$5,$6) on conflict (date, start_time, end_time, partner_id) do nothing`,
        [iso, e.start, e.end, e.type, settings.defaultPartnerId, e.capacity],
      );
      created += rowCount ?? 0;
    }
  }
  return created;
}

type RegistrationRow = {
  id: number; slot_id: number; first_name: string; last_name: string; email: string;
  type: "individuel" | "groupe"; partner_id: number; status: "inscrit" | "annule";
  email_sent: boolean; email_sent_at: string | null; created_at: string; calendar_event_id: string | null;
};
const mapRegistration = (r: RegistrationRow): Registration => ({
  id: Number(r.id), slotId: Number(r.slot_id), firstName: r.first_name, lastName: r.last_name, email: r.email,
  type: r.type, partnerId: Number(r.partner_id), status: r.status, emailSent: r.email_sent, emailSentAt: r.email_sent_at,
  createdAt: r.created_at, calendarEventId: r.calendar_event_id,
});

export async function listRegistrations(slotId: number): Promise<Registration[]> {
  const { rows } = await getPool().query<RegistrationRow>(
    `select id, slot_id, first_name, last_name, email, type, partner_id, status, email_sent, email_sent_at, created_at, calendar_event_id
       from formation_registrations where slot_id = $1 order by created_at`,
    [slotId],
  );
  return rows.map(mapRegistration);
}

export async function getRegistration(id: number): Promise<Registration | undefined> {
  const { rows } = await getPool().query<RegistrationRow>(
    `select id, slot_id, first_name, last_name, email, type, partner_id, status, email_sent, email_sent_at, created_at, calendar_event_id
       from formation_registrations where id = $1`,
    [id],
  );
  return rows[0] ? mapRegistration(rows[0]) : undefined;
}

export async function setCalendarEventId(id: number, eventId: string | null) {
  await getPool().query(`update formation_registrations set calendar_event_id = $2 where id = $1`, [id, eventId]);
}

/** Déplace une inscription vers un autre créneau (reprogrammation) : type/partenaire
 *  redénormalisés depuis le nouveau créneau, refuse si complet/fermé. Le calendarEventId
 *  n'est PAS touché ici — l'appelant gère la suppression/recréation de l'event Google. */
export async function moveRegistration(id: number, newSlotId: number): Promise<{ ok: true; registration: Registration; oldSlotId: number; slot: Slot } | { ok: false; reason: string }> {
  const current = await getRegistration(id);
  if (!current || current.status !== "inscrit") return { ok: false, reason: "Inscription introuvable." };
  const slot = await getSlot(newSlotId);
  if (!slot) return { ok: false, reason: "Créneau introuvable." };
  if (!slot.active) return { ok: false, reason: "Ce créneau est fermé." };
  if (slot.registered >= slot.capacity) return { ok: false, reason: "Ce créneau est complet." };

  await getPool().query(
    `update formation_registrations set slot_id = $2, type = $3, partner_id = $4, email_sent = false, email_sent_at = null where id = $1`,
    [id, newSlotId, slot.type, slot.partnerId],
  );
  const updated = await getRegistration(id);
  return { ok: true, registration: updated!, oldSlotId: current.slotId, slot };
}

/** Inscrit quelqu'un sur un créneau : type/partenaire dénormalisés depuis le créneau,
 *  refuse si complet. `emailSent` reste false ici — l'envoi réel est décidé par l'appelant
 *  (selon auto_send_enabled), jamais implicite dans cette fonction. */
export async function createRegistration(input: { slotId: number; firstName: string; lastName: string; email: string; createdBy: string }): Promise<{ ok: true; registration: Registration; slot: Slot } | { ok: false; reason: string }> {
  const slot = await getSlot(input.slotId);
  if (!slot) return { ok: false, reason: "Créneau introuvable." };
  if (!slot.active) return { ok: false, reason: "Ce créneau est fermé." };
  if (slot.registered >= slot.capacity) return { ok: false, reason: "Ce créneau est complet." };

  const { rows } = await getPool().query<{ id: number; created_at: string }>(
    `insert into formation_registrations (slot_id, first_name, last_name, email, type, partner_id, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning id, created_at`,
    [input.slotId, input.firstName, input.lastName, input.email, slot.type, slot.partnerId, input.createdBy],
  );
  const registration: Registration = {
    id: Number(rows[0].id), slotId: input.slotId, firstName: input.firstName, lastName: input.lastName, email: input.email,
    type: slot.type, partnerId: slot.partnerId, status: "inscrit", emailSent: false, emailSentAt: null, createdAt: rows[0].created_at, calendarEventId: null,
  };
  return { ok: true, registration, slot };
}

export async function markRegistrationEmailSent(id: number) {
  await getPool().query(`update formation_registrations set email_sent = true, email_sent_at = now() where id = $1`, [id]);
}

/** Annule l'inscription et renvoie l'ancien calendarEventId (si présent), pour que
 *  l'appelant supprime l'event Google correspondant. */
export async function cancelRegistration(id: number): Promise<string | null> {
  const current = await getRegistration(id);
  await getPool().query(`update formation_registrations set status = 'annule', calendar_event_id = null where id = $1`, [id]);
  return current?.calendarEventId ?? null;
}
