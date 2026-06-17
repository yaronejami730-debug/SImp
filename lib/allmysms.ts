type SmsLogCtx = {
  templateKey?: string;
  clientName?: string;
  owner?: string;
  eventId?: string;
  toEmail?: string;
  origin?: "auto" | "manual";
};

type SendSmsOpts = {
  to: string;
  text: string;
  from?: string;
  log?: SmsLogCtx; // si fourni -> journalise le SMS (preuve timeline)
};

/** Normalise un numéro FR vers le format E.164 sans `+` (ex: 33612345678). */
export function normalizePhoneFR(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("33") && d.length === 11) return d;
  if (d.startsWith("0") && d.length === 10) return "33" + d.slice(1);
  if (d.length === 9) return "33" + d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

/** Envoie un SMS via l'API AllMySMS. Non-bloquant côté appelant. */
export async function sendSMS(opts: SendSmsOpts) {
  const login = process.env.ALLMYSMS_LOGIN;
  const apiKey = process.env.ALLMYSMS_API_KEY;
  const from = (opts.from ?? process.env.ALLMYSMS_SENDER ?? "Simplicicar").trim();

  if (!login || !apiKey) throw new Error("ALLMYSMS_LOGIN / ALLMYSMS_API_KEY manquants.");

  // Template SMS désactivé depuis le dashboard -> on n'envoie pas.
  if (opts.log?.templateKey) {
    const { isTemplateDisabled } = await import("./template-settings");
    if (await isTemplateDisabled(opts.log.templateKey, "sms")) return { skipped: true };
  }

  const to = normalizePhoneFR(opts.to);
  if (!to) throw new Error(`Numéro invalide: ${opts.to}`);

  const auth = Buffer.from(`${login}:${apiKey}`).toString("base64");

  // Import dynamique pour éviter une dépendance circulaire (messages -> allmysms).
  const { logMessage } = await import("./messages");

  try {
    const res = await fetch("https://api.allmysms.com/sms/send/", {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        text: opts.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AllMySMS ${res.status}: ${body}`);
    }
    const json = await res.json();

    if (opts.log) {
      await logMessage({
        channel: "sms",
        toPhone: opts.to,
        toEmail: opts.log.toEmail,
        clientName: opts.log.clientName,
        owner: opts.log.owner,
        eventId: opts.log.eventId,
        templateKey: opts.log.templateKey,
        origin: opts.log.origin,
        bodyText: opts.text,
        provider: "allmysms",
        // Réponse v9 : { status, campaignId, smsIds:[{phoneNumber, smsId}], ... }
        providerMessageId: String(json?.campaignId ?? json?.smsIds?.[0]?.smsId ?? json?.smsId ?? json?.id ?? ""),
        status: "sent",
      });
    }
    return json;
  } catch (e) {
    if (opts.log) {
      await logMessage({
        channel: "sms",
        toPhone: opts.to,
        toEmail: opts.log.toEmail,
        clientName: opts.log.clientName,
        owner: opts.log.owner,
        eventId: opts.log.eventId,
        templateKey: opts.log.templateKey,
        origin: opts.log.origin,
        bodyText: opts.text,
        provider: "allmysms",
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
    throw e;
  }
}
