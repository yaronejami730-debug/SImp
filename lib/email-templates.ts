const BUSINESS = process.env.BUSINESS_NAME ?? "Simplicicar";
const LOCATION = process.env.DEFAULT_LOCATION ?? "3 rue Bélidor 75017 Paris";

const C = { primary: "#DB407A", navy: "#1a273a", text: "#2b2b2b", muted: "#6b7280", link: "#2563eb" };
const FONT_BODY = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const FONT_HEAD = "'Cabin','Manrope',Arial,sans-serif";
const LOGO =
  process.env.LOGO_URL ??
  `${(process.env.APP_URL ?? "https://agenda-rdv.vercel.app").replace(/\/$/, "")}/logo.png`;

const MAPS = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LOCATION)}`;
const WAZE = `https://waze.com/ul?q=${encodeURIComponent(LOCATION)}&navigate=yes`;

const SOCIAL = {
  facebook: process.env.SOCIAL_FACEBOOK ?? "https://www.facebook.com/SimpliciCarBike/",
  instagram: process.env.SOCIAL_INSTAGRAM ?? "https://www.instagram.com/simplicicar_france/",
  youtube: process.env.SOCIAL_YOUTUBE ?? "https://www.youtube.com/@Declencheur_podcast",
  whatsapp: process.env.WHATSAPP_NUMBER ? `https://wa.me/${process.env.WHATSAPP_NUMBER}` : "",
};

function fmtLong(dt: string | Date) {
  const d = typeof dt === "string" ? new Date(dt) : dt;
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");
  return { date, heure };
}

function greet(d: { civility?: string; firstName: string; lastName?: string }) {
  if (d.civility && d.lastName) return `${d.civility} ${d.lastName}`;
  return d.firstName;
}

function socialIcon(href: string, name: string, file: string) {
  if (!href) return "";
  return `<td style="padding:0 7px"><a href="${href}" target="_blank" style="text-decoration:none"><img src="https://img.icons8.com/ios-filled/50/1a273a/${file}.png" width="24" height="24" alt="${name}" style="display:block;border:0"/></a></td>`;
}

function btn(href: string | undefined, label: string, bg: string) {
  if (!href) return "";
  return `<tr><td style="padding:6px 0"><a href="${href}" target="_blank" style="display:block;background:${bg};color:#ffffff;text-decoration:none;font-family:${FONT_BODY};font-size:15px;font-weight:600;text-align:center;padding:14px 20px;border-radius:8px">${label}</a></td></tr>`;
}

function shell(content: string, buttons = "") {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Cabin:wght@600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;background:#ffffff;font-family:${FONT_BODY};color:${C.text};line-height:1.6">
  <div style="max-width:560px;margin:0 auto;padding:30px 24px;text-align:center">
    <div style="text-align:center;margin-bottom:30px">
      <img src="${LOGO}" alt="${BUSINESS}" width="230" style="width:230px;max-width:68%;height:auto;display:inline-block;border:0"/>
    </div>
    ${content}
    ${buttons ? `<table role="presentation" style="width:100%;max-width:340px;margin:26px auto 0;border-collapse:collapse">${buttons}</table>` : ""}
    <div style="border-top:1px solid #ececec;margin-top:32px;padding-top:20px;text-align:center">
      <table role="presentation" align="center"><tr>
        ${socialIcon(SOCIAL.facebook, "Facebook", "facebook-new")}
        ${socialIcon(SOCIAL.instagram, "Instagram", "instagram-new")}
        ${socialIcon(SOCIAL.youtube, "YouTube", "youtube-play")}
        ${socialIcon(SOCIAL.whatsapp, "WhatsApp", "whatsapp")}
      </tr></table>
    </div>
  </div>
</body></html>`;
}

const addressLine = `<a href="${MAPS}" target="_blank" style="color:#111111;text-decoration:none;font-weight:700">Agence : ${LOCATION}</a>`;

type ConfirmData = {
  civility?: string; firstName: string; lastName?: string;
  startDateTime: string; location: string;
  platform?: string; listingUrl?: string; whatsappUrl?: string; rescheduleUrl?: string;
};

export function confirmationEmail(d: ConfirmData) {
  const { date, heure } = fmtLong(d.startDateTime);
  const content = `
    <p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${greet(d)},</p>
    <p style="margin:0 0 16px;font-size:15px">Suite à notre conversation téléphonique, je vous envoie les coordonnées de notre agence :</p>
    <p style="margin:0 0 16px;font-size:15px">${addressLine}</p>
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${C.primary}">Votre rendez-vous est prévu le ${date} à ${heure}.</p>
    <p style="margin:0 0 4px;font-size:15px">N'oubliez pas de vous munir de votre <strong>carte grise</strong> et de votre <strong>pièce d'identité</strong>.</p>
    <p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()}</p>`;
  const buttons = btn(WAZE, "🧭 Itinéraire vers l'agence", C.navy) + btn(d.rescheduleUrl, "Reprogrammer le rendez-vous", C.primary);
  return { subject: `Votre rendez-vous — ${BUSINESS}`, html: shell(content, buttons) };
}

type ReminderData = { civility?: string; firstName: string; lastName?: string; startDateTime: string; location: string; kind: "24h" | "2h"; whatsappUrl?: string; rescheduleUrl?: string };

export function reminderEmail(d: ReminderData) {
  const { date, heure } = fmtLong(d.startDateTime);
  const quand = d.kind === "2h" ? "dans 2 heures" : "demain";
  const content = `
    <p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${greet(d)},</p>
    <p style="margin:0 0 16px;font-size:15px">Petit rappel : votre rendez-vous est ${quand}.</p>
    <p style="margin:0 0 16px;font-size:15px">${addressLine}</p>
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${C.primary}">Le ${date} à ${heure}.</p>
    <p style="margin:0 0 4px;font-size:15px">N'oubliez pas votre <strong>carte grise</strong> et votre <strong>pièce d'identité</strong>.</p>
    <p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()}</p>`;
  const buttons = btn(WAZE, "🧭 Itinéraire vers l'agence", C.navy) + btn(d.rescheduleUrl, "Reprogrammer le rendez-vous", C.primary);
  return { subject: `Rappel : votre rendez-vous ${quand} — ${BUSINESS}`, html: shell(content, buttons) };
}

export function rescheduledEmail(d: ConfirmData) {
  const { date, heure } = fmtLong(d.startDateTime);
  const content = `
    <p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${greet(d)},</p>
    <p style="margin:0 0 16px;font-size:15px">Votre rendez-vous a bien été reprogrammé.</p>
    <p style="margin:0 0 16px;font-size:15px">${addressLine}</p>
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${C.primary}">Nouvelle date : le ${date} à ${heure}.</p>
    <p style="margin:0 0 4px;font-size:15px">N'oubliez pas votre <strong>carte grise</strong> et votre <strong>pièce d'identité</strong>.</p>
    <p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()}</p>`;
  const buttons = btn(WAZE, "🧭 Itinéraire vers l'agence", C.navy) + btn(d.rescheduleUrl, "Reprogrammer à nouveau", C.primary);
  return { subject: `Rendez-vous reprogrammé — ${BUSINESS}`, html: shell(content, buttons) };
}

type CancelData = { civility?: string; firstName: string; lastName?: string; startDateTime: string; location: string; whatsappUrl?: string };

export function cancelledEmail(d: CancelData) {
  const { date, heure } = fmtLong(d.startDateTime);
  const content = `
    <p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${greet(d)},</p>
    <p style="margin:0 0 16px;font-size:15px">Votre rendez-vous du <strong>${date} à ${heure}</strong> a été annulé.</p>
    <p style="margin:0 0 4px;font-size:15px">Pour reprendre rendez-vous, contactez-nous.</p>
    <p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()}</p>`;
  return { subject: `Rendez-vous annulé — ${BUSINESS}`, html: shell(content) };
}
