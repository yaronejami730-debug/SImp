import { NextResponse } from "next/server";
import { getAuth, signBooking } from "@/lib/auth";
import { baseUrlFrom } from "@/lib/links";

export const dynamic = "force-dynamic";

/** GET -> lien de prise de rendez-vous personnel du compte connecté.
 *  Le client qui l'ouvre choisit son créneau parmi les disponibilités du commercial. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const token = signBooking({
    owner: s.email,
    callCenterId: s.callCenterId,
    commercial: s.isCommercial ? s.name : undefined,
  });
  return NextResponse.json({
    ok: true,
    url: `${baseUrlFrom(req)}/book?t=${encodeURIComponent(token)}`,
    // Les liens de réservation sont signés et valables 21 jours (voir signBooking).
    expireLe: new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString(),
    commercial: s.name,
  });
}
