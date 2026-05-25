const BUSINESS = process.env.BUSINESS_NAME ?? "Simplisicar";

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
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="background:#ffffff;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 16px;font-size:20px">${title}</h1>
      ${body}
      <p style="margin:24px 0 0;font-size:13px;color:#71717a">À très vite,<br/>L'équipe ${BUSINESS}</p>
    </div>
  </div></body></html>`;
}

type ConfirmData = {
  firstName: string;
  startDateTime: string;
  location: string;
  platform: string;
  listingUrl: string;
};

export function confirmationEmail(d: ConfirmData) {
  const body = `
    <p style="margin:0 0 12px">Bonjour ${d.firstName},</p>
    <p style="margin:0 0 12px">Votre rendez-vous est confirmé :</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      <tr><td style="padding:6px 0;color:#71717a">Date</td><td style="padding:6px 0;text-align:right"><strong>${fmtDateTime(d.startDateTime)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#71717a">Lieu</td><td style="padding:6px 0;text-align:right">${d.location}</td></tr>
      <tr><td style="padding:6px 0;color:#71717a">Annonce</td><td style="padding:6px 0;text-align:right"><a href="${d.listingUrl}" style="color:#2563eb">${d.platform}</a></td></tr>
    </table>`;
  return {
    subject: `Confirmation de votre rendez-vous — ${BUSINESS}`,
    html: shell("Rendez-vous confirmé ✅", body),
  };
}

type ReminderData = {
  firstName: string;
  startDateTime: string;
  location: string;
};

export function reminderEmail(d: ReminderData) {
  const body = `
    <p style="margin:0 0 12px">Bonjour ${d.firstName},</p>
    <p style="margin:0 0 12px">Petit rappel : vous avez rendez-vous <strong>demain</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      <tr><td style="padding:6px 0;color:#71717a">Date</td><td style="padding:6px 0;text-align:right"><strong>${fmtDateTime(d.startDateTime)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#71717a">Lieu</td><td style="padding:6px 0;text-align:right">${d.location}</td></tr>
    </table>
    <p style="margin:16px 0 0">N'oubliez pas votre rendez-vous chez ${BUSINESS} !</p>`;
  return {
    subject: `Rappel : votre rendez-vous demain — ${BUSINESS}`,
    html: shell("N'oubliez pas votre rendez-vous ⏰", body),
  };
}
