const BUSINESS = process.env.BUSINESS_NAME ?? "Simplicicar";

// Tokens design system simplicicar.com
const C = {
  primary: "#DB407A",
  accent: "#24B9D7",
  navy: "#1a273a", // fond header/footer = fond du logo (fondu parfait)
  text: "#232323",
  muted: "#6b7280",
  bg: "#eceef1",
  surface: "#ffffff",
  border: "#e5e7eb",
  whatsapp: "#25D366",
};
const FONT_BODY = "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const FONT_HEAD = "'Cabin','Manrope',Arial,sans-serif";
const LOGO =
  process.env.LOGO_URL ??
  "https://www.simplicicar.com/img/cms/Logo/Simplicicar-concession-automobile-France.jpg";

function fmtDateTime(dt: string | Date) {
  const d = typeof dt === "string" ? new Date(dt) : dt;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function shell(title: string, body: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Cabin:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;background:${C.bg};font-family:${FONT_BODY};color:${C.text};line-height:1.6">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:${C.surface};border-radius:14px;overflow:hidden;box-shadow:0 10px 15px rgba(26,39,58,0.12)">
      <!-- Header bleu nuit (fond = fond du logo => fondu) -->
      <div style="background:${C.navy};text-align:center;padding:26px 24px">
        <img src="${LOGO}" alt="${BUSINESS}" width="300" style="width:300px;max-width:80%;height:auto;display:inline-block;border:0"/>
      </div>
      <div style="height:4px;background:${C.primary}"></div>
      <!-- Corps -->
      <div style="padding:30px 28px">
        <h1 style="margin:0 0 18px;font-family:${FONT_HEAD};font-size:22px;font-weight:700;color:${C.navy};text-transform:uppercase;letter-spacing:0.3px">${title}</h1>
        ${body}
        <p style="margin:26px 0 0;font-size:13px;color:${C.muted}">À très vite,<br/>L'équipe ${BUSINESS}</p>
      </div>
      <!-- Footer bleu nuit -->
      <div style="background:${C.navy};padding:20px 24px;text-align:center">
        <div style="font-family:${FONT_HEAD};font-size:15px;font-weight:700;color:#ffffff">SIMPLICI<span style="color:${C.primary}">CAR</span></div>
        <div style="font-size:11px;color:#9aa6b8;margin-top:4px">Réseau de concessions automobiles en France</div>
      </div>
    </div>
  </div>
</body></html>`;
}

function infoTable(rows: [string, string][]) {
  const trs = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:7px 0;color:${C.muted};font-size:14px">${k}</td><td style="padding:7px 0;text-align:right;font-size:14px">${v}</td></tr>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;border-top:1px solid ${C.border};margin-top:8px">${trs}</table>`;
}

/** Deux boutons empilés : WhatsApp + reprogrammer. */
function buttons(whatsappUrl?: string, rescheduleUrl?: string) {
  if (!whatsappUrl && !rescheduleUrl) return "";
  const btn = (href: string, bg: string, label: string) =>
    `<a href="${href}" style="display:block;background:${bg};color:#ffffff;text-decoration:none;
       font-family:${FONT_BODY};font-size:15px;font-weight:600;text-align:center;
       padding:14px 18px;border-radius:8px;margin-top:10px">${label}</a>`;
  return `<div style="margin:24px 0 4px">
    ${whatsappUrl ? btn(whatsappUrl, C.whatsapp, "💬 Nous contacter sur WhatsApp") : ""}
    ${rescheduleUrl ? btn(rescheduleUrl, C.primary, "📅 Reprogrammer le rendez-vous") : ""}
  </div>`;
}

type ConfirmData = {
  firstName: string;
  startDateTime: string;
  location: string;
  platform: string;
  listingUrl: string;
  whatsappUrl?: string;
  rescheduleUrl?: string;
};

export function confirmationEmail(d: ConfirmData) {
  const body = `
    <p style="margin:0 0 12px">Bonjour ${d.firstName},</p>
    <p style="margin:0 0 4px">Votre rendez-vous est confirmé :</p>
    ${infoTable([
      ["Date", `<strong>${fmtDateTime(d.startDateTime)}</strong>`],
      ["Lieu", d.location],
    ])}
    ${buttons(d.whatsappUrl, d.rescheduleUrl)}`;
  return {
    subject: `Confirmation de votre rendez-vous — ${BUSINESS}`,
    html: shell("Rendez-vous confirmé ✅", body),
  };
}

type ReminderData = {
  firstName: string;
  startDateTime: string;
  location: string;
  whatsappUrl?: string;
  rescheduleUrl?: string;
};

export function reminderEmail(d: ReminderData) {
  const body = `
    <p style="margin:0 0 12px">Bonjour ${d.firstName},</p>
    <p style="margin:0 0 4px">Petit rappel : vous avez rendez-vous <strong>demain</strong>.</p>
    ${infoTable([
      ["Date", `<strong>${fmtDateTime(d.startDateTime)}</strong>`],
      ["Lieu", d.location],
    ])}
    ${buttons(d.whatsappUrl, d.rescheduleUrl)}`;
  return {
    subject: `Rappel : votre rendez-vous demain — ${BUSINESS}`,
    html: shell("N'oubliez pas votre rendez-vous ⏰", body),
  };
}

/** E-mail envoyé après une reprogrammation réussie. */
export function rescheduledEmail(d: ConfirmData) {
  const body = `
    <p style="margin:0 0 12px">Bonjour ${d.firstName},</p>
    <p style="margin:0 0 4px">Votre rendez-vous a bien été <strong>reprogrammé</strong> :</p>
    ${infoTable([
      ["Nouvelle date", `<strong>${fmtDateTime(d.startDateTime)}</strong>`],
      ["Lieu", d.location],
    ])}
    ${buttons(d.whatsappUrl, d.rescheduleUrl)}`;
  return {
    subject: `Rendez-vous reprogrammé — ${BUSINESS}`,
    html: shell("Rendez-vous reprogrammé 🔄", body),
  };
}
