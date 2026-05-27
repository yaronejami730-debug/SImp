import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
Object.assign(process.env, env);

const a = await import("../lib/auth.ts");
const signBooking = a.signBooking ?? a.default?.signBooking;
const t = await import("../lib/email-templates.ts");
const fn = (name) => t[name] ?? t.default?.[name];

const TO = "yaronejami730@gmail.com";
const BASE = env.APP_URL || "https://simplicicar.store";
const token = signBooking({ email: TO, listingUrl: "", owner: "", civility: "" });
const BOOK = `${BASE}/book?t=${encodeURIComponent(token)}`;
const UNSUB = `${BASE}/unsubscribe?t=${encodeURIComponent(token)}`;
const AVIS = `${BASE}/avis`;
const WA = "https://wa.me/33160319059";
const RESCHEDULE = `${BASE}/reschedule?eid=test`;

async function send(subject, html) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: env.BREVO_SENDER_NAME || "Simplicicar", email: env.BREVO_SENDER_EMAIL },
      to: [{ email: TO }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) console.error("ERR:", await res.text());
}

const startDt = "2026-06-15T14:30:00Z";

const mails = [
  // 1. PRISE DE RDV
  { ctx: "PRISE DE RDV → envoyé immédiatement à la création du RDV",
    ...fn("confirmationEmail")({ firstName: "Yarone", lastName: "Test", startDateTime: startDt, location: "3 rue Bélidor 75017 Paris", whatsappUrl: WA, rescheduleUrl: RESCHEDULE }) },

  // 2. RAPPEL 24H
  { ctx: "RAPPEL 24H → envoyé automatiquement 24h avant le RDV (cron)",
    ...fn("reminderEmail")({ firstName: "Yarone", lastName: "Test", startDateTime: startDt, location: "3 rue Bélidor 75017 Paris", kind: "24h", whatsappUrl: WA, rescheduleUrl: RESCHEDULE }) },

  // 3. RAPPEL 2H
  { ctx: "RAPPEL 2H → envoyé automatiquement 2h avant le RDV (cron)",
    ...fn("reminderEmail")({ firstName: "Yarone", lastName: "Test", startDateTime: startDt, location: "3 rue Bélidor 75017 Paris", kind: "2h", whatsappUrl: WA, rescheduleUrl: RESCHEDULE }) },

  // 4. REPROGRAMMATION
  { ctx: "REPROGRAMMATION → envoyé quand le client reprogramme son RDV",
    ...fn("rescheduledEmail")({ firstName: "Yarone", lastName: "Test", startDateTime: startDt, location: "3 rue Bélidor 75017 Paris", whatsappUrl: WA, rescheduleUrl: RESCHEDULE }) },

  // 5. ANNULATION
  { ctx: "ANNULATION → envoyé immédiatement quand le RDV est annulé",
    ...fn("cancelledEmail")({ firstName: "Yarone", lastName: "Test", startDateTime: startDt, location: "3 rue Bélidor 75017 Paris" }) },

  // 6-8. RELANCES ANNULATION
  { ctx: "RELANCE ANNULATION 1/3 → J+7 après annulation (cron)",
    ...fn("cancellationFollowupEmail")({ stage: 1, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
  { ctx: "RELANCE ANNULATION 2/3 → J+21 après annulation (cron)",
    ...fn("cancellationFollowupEmail")({ stage: 2, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
  { ctx: "RELANCE ANNULATION 3/3 → J+51 après annulation (cron)",
    ...fn("cancellationFollowupEmail")({ stage: 3, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },

  // 9. SIGNÉ → NOTATION
  { ctx: "SIGNÉ → envoyé immédiatement quand on clique Signé dans l'agenda",
    ...fn("signedRatingEmail")({ firstName: "Yarone", avisUrl: AVIS }) },

  // 10-11. RÉFLÉCHIT
  { ctx: "RÉFLÉCHIT 1/2 → J+3 après le RDV quand on clique Réfléchit (cron)",
    ...fn("thinkingFollowupEmail")({ stage: 1, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
  { ctx: "RÉFLÉCHIT 2/2 → J+13 après le RDV (cron)",
    ...fn("thinkingFollowupEmail")({ stage: 2, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },

  // 12-14. PAS SIGNÉ
  { ctx: "PAS SIGNÉ 1/3 → J+14 après le RDV quand on clique Pas signé (cron)",
    ...fn("unsignedFollowupEmail")({ stage: 1, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
  { ctx: "PAS SIGNÉ 2/3 → J+44 après le RDV (cron)",
    ...fn("unsignedFollowupEmail")({ stage: 2, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
  { ctx: "PAS SIGNÉ 3/3 → J+119 après le RDV (cron)",
    ...fn("unsignedFollowupEmail")({ stage: 3, firstName: "Yarone", bookUrl: BOOK, unsubUrl: UNSUB }) },
];

console.log(`Sending ${mails.length} emails to ${TO}...\n`);
let i = 1;
for (const m of mails) {
  const prefix = `[TEST ${i}/${mails.length}] ${m.ctx} — `;
  console.log(`${i}/${mails.length} ${m.ctx}`);
  await send(prefix + m.subject, m.html);
  i++;
}
console.log(`\n✅ ${mails.length} mails envoyés à ${TO}`);
