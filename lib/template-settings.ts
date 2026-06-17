import { getPool } from "./db";

export type TemplateSetting = { template_key: string; channel: string; enabled: boolean };

// Cache court (par instance) du set des templates DÉSACTIVÉS ("key|channel").
let cache: { set: Set<string>; at: number } | null = null;
const TTL = 20_000;

async function disabledSet(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL) return cache.set;
  const set = new Set<string>();
  try {
    const { rows } = await getPool().query<TemplateSetting>(
      `select template_key, channel from template_settings where enabled = false`,
    );
    for (const r of rows) set.add(`${r.template_key}|${r.channel}`);
  } catch { /* table absente -> rien de désactivé */ }
  cache = { set, at: Date.now() };
  return set;
}

/** True si ce template (clé+canal) est désactivé -> ne doit pas partir. */
export async function isTemplateDisabled(templateKey: string, channel: "email" | "sms"): Promise<boolean> {
  if (!templateKey) return false;
  const set = await disabledSet();
  return set.has(`${templateKey}|${channel}`);
}

/** Liste des réglages explicites (les absents = activés). */
export async function listTemplateSettings(): Promise<TemplateSetting[]> {
  const { rows } = await getPool().query<TemplateSetting>(`select template_key, channel, enabled from template_settings`);
  return rows;
}

/** Active/désactive un template. */
export async function setTemplateEnabled(templateKey: string, channel: "email" | "sms", enabled: boolean): Promise<void> {
  await getPool().query(
    `insert into template_settings (template_key, channel, enabled, updated_at)
     values ($1, $2, $3, now())
     on conflict (template_key, channel) do update set enabled = excluded.enabled, updated_at = now()`,
    [templateKey, channel, enabled],
  );
  cache = null; // invalide le cache local
}
