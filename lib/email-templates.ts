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
  if (d.lastName) return `${d.civility ?? "Monsieur"} ${d.lastName}`;
  return `${d.civility ?? "Monsieur"} ${d.firstName}`;
}

function socialIcon(href: string, name: string, file: string) {
  if (!href) return "";
  return `<td style="padding:0 7px"><a href="${href}" target="_blank" style="text-decoration:none"><img src="https://img.icons8.com/ios-filled/50/1a273a/${file}.png" width="24" height="24" alt="${name}" style="display:block;border:0"/></a></td>`;
}

function btn(href: string | undefined, label: string, bg: string) {
  if (!href) return "";
  return `<tr><td style="padding:6px 0"><a href="${href}" target="_blank" style="display:block;background:${bg};color:#ffffff;text-decoration:none;font-family:${FONT_BODY};font-size:15px;font-weight:600;text-align:center;padding:14px 20px;border-radius:8px">${label}</a></td></tr>`;
}

function btnOutline(href: string | undefined, label: string, color: string) {
  if (!href) return "";
  return `<tr><td style="padding:6px 0"><a href="${href}" target="_blank" style="display:block;background:#ffffff;color:${color};text-decoration:none;font-family:${FONT_BODY};font-size:13px;font-weight:600;text-align:center;padding:12px 20px;border-radius:8px;border:1.5px solid ${color}">${label}</a></td></tr>`;
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

const addressLine = `<a href="${MAPS}" target="_blank" style="color:#111111;text-decoration:none;font-weight:700">${LOCATION}</a>`;

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

/** Pré-RDV : annonce ludique que la place de parking est déjà bloquée pour le client.
 *  Avantage Simplicicar : pas besoin de tourner dans Paris pour se garer. */
export function parkingReservationEmail(d: {
  civility?: string; firstName: string; lastName?: string;
  startDateTime?: string;
}) {
  const when = d.startDateTime ? fmtLong(d.startDateTime) : null;
  const rdvLine = when
    ? `<p style="margin:0 0 16px;font-size:15px">Dans le cadre de votre rendez-vous prévu le <strong>${when.date} à ${when.heure}</strong>, comme convenu, nous tenions à vous informer d'un petit confort réservé pour vous.</p>`
    : `<p style="margin:0 0 16px;font-size:15px">Dans le cadre de votre rendez-vous à venir, comme convenu, nous tenions à vous informer d'un petit confort réservé pour vous.</p>`;
  const content = `
    <p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${greet(d)},</p>
    ${rdvLine}
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${C.primary}">🅿️ Une place de parking est réservée à votre nom.</p>
    <p style="margin:0 0 16px;font-size:15px">Dans le cas où vous décidez de nous confier votre véhicule, vous pourrez en bénéficier dans notre <strong>parking sécurisé privé</strong>, en conciergerie.</p>
    <p style="margin:0 0 16px;font-size:15px">Adresse : ${addressLine}</p>
    <p style="margin:0 0 4px;font-size:15px">À très bientôt 👋</p>
    <p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()}</p>`;
  const buttons = btn(WAZE, "🧭 Itinéraire vers l'agence", C.navy);
  return { subject: `Votre place de parking est réservée — ${BUSINESS}`, html: shell(content, buttons) };
}

/** Mail envoyé au client pour qu'il choisisse lui-même son créneau. */
export function bookingInviteEmail(d: { bookUrl: string }) {
  const content = `
    <p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour,</p>
    <p style="margin:0 0 16px;font-size:15px">Suite à notre conversation, choisissez le créneau qui vous convient pour votre rendez-vous avec ${BUSINESS.toUpperCase()} :</p>
    <p style="margin:0 0 16px;font-size:15px">${addressLine}</p>
    <p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()}</p>`;
  const buttons = btn(d.bookUrl, "Choisir mon créneau", C.primary);
  return { subject: `Prenez votre rendez-vous — ${BUSINESS}`, html: shell(content, buttons) };
}

/** Relance après annulation. stage 1 = J+7, stage 2 = J+14, stage 3 = J+44 (final). */
export function cancellationFollowupEmail(d: {
  stage: 1 | 2 | 3;
  civility?: string; firstName: string; lastName?: string;
  bookUrl: string;
  unsubUrl?: string;
}) {
  const hello = `<p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${greet(d)},</p>`;
  let body = "";
  let subject = "";
  if (d.stage === 1) {
    subject = `Reprenez rendez-vous — ${BUSINESS}`;
    body = `
      <p style="margin:0 0 16px;font-size:15px">Suite à l'annulation de votre rendez-vous, vous pouvez en reprendre un nouveau en quelques clics.</p>
      <p style="margin:0 0 8px;font-size:15px">Choisissez la date et l'heure qui vous arrangent :</p>`;
  } else if (d.stage === 2) {
    subject = `Toujours intéressé ? Reprenez rendez-vous — ${BUSINESS}`;
    body = `
      <p style="margin:0 0 16px;font-size:15px">Toujours intéressé par la vente de votre véhicule ?</p>
      <p style="margin:0 0 8px;font-size:15px">Programmez votre rendez-vous quand vous le voulez :</p>`;
  } else {
    subject = `Vous n'avez pas encore vendu votre véhicule ? — ${BUSINESS}`;
    body = `
      <p style="margin:0 0 16px;font-size:15px">Vous n'avez peut-être pas encore vendu votre véhicule.</p>
      <p style="margin:0 0 16px;font-size:15px">Notre agence vous accompagne pour finaliser la vente rapidement, sereinement, sans frais cachés.</p>
      <p style="margin:0 0 8px;font-size:15px">Reprenez rendez-vous quand vous voulez :</p>`;
  }
  const content = hello + body + `<p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()}</p>`;
  const buttons = btn(d.bookUrl, "Programmer un rendez-vous", C.primary) + btnOutline(d.unsubUrl, "Mon véhicule est vendu", C.muted);
  return { subject, html: shell(content, buttons) };
}

// ─── Relances post-RDV en fonction du statut signature ───

/** Relance pour les "réfléchit". stage 1 = J+3, stage 2 = J+13. */
export function thinkingFollowupEmail(d: {
  stage: 1 | 2;
  civility?: string; firstName: string; lastName?: string;
  bookUrl: string;
  unsubUrl?: string;
}) {
  const hello = `<p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${greet(d)},</p>`;
  let body = "";
  let subject = "";
  if (d.stage === 1) {
    subject = `Toujours en réflexion ? — ${BUSINESS}`;
    body = `
      <p style="margin:0 0 16px;font-size:15px">Suite à votre passage, nous restons disponibles pour répondre à toutes vos questions sur la vente de votre véhicule.</p>
      <p style="margin:0 0 16px;font-size:15px">Si vous souhaitez aller plus loin, reprenez rendez-vous quand vous voulez :</p>`;
  } else {
    subject = `Nous restons à votre disposition — ${BUSINESS}`;
    body = `
      <p style="margin:0 0 16px;font-size:15px">Avez-vous pris une décision concernant la vente de votre véhicule ?</p>
      <p style="margin:0 0 16px;font-size:15px">Notre équipe peut affiner l'estimation, vous proposer une reprise immédiate ou simplement répondre à vos dernières questions.</p>
      <p style="margin:0 0 8px;font-size:15px">Reprenons rendez-vous quand vous le souhaitez :</p>`;
  }
  const content = hello + body + `<p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()}</p>`;
  const buttons = btn(d.bookUrl, "Reprendre rendez-vous", C.primary) + btnOutline(d.unsubUrl, "Mon véhicule est vendu", C.muted);
  return { subject, html: shell(content, buttons) };
}

/** Relance pour les "pas signés". stage 1 = J+14, stage 2 = J+44, stage 3 = J+119. */
export function unsignedFollowupEmail(d: {
  stage: 1 | 2 | 3;
  civility?: string; firstName: string; lastName?: string;
  bookUrl: string;
  unsubUrl?: string;
}) {
  const hello = `<p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${greet(d)},</p>`;
  let body = "";
  let subject = "";
  if (d.stage === 1) {
    subject = `Votre véhicule est-il toujours à vendre ? — ${BUSINESS}`;
    body = `
      <p style="margin:0 0 16px;font-size:15px">Vous nous avez rencontrés il y a deux semaines et la vente n'est pas encore finalisée.</p>
      <p style="margin:0 0 16px;font-size:15px">Si le projet est toujours d'actualité, nous pouvons reprendre là où nous nous sommes arrêtés — sans frais, sans engagement.</p>
      <p style="margin:0 0 8px;font-size:15px">Reprenons contact :</p>`;
  } else if (d.stage === 2) {
    subject = `Le marché évolue — refaisons un point — ${BUSINESS}`;
    body = `
      <p style="margin:0 0 16px;font-size:15px">Cela fait quelques semaines depuis notre dernier échange.</p>
      <p style="margin:0 0 16px;font-size:15px">Le marché de l'occasion évolue chaque mois : nous pouvons refaire un point sur la cote actuelle de votre véhicule.</p>
      <p style="margin:0 0 8px;font-size:15px">Programmez un nouveau rendez-vous :</p>`;
  } else {
    subject = `Toujours là pour vous accompagner — ${BUSINESS}`;
    body = `
      <p style="margin:0 0 16px;font-size:15px">Quelques mois après notre rencontre, nous restons disponibles si vous souhaitez relancer la vente de votre véhicule.</p>
      <p style="margin:0 0 16px;font-size:15px">Nous serons heureux de vous accompagner pour finaliser la transaction sereinement.</p>
      <p style="margin:0 0 8px;font-size:15px">Prenez rendez-vous quand vous voulez :</p>`;
  }
  const content = hello + body + `<p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()}</p>`;
  const buttons = btn(d.bookUrl, "Reprendre rendez-vous", C.primary) + btnOutline(d.unsubUrl, "Mon véhicule est vendu", C.muted);
  return { subject, html: shell(content, buttons) };
}

/** Mail envoyé juste après la signature : lien vers le questionnaire /avis. */
export function signedRatingEmail(d: {
  civility?: string; firstName: string; lastName?: string;
  avisUrl?: string;
}) {
  const avisHref = d.avisUrl || `${(process.env.APP_URL ?? "https://simplicicar.store").replace(/\/$/, "")}/avis`;
  const content = `
    <p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${greet(d)},</p>
    <p style="margin:0 0 16px;font-size:15px">Merci pour votre confiance — votre vente est finalisée.</p>
    <p style="margin:0 0 16px;font-size:15px">Pouvez-vous prendre 30 secondes pour <strong>noter votre expérience</strong> ?</p>
    <p style="margin:0 0 4px;font-size:14px;color:${C.muted}">Votre retour nous aide à toujours mieux vous servir.</p>
    <p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()}</p>`;
  const buttons = btn(avisHref, "⭐ Noter l'établissement", C.primary);
  return { subject: `Notez votre rendez-vous — ${BUSINESS}`, html: shell(content, buttons) };
}

/** Mail de recommandation envoyé au proche (parrainage). */
export function referralEmail(d: { friendName?: string; referrerName?: string; sellUrl: string; buyUrl: string }) {
  const hello = d.friendName
    ? `<p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${d.friendName},</p>`
    : `<p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour,</p>`;
  const referrerLine = d.referrerName
    ? `<strong>${d.referrerName}</strong> a pensé à vous en découvrant <strong>${BUSINESS}</strong>.`
    : `Un de vos proches a pensé à vous en découvrant <strong>${BUSINESS}</strong>.`;
  const content = `
    ${hello}
    <p style="margin:0 0 16px;font-size:15px">${referrerLine}</p>
    <p style="margin:0 0 16px;font-size:15px">Nous sommes spécialisés dans la vente de véhicules d'occasion : <strong>aucun frais</strong>, un <strong>prix net garanti</strong> dès le départ, et une équipe qui s'occupe de tout.</p>
    <p style="margin:0 0 16px;font-size:15px">Que vous souhaitiez <strong>vendre</strong> votre véhicule ou <strong>acheter</strong> un véhicule, nous serions ravis d'en discuter avec vous.</p>
    <p style="margin:0 0 16px;font-size:15px">Faites-vous recontacter rapidement par l'un de nos conseillers :</p>
    <p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()} — Paris 17</p>`;
  const buttons = btn(d.sellUrl, "🚗 Je vends mon véhicule", C.primary) + btn(d.buyUrl, "🛒 Je veux acheter un véhicule", C.navy);
  return { subject: `Un proche vous recommande ${BUSINESS}`, html: shell(content, buttons) };
}

// ─── Rappel téléphonique (RDV téléphonique programmé via Prospection) ───

type PhoneRappelOrganizerData = {
  organizerName?: string;
  firstName: string;
  lastName?: string;
  phone: string;
  remindAt: string;
  listingUrl?: string;
  note?: string;
};

/** Mail envoyé à l'organisateur (le collaborateur) 30 min avant le RDV téléphonique. */
export function phoneRappelOrganizerEmail(d: PhoneRappelOrganizerData) {
  const { date, heure } = fmtLong(d.remindAt);
  const fullName = `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim() || d.phone;
  const telDigits = d.phone.replace(/\s/g, "");
  const content = `
    <p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${d.organizerName ?? ""},</p>
    <p style="margin:0 0 16px;font-size:15px">Vous avez un <strong>rendez-vous téléphonique</strong> dans 30 minutes.</p>
    <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:${C.primary}">${fullName} — ${d.phone}</p>
    <p style="margin:0 0 14px;font-size:15px;color:${C.muted}">Le ${date} à ${heure}.</p>
    ${d.listingUrl ? `<p style="margin:0 0 10px;font-size:14px"><a href="${d.listingUrl}" target="_blank" style="color:${C.link};text-decoration:none">Ouvrir l'annonce →</a></p>` : ""}
    ${d.note ? `<p style="margin:0 0 14px;font-size:14px;color:${C.muted}">Note : ${d.note}</p>` : ""}
    <p style="margin:22px 0 0;font-size:15px;color:${C.muted}">— ${BUSINESS.toUpperCase()}</p>`;
  const buttons = btn(`tel:${telDigits}`, `📞 Appeler ${fullName}`, C.primary);
  return { subject: `📞 Rappel dans 30 min — ${fullName}`, html: shell(content, buttons) };
}

type PhoneRappelClientData = {
  firstName: string;
  lastName?: string;
  remindAt: string;
};

/** Mail envoyé au client (si email fourni) 30 min avant l'appel. */
export function phoneRappelClientEmail(d: PhoneRappelClientData) {
  const { date, heure } = fmtLong(d.remindAt);
  const content = `
    <p style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:20px;font-weight:700;color:${C.navy}">Bonjour ${d.firstName},</p>
    <p style="margin:0 0 16px;font-size:15px">Petit rappel : nous vous rappelons dans 30 minutes pour faire le point sur votre annonce.</p>
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:${C.primary}">Appel prévu le ${date} à ${heure}.</p>
    <p style="margin:0 0 4px;font-size:15px">Si vous n'êtes pas disponible, prévenez-nous et nous reprogrammerons.</p>
    <p style="margin:22px 0 0;font-size:15px;color:${C.muted}">L'équipe ${BUSINESS.toUpperCase()}</p>`;
  return { subject: `Rappel de notre appel à venir — ${BUSINESS}`, html: shell(content) };
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
