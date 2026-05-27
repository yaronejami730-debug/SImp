import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST { referrerEmail?, referrerName?, friendName, friendPhone } */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }

  const friendName = String(body.friendName ?? "").trim();
  const friendPhone = String(body.friendPhone ?? "").trim();
  if (!friendName || friendPhone.replace(/\D/g, "").length < 9) {
    return NextResponse.json({ error: "Nom et téléphone de l'ami requis." }, { status: 400 });
  }

  try {
    await getPool().query(
      `insert into referrals (referrer_email, referrer_name, friend_name, friend_phone) values ($1,$2,$3,$4)`,
      [String(body.referrerEmail ?? ""), String(body.referrerName ?? ""), friendName, friendPhone],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
