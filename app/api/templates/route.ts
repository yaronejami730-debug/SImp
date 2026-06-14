import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import * as T from "@/lib/email-templates";

export const dynamic = "force-dynamic";

// ── Données d'exemple ────────────────────────────────────
const now = Date.now();
const inDays = (n: number) => new Date(now + n * 86400000).toISOString();
const inHours = (n: number) => new Date(now + n * 3600000).toISOString();
const LOC = "3 rue Bélidor 75017 Paris";
const base = { civility: "Monsieur", firstName: "Jean", lastName: "Dupont" };
const u = {
  bookUrl: "https://exemple.fr/book",
  sellUrl: "https://exemple.fr/vendre",
  buyUrl: "https://exemple.fr/acheter",
  avisUrl: "https://exemple.fr/avis",
  unsubUrl: "https://exemple.fr/unsubscribe",
  rescheduleUrl: "https://exemple.fr/reschedule",
  listingUrl: "https://leboncoin.fr/annonce/123",
};

type Mail = { subject: string; html: string };
type Entry = { key: string; label: string; group: string; make: () => Mail };

// ── Catalogue de tous les templates ─────────────────────
const CATALOG: Entry[] = [
  // Rendez-vous
  { key: "confirmation", group: "Rendez-vous", label: "Confirmation de RDV", make: () => T.confirmationEmail({ ...base, startDateTime: inDays(2), location: LOC, rescheduleUrl: u.rescheduleUrl }) },
  { key: "reminder24", group: "Rendez-vous", label: "Rappel RDV — 24h avant", make: () => T.reminderEmail({ ...base, startDateTime: inDays(1), location: LOC, kind: "24h", rescheduleUrl: u.rescheduleUrl }) },
  { key: "reminder2", group: "Rendez-vous", label: "Rappel RDV — 2h avant", make: () => T.reminderEmail({ ...base, startDateTime: inHours(2), location: LOC, kind: "2h", rescheduleUrl: u.rescheduleUrl }) },
  { key: "rescheduled", group: "Rendez-vous", label: "RDV reprogrammé", make: () => T.rescheduledEmail({ ...base, startDateTime: inDays(3), location: LOC, rescheduleUrl: u.rescheduleUrl }) },
  { key: "parking", group: "Rendez-vous", label: "Place de parking réservée", make: () => T.parkingReservationEmail({ ...base, startDateTime: inDays(2) }) },
  { key: "cancelled", group: "Rendez-vous", label: "RDV annulé", make: () => T.cancelledEmail({ ...base, startDateTime: inDays(1), location: LOC }) },
  { key: "bookingInvite", group: "Rendez-vous", label: "Invitation à choisir un créneau", make: () => T.bookingInviteEmail({ bookUrl: u.bookUrl }) },

  // Relances après annulation
  { key: "cancel1", group: "Relances annulation", label: "Annulation — relance 1 (J+7)", make: () => T.cancellationFollowupEmail({ ...base, stage: 1, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl }) },
  { key: "cancel2", group: "Relances annulation", label: "Annulation — relance 2 (J+14)", make: () => T.cancellationFollowupEmail({ ...base, stage: 2, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl }) },
  { key: "cancel3", group: "Relances annulation", label: "Annulation — relance 3 (J+44)", make: () => T.cancellationFollowupEmail({ ...base, stage: 3, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl }) },

  // Relances post-RDV
  { key: "think1", group: "Relances post-RDV", label: "Réfléchit — relance 1 (J+3)", make: () => T.thinkingFollowupEmail({ ...base, stage: 1, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl }) },
  { key: "think2", group: "Relances post-RDV", label: "Réfléchit — relance 2 (J+13)", make: () => T.thinkingFollowupEmail({ ...base, stage: 2, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl }) },
  { key: "unsigned1", group: "Relances post-RDV", label: "Pas signé — relance 1 (J+14)", make: () => T.unsignedFollowupEmail({ ...base, stage: 1, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl }) },
  { key: "unsigned2", group: "Relances post-RDV", label: "Pas signé — relance 2 (J+44)", make: () => T.unsignedFollowupEmail({ ...base, stage: 2, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl }) },
  { key: "unsigned3", group: "Relances post-RDV", label: "Pas signé — relance 3 (J+119)", make: () => T.unsignedFollowupEmail({ ...base, stage: 3, bookUrl: u.bookUrl, unsubUrl: u.unsubUrl }) },
  { key: "signedRating", group: "Relances post-RDV", label: "Demande d'avis après signature", make: () => T.signedRatingEmail({ ...base, avisUrl: u.avisUrl }) },

  // Prospection / Rappel téléphonique
  { key: "phoneOrg", group: "Rappel téléphonique", label: "Rappel tel — collaborateur (30 min avant)", make: () => T.phoneRappelOrganizerEmail({ organizerName: "Marie", firstName: "Jean", lastName: "Dupont", phone: "06 12 34 56 78", remindAt: inHours(0.5), listingUrl: u.listingUrl, note: "Veut vendre rapidement" }) },
  { key: "phoneClient", group: "Rappel téléphonique", label: "Rappel tel — client (30 min avant)", make: () => T.phoneRappelClientEmail({ firstName: "Jean", lastName: "Dupont", remindAt: inHours(0.5) }) },

  // Parrainage / divers
  { key: "referral", group: "Parrainage & divers", label: "Recommandation (parrainage)", make: () => T.referralEmail({ friendName: "Paul", referrerName: "Jean Dupont", sellUrl: u.sellUrl, buyUrl: u.buyUrl }) },
  { key: "custom", group: "Parrainage & divers", label: "Mail personnalisé (exemple)", make: () => T.customEmail({ ...base, subject: "Votre message personnalisé", body: "Ceci est un exemple de mail personnalisé.\nVous pouvez écrire plusieurs paragraphes.\n\nLe second paragraphe apparaît ici." }) },
];

/** GET           -> liste { key, label, group }.
 *  GET ?key=...   -> { subject, html } du template rendu avec données d'exemple. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const key = new URL(req.url).searchParams.get("key");
  if (key) {
    const entry = CATALOG.find((e) => e.key === key);
    if (!entry) return NextResponse.json({ error: "Template inconnu." }, { status: 404 });
    try {
      const { subject, html } = entry.make();
      return NextResponse.json({ ok: true, key, label: entry.label, subject, html });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, templates: CATALOG.map((e) => ({ key: e.key, label: e.label, group: e.group })) });
}
