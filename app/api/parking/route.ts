import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { setParkingRequested, markParkingSent, getEvent } from "@/lib/google";
import { sendEmail } from "@/lib/brevo";
import { parkingReservationEmail } from "@/lib/email-templates";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** POST { eid, requested } -> active/désactive la réservation parking + envoie le mail immédiatement. */
export async function POST(req: Request) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const { eid, requested } = (await req.json()) as { eid?: string; requested?: boolean };
    if (!eid) return NextResponse.json({ error: "eid manquant." }, { status: 400 });

    const isReq = requested !== false;
    await setParkingRequested(eid, isReq);

    let emailSent = false;
    let emailError: string | undefined;
    if (isReq) {
      try {
        const ev = await getEvent(eid);
        const priv = ev.extendedProperties?.private ?? {};
        const email = priv.clientEmail;
        const firstName = priv.clientFirstName ?? "";
        if (!email) throw new Error("Pas d'e-mail client sur le RDV.");
        const mail = parkingReservationEmail({
          civility: priv.clientCivility,
          firstName,
          lastName: priv.clientLastName,
          startDateTime: ev.start?.dateTime ?? undefined,
        });
        await sendEmail({ to: email, toName: firstName, subject: mail.subject, html: mail.html });
        await markParkingSent(eid);
        emailSent = true;
      } catch (e) {
        emailError = e instanceof Error ? e.message : "Erreur mail.";
      }
    }

    return NextResponse.json({ ok: true, emailSent, emailError });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
