type SendSmsOpts = {
  to: string;
  text: string;
  from?: string;
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

  const to = normalizePhoneFR(opts.to);
  if (!to) throw new Error(`Numéro invalide: ${opts.to}`);

  const auth = Buffer.from(`${login}:${apiKey}`).toString("base64");

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
  return res.json();
}
