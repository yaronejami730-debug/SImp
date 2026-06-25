import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listBookingInvites } from "@/lib/messages";
import { listAppointments } from "@/lib/google";
import { getEmailEvents } from "@/lib/brevo";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const OPEN_EVENTS = new Set(["opened", "uniqueOpened", "firstOpening"]);
const CLICK_EVENTS = new Set(["click", "clicks"]);

/** GET -> clients invités à prendre RDV mais qui n'ont PAS encore réservé (+ ouvert/cliqué). */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const invites = await listBookingInvites(s.role === "admin" ? undefined : s.email);

    // E-mails ayant déjà un RDV (donc plus hésitants).
    const now = Date.now();
    const appts = await listAppointments(new Date(now - 365 * 86400000), new Date(now + 365 * 86400000));
    const booked = new Set(appts.filter((a) => !a.cancelled && a.email).map((a) => a.email.trim().toLowerCase()));

    const pending = invites.filter((i) => !booked.has(i.to_email.trim().toLowerCase())).slice(0, 60);

    const rows = await Promise.all(
      pending.map(async (i) => {
        let opened = false, clicked = false, eventsKnown = false;
        if (i.provider_message_id) {
          try {
            const events = await getEmailEvents(i.provider_message_id);
            eventsKnown = true;
            opened = events.some((e) => OPEN_EVENTS.has(e.event) || CLICK_EVENTS.has(e.event));
            clicked = events.some((e) => CLICK_EVENTS.has(e.event));
          } catch { /* events indispo, on garde inconnu */ }
        }
        return {
          email: i.to_email,
          phone: i.to_phone ?? "",
          clientName: i.client_name ?? "",
          teleprospector: i.owner ?? "",
          type: i.template_key,
          sentAt: i.sent_at,
          invites: i.invite_count,
          opened,
          clicked,
          eventsKnown,
        };
      }),
    );

    return NextResponse.json({ ok: true, hesitants: rows, total: rows.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
