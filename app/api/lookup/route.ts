import { NextResponse } from "next/server";
import { listAppointments } from "@/lib/google";
import { getAuth } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const digits = (s: string) => s.replace(/\D/g, "");

/** GET ?phone=&url= -> RDV existants correspondants (détection doublons). Connecté requis. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const phone = digits(sp.get("phone") ?? "");
  const url = (sp.get("url") ?? "").trim();
  if (phone.length < 4 && !url) {
    return NextResponse.json({ ok: true, matches: [] });
  }

  const now = new Date();
  const items = await listAppointments(
    new Date(now.getTime() - 365 * 24 * 3600 * 1000),
    new Date(now.getTime() + 180 * 24 * 3600 * 1000),
  );

  const matches = items
    .filter((a) => a.callCenterId === s.callCenterId)
    .map((a) => {
      const byPhone = phone.length >= 4 && digits(a.phone).includes(phone);
      const byUrl = !!url && a.listingUrl === url;
      if (!byPhone && !byUrl) return null;
      return {
        firstName: a.firstName,
        lastName: a.lastName,
        phone: a.phone,
        startDateTime: a.startDateTime,
        listingUrl: a.listingUrl,
        platform: a.platform,
        signStatus: a.signStatus,
        present: a.present,
        matchedBy: byPhone && byUrl ? "phone+url" : byPhone ? "phone" : "url",
      };
    })
    .filter(Boolean)
    .sort((a, b) => ((a!.startDateTime ?? "") > (b!.startDateTime ?? "") ? -1 : 1));

  return NextResponse.json({ ok: true, matches });
}
