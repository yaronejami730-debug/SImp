const WHATSAPP = process.env.WHATSAPP_NUMBER; // format international sans +, ex 33783269157
const BUSINESS = process.env.BUSINESS_NAME ?? "Simplicicar";

/** Lien wa.me vers le WhatsApp de l'entreprise, message pré-rempli. */
export function whatsappUrl(): string | undefined {
  if (!WHATSAPP) return undefined;
  const text = encodeURIComponent(
    `Bonjour, je vous contacte au sujet de mon rendez-vous ${BUSINESS}.`,
  );
  return `https://wa.me/${WHATSAPP}?text=${text}`;
}

/** URL de base de l'app (depuis la requête, sinon variable APP_URL). */
export function baseUrlFrom(req?: Request): string {
  if (req) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    if (host) return `${proto}://${host}`;
  }
  return (process.env.APP_URL ?? "").replace(/\/$/, "");
}

/** Lien vers la page de reprogrammation pour un événement donné. */
export function rescheduleUrl(base: string, eventId: string): string | undefined {
  if (!base || !eventId) return undefined;
  return `${base}/reschedule?eid=${encodeURIComponent(eventId)}`;
}
