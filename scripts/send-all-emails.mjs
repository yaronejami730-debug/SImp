import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
Object.assign(process.env, env);

const T = await import("../lib/email-templates.ts");
const { sendEmail } = await import("../lib/brevo.ts");

const to = process.argv[2] || "yaronejami730@gmail.com";
const base = (env.APP_URL || "https://www.simplicicar.store").replace(/\/$/, "");
const start = "2026-06-20T15:00:00+02:00";
const remind = "2026-06-20T15:30:00+02:00";
const loc = "3 rue Bélidor, 75017 Paris";
const who = { civility: "Monsieur", firstName: "Yarone", lastName: "Test" };
const bookUrl = `${base}/book`;
const unsubUrl = `${base}/unsubscribe`;
const avisUrl = `${base}/avis`;

// [label, "quand c'est envoyé", mailObj]
const mails = [
  ["Confirmation RDV", "À la création d'un RDV (formulaire prise de RDV)", T.confirmationEmail({ ...who, startDateTime: start, location: loc, rescheduleUrl: `${base}/reschedule?eid=x` })],
  ["Rappel 24h", "24h avant le RDV (cron)", T.reminderEmail({ ...who, startDateTime: start, location: loc, kind: "24h", rescheduleUrl: `${base}/reschedule?eid=x` })],
  ["Rappel 2h", "2h avant le RDV (cron)", T.reminderEmail({ ...who, startDateTime: start, location: loc, kind: "2h", rescheduleUrl: `${base}/reschedule?eid=x` })],
  ["RDV reprogrammé", "Quand on change le créneau d'un RDV", T.rescheduledEmail({ ...who, startDateTime: start, location: loc, rescheduleUrl: `${base}/reschedule?eid=x` })],
  ["Place parking réservée", "~2h avant le RDV si parking demandé (cron / bouton fiche)", T.parkingReservationEmail({ ...who, startDateTime: start })],
  ["Mail personnalisé", "Bouton 'mail personnalisé' dans la fiche client", T.customEmail({ ...who, subject: "Exemple de mail personnalisé", body: "Voici un message libre tapé depuis la fiche client.\n\nDeuxième paragraphe." })],
  ["Invitation à choisir créneau", "Bouton 'laisser le client choisir son créneau' (envoi lien)", T.bookingInviteEmail({ bookUrl })],
  ["Relance annulation #1", "J+7 après une annulation", T.cancellationFollowupEmail({ stage: 1, ...who, bookUrl, unsubUrl })],
  ["Relance annulation #2", "J+21 après annulation", T.cancellationFollowupEmail({ stage: 2, ...who, bookUrl, unsubUrl })],
  ["Relance annulation #3", "J+51 après annulation (dernière)", T.cancellationFollowupEmail({ stage: 3, ...who, bookUrl, unsubUrl })],
  ["Relance 'réfléchit' #1", "J+3 après RDV statut 'réfléchit'", T.thinkingFollowupEmail({ stage: 1, ...who, bookUrl, unsubUrl })],
  ["Relance 'réfléchit' #2", "J+13 après RDV statut 'réfléchit'", T.thinkingFollowupEmail({ stage: 2, ...who, bookUrl, unsubUrl })],
  ["Relance 'pas signé' #1", "J+14 après RDV non signé", T.unsignedFollowupEmail({ stage: 1, ...who, bookUrl, unsubUrl })],
  ["Relance 'pas signé' #2", "J+44 après RDV non signé", T.unsignedFollowupEmail({ stage: 2, ...who, bookUrl, unsubUrl })],
  ["Relance 'pas signé' #3", "J+119 après RDV non signé (dernière)", T.unsignedFollowupEmail({ stage: 3, ...who, bookUrl, unsubUrl })],
  ["Demande d'avis (notation)", "J+14 après signature → lien noter (avec token client+véhicule)", T.signedRatingEmail({ ...who, avisUrl })],
  ["Recommandation au proche (parrainage)", "Quand un client parraine quelqu'un", T.referralEmail({ friendName: "Jean", referrerName: "Yarone", sellUrl: `${base}/recommandation?type=vente`, buyUrl: `${base}/recommandation?type=achat` })],
  ["Rappel tél — organisateur", "30 min avant un RDV téléphonique (au collaborateur)", T.phoneRappelOrganizerEmail({ organizerName: "Raphaël", firstName: "Yarone", lastName: "Test", phone: "06 12 34 56 78", remindAt: remind, listingUrl: "https://www.leboncoin.fr/x", note: "Rappeler après 18h" })],
  ["Rappel tél — client", "30 min avant un RDV téléphonique (au client)", T.phoneRappelClientEmail({ firstName: "Yarone", lastName: "Test", remindAt: remind })],
  ["RDV annulé", "Quand on annule un RDV (mail au client)", T.cancelledEmail({ ...who, startDateTime: start, location: loc })],
];

console.log(`Envoi de ${mails.length} mails de test à ${to}\n`);
let n = 0;
for (const [label, when, mail] of mails) {
  n++;
  const subject = `[TEST ${n}/${mails.length}] ${mail.subject}`;
  try {
    await sendEmail({ to, toName: "Yarone Test", subject, html: mail.html });
    console.log(`✅ ${n}. ${label} — ${when}`);
  } catch (e) {
    console.log(`❌ ${n}. ${label}: ${e instanceof Error ? e.message : e}`);
  }
  await new Promise((r) => setTimeout(r, 400));
}
console.log("\nTerminé.");
