import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getEmailContent, getEmailEvents, type BrevoEvent } from "@/lib/brevo";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ uuid: string }> };

/** GET ?mid=<messageId> -> détail d'un mail récupéré depuis Brevo (contenu + events). */
export async function GET(req: Request, { params }: Params) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { uuid } = await params;
  const mid = new URL(req.url).searchParams.get("mid") ?? "";
  try {
    const content = await getEmailContent(uuid);
    let events: BrevoEvent[] = [];
    let eventsError: string | undefined;
    if (mid) {
      try {
        events = await getEmailEvents(mid);
      } catch (e) {
        eventsError = e instanceof Error ? e.message : "Erreur events Brevo.";
      }
    }
    return NextResponse.json({
      ok: true,
      message: {
        channel: "email",
        source: "brevo",
        templateKey: "",
        subject: content?.subject ?? "",
        bodyHtml: content?.html ?? "",
        bodyText: "",
        provider: "brevo",
        providerMessageId: mid,
      },
      events,
      eventsError,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
