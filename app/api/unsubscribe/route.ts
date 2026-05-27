import { NextResponse } from "next/server";
import { cancelFollowup } from "@/lib/followups";
import { verifyBooking } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET ?t=<token> — stoppe toutes les relances pour cet email. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const payload = verifyBooking(token);

  if (!payload?.email) {
    return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 400 });
  }

  try {
    await cancelFollowup(payload.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
