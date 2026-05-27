import { NextResponse } from "next/server";
import { patchTracking, getEvent } from "@/lib/google";
import { getAuth } from "@/lib/auth";
import { scheduleFollowup, type FollowupType } from "@/lib/followups";
import { sendEmail } from "@/lib/brevo";
import { signedRatingEmail } from "@/lib/email-templates";
import { signBooking } from "@/lib/auth";
import { baseUrlFrom } from "@/lib/links";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST { eid, present?, signStatus?, negotiation? } -> maj suivi du RDV. Connecté requis. */
export async function POST(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const { eid, present, signStatus, negotiation } = (await req.json()) as {
      eid?: string;
      present?: boolean;
      signStatus?: string;
      negotiation?: number;
    };
    if (!eid) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }

    await patchTracking(eid, { present, signStatus, negotiation });

    // Déclenche les actions post-signature (best-effort, n'empêche pas la réponse).
    if (signStatus && ["thinking", "unsigned", "signed"].includes(signStatus)) {
      try {
        const ev = await getEvent(eid);
        const priv = ev.extendedProperties?.private ?? {};
        const email = priv.clientEmail;
        const civility = priv.clientCivility;
        const firstName = priv.clientFirstName ?? "";
        const lastName = priv.clientLastName ?? "";
        const listingUrl = priv.listingUrl ?? "";
        const owner = priv.owner ?? "";

        if (email) {
          const typeMap: Record<string, FollowupType> = {
            signed: "signed",
            thinking: "thinking",
            unsigned: "unsigned",
          };
          const type = typeMap[signStatus];
          if (type) {
            await scheduleFollowup({
              email,
              civility,
              firstName,
              lastName,
              listingUrl,
              owner,
              type,
            });
          }
        }
      } catch (err) {
        console.error("post-sign action failed", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
