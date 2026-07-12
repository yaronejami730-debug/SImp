import { NextResponse } from "next/server";
import { patchTracking, getEvent } from "@/lib/google";
import { getAuth } from "@/lib/auth";
import { scheduleFollowup, cancelFollowup, type FollowupType } from "@/lib/followups";
import { sendEmail } from "@/lib/brevo";
import { signedRatingEmail } from "@/lib/email-templates";
import { signBooking } from "@/lib/auth";
import { baseUrlFrom } from "@/lib/links";
import { notify } from "@/lib/notifications";
import { listCallCenters } from "@/lib/callcenters";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST { eid, present?, signStatus?, negotiation? } -> maj suivi du RDV. Connecté requis. */
export async function POST(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    const { eid, present, signStatus, negotiation, bcSigned, vehicleSold } = (await req.json()) as {
      eid?: string;
      present?: boolean;
      signStatus?: string;
      negotiation?: number;
      bcSigned?: boolean;
      vehicleSold?: boolean;
    };
    if (!eid) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }

    await patchTracking(eid, { present, signStatus, negotiation, bcSigned, vehicleSold });

    // Déclenche les actions post-signature (best-effort, n'empêche pas la réponse).
    if (signStatus !== undefined) {
      try {
        const ev = await getEvent(eid);
        const priv = ev.extendedProperties?.private ?? {};
        const email = priv.clientEmail;
        if (email) {
          // Reset : changement de statut annule TOUTES les relances précédentes.
          await cancelFollowup(email);

          const typeMap: Record<string, FollowupType> = {
            signed: "signed",
            thinking: "thinking",
            unsigned: "unsigned",
          };
          const type = typeMap[signStatus];
          if (type) {
            await scheduleFollowup({
              email,
              civility: priv.clientCivility,
              firstName: priv.clientFirstName ?? "",
              lastName: priv.clientLastName ?? "",
              listingUrl: priv.listingUrl ?? "",
              owner: priv.owner ?? "",
              vehicle: [priv.carBrand, priv.carModel, priv.carFinish].filter(Boolean).join(" "),
              type,
            });
          }
        }
      } catch (err) {
        console.error("post-sign action failed", err);
      }
      // 🔔 Notification interne : RDV signé -> owner + responsable + gestionnaire du call center.
      if (signStatus === "signed") {
        try {
          const ev = await getEvent(eid);
          const priv = ev.extendedProperties?.private ?? {};
          const cc = Number(priv.cc ?? "1");
          const ccs = await listCallCenters();
          const c = ccs.find((x) => x.id === cc);
          const client = `${priv.clientFirstName ?? ""} ${priv.clientLastName ?? ""}`.trim();
          const vehicle = [priv.carBrand, priv.carModel].filter(Boolean).join(" ");
          await notify(
            [priv.owner, c?.responsable_email, c?.gestionnaire_email],
            "signed", `🎉 RDV signé — ${client || "client"}`,
            `${vehicle ? vehicle + " · " : ""}par ${priv.commercial || "?"}`,
            `/client/${encodeURIComponent(eid)}`,
          );
        } catch { /* non-bloquant */ }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
