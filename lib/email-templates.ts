const BUSINESS = process.env.BUSINESS_NAME ?? "Simplicicar";
const LOCATION = process.env.DEFAULT_LOCATION ?? "3 rue Bélidor 75017 Paris";

const C = {
  primary: "#DB407A",
  navy: "#1a273a",
  text: "#232323",
  muted: "#6b7280",
  bg: "#eceef1",
  highlight: "#fff3a0",
};
const FONT_BODY = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const FONT_HEAD = "'Cabin','Manrope',Arial,sans-serif";
const LOGO =
  process.env.LOGO_URL ??
  "https://www.simplicicar.com/img/cms/Logo/Simplicicar-concession-automobile-France.jpg";

// Réseaux sociaux (footer)
const SOCIAL = {
  facebook: "https://www.facebook.com/SimpliciCarBike/",
  instagram: "https://www.instagram.com/simplicicar_france/",
  youtube: "https://www.youtube.com/@Declencheur_podcast",
  whatsapp: process.env.WHATSAPP_NUMBER ? `https://wa.me/${process.env.WHATSAPP_NUMBER}` : "",
};

function fmtLong(dt: string | Date) {
  const d = typeof dt === "string" ? new Date(dt) : dt;
  const date = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  const heure = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(":", "h");
  return { date, heure };
}

function socialIcon(href: string, name: string, file: string) {
  if (!href) return "";
  return `<td style="padding:0 8px"><a href="${href}" target="_blank" style="text-decoration:none">
    <img src="https://img.icons8.com/ios-filled/50/ffffff/${file}.png" width="26" height="26" alt="${name}" style="display:block;border:0"/></a></td>`;
}

/** Bouton plein, centré. */
function button(href: string | undefined, label: string, bg = C.primary) {
  if (!href) return "";
  return `<table role="presentation" align="center" style="margin:8px auto 0"><tr><td style="border-radius:8px;background:${bg}">
    <a href="${href}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT_BODY};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${label}</a>
  </td></tr></table>`;
}

function shell(content: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Cabin:wght@600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;background:${C.bg};font-family:${FONT_BODY};color:${C.text}">
  <div style="max-width:600px;margin:0 auto;padding:24px 14px">
    <div style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 20px rgba(26,39,58,0.10)">
      <!-- Header -->
      <div style="background:${C.navy};text-align:center;padding:24px 20px 18px">
        <img src="${LOGO}" alt="${BUSINESS}" width="300" style="width:300px;max-width:78%;height:auto;display:inline-block;border:0"/>
        <div style="margin-top:10px;font-family:${FONT_BODY};font-size:12px;font-style:italic;color:#aeb8c7">Recommandé par Vincent Lagaf'</div>
      </div>
      <!-- Corps centré -->
      <div style="padding:34px 30px;text-align:center">
        ${content}
      </div>
      <!-- Footer rose -->
      <div style="background:${C.primary};padding:22px 20px;text-align:center">
        <div style="font-family:${FONT_BODY};font-size:14px;color:#ffffff;margin-bottom:12px">${LOCATION}</div>
        <table role="presentation" align="center"><tr>
          ${socialIcon(SOCIAL.facebook, "Facebook", "facebook-new")}
          ${socialIcon(SOCIAL.instagram, "Instagram", "instagram-new")}
          ${socialIcon(SOCIAL.youtube, "YouTube", "youtube-play")}
          ${socialIcon(SOCIAL.whatsapp, "WhatsApp", "whatsapp")}
        </tr></table>
      </div>
    </div>
  </div>
</body></html>`;
}

const hl = (t: string) => `<span style="background:${C.highlight};font-weight:700">${t}</span>`;

type ConfirmData = {
  firstName: string;
  startDateTime: string;
  location: string;
  platform?: string;
  listingUrl?: string;
  whatsappUrl?: string;
  rescheduleUrl?: string;
};

export function confirmationEmail(d: ConfirmData) {
  const { date, heure } = fmtLong(d.startDateTime);
  const content = `
    <h1 style="margin:0 0 22px;font-family:${FONT_HEAD};font-size:30px;font-weight:700;color:${C.navy}">Bonjour, ${d.firstName}</h1>
    <p style="margin:0 0 20px;font-size:16px;font-weight:700;color:${C.navy};line-height:1.5">Suite à notre entretien téléphonique, je vous envoie les coordonnées de notre agence :</p>
    <p style="margin:0 0 20px;font-size:16px;color:${C.text}">${hl(BUSINESS.toUpperCase())} ${d.location}</p>
    <p style="margin:0 0 20px;font-size:16px;font-weight:700;color:${C.primary}">Votre rendez-vous est prévu le ${date} à ${heure}.</p>
    <p style="margin:0 0 22px;font-size:15px;color:${C.text}">N'oubliez pas de vous munir de votre <strong>carte grise</strong> et de votre <strong>pièce d'identité</strong>.</p>
    ${button(d.rescheduleUrl, "Reprogrammer le rendez-vous")}
    <p style="margin:24px 0 0;font-size:15px;color:${C.text}">L'équipe ${hl(BUSINESS)}</p>`;
  return { subject: `Votre rendez-vous — ${BUSINESS}`, html: shell(content) };
}

type ReminderData = {
  firstName: string;
  startDateTime: string;
  location: string;
  kind: "24h" | "2h";
  whatsappUrl?: string;
  rescheduleUrl?: string;
};

export function reminderEmail(d: ReminderData) {
  const { date, heure } = fmtLong(d.startDateTime);
  const quand = d.kind === "2h" ? "dans 2 heures" : "demain";
  const content = `
    <h1 style="margin:0 0 22px;font-family:${FONT_HEAD};font-size:28px;font-weight:700;color:${C.navy}">Bonjour, ${d.firstName}</h1>
    <p style="margin:0 0 20px;font-size:16px;font-weight:700;color:${C.navy};line-height:1.5">Petit rappel : votre rendez-vous est ${quand}.</p>
    <p style="margin:0 0 20px;font-size:16px;color:${C.text}">${hl(BUSINESS.toUpperCase())} ${d.location}</p>
    <p style="margin:0 0 20px;font-size:16px;font-weight:700;color:${C.primary}">Le ${date} à ${heure}.</p>
    <p style="margin:0 0 22px;font-size:15px;color:${C.text}">N'oubliez pas votre <strong>carte grise</strong> et votre <strong>pièce d'identité</strong>.</p>
    ${button(d.rescheduleUrl, "Reprogrammer le rendez-vous")}
    <p style="margin:24px 0 0;font-size:15px;color:${C.text}">L'équipe ${hl(BUSINESS)}</p>`;
  return { subject: `Rappel : votre rendez-vous ${quand} — ${BUSINESS}`, html: shell(content) };
}

export function rescheduledEmail(d: ConfirmData) {
  const { date, heure } = fmtLong(d.startDateTime);
  const content = `
    <h1 style="margin:0 0 22px;font-family:${FONT_HEAD};font-size:28px;font-weight:700;color:${C.navy}">Bonjour, ${d.firstName}</h1>
    <p style="margin:0 0 20px;font-size:16px;font-weight:700;color:${C.navy};line-height:1.5">Votre rendez-vous a bien été reprogrammé.</p>
    <p style="margin:0 0 20px;font-size:16px;color:${C.text}">${hl(BUSINESS.toUpperCase())} ${d.location}</p>
    <p style="margin:0 0 20px;font-size:16px;font-weight:700;color:${C.primary}">Nouvelle date : le ${date} à ${heure}.</p>
    <p style="margin:0 0 22px;font-size:15px;color:${C.text}">N'oubliez pas votre <strong>carte grise</strong> et votre <strong>pièce d'identité</strong>.</p>
    ${button(d.rescheduleUrl, "Reprogrammer à nouveau")}
    <p style="margin:24px 0 0;font-size:15px;color:${C.text}">L'équipe ${hl(BUSINESS)}</p>`;
  return { subject: `Rendez-vous reprogrammé — ${BUSINESS}`, html: shell(content) };
}

type CancelData = { firstName: string; startDateTime: string; location: string; whatsappUrl?: string };

export function cancelledEmail(d: CancelData) {
  const { date, heure } = fmtLong(d.startDateTime);
  const content = `
    <h1 style="margin:0 0 22px;font-family:${FONT_HEAD};font-size:28px;font-weight:700;color:${C.navy}">Bonjour, ${d.firstName}</h1>
    <p style="margin:0 0 20px;font-size:16px;font-weight:700;color:${C.navy};line-height:1.5">Votre rendez-vous du ${date} à ${heure} a été annulé.</p>
    <p style="margin:0 0 22px;font-size:15px;color:${C.text}">Pour reprendre rendez-vous, contactez-nous sur WhatsApp.</p>
    ${button(d.whatsappUrl, "Nous contacter sur WhatsApp", "#25D366")}
    <p style="margin:24px 0 0;font-size:15px;color:${C.text}">L'équipe ${hl(BUSINESS)}</p>`;
  return { subject: `Rendez-vous annulé — ${BUSINESS}`, html: shell(content) };
}
