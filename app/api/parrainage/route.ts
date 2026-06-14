import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { sendEmail } from "@/lib/brevo";
import { referralEmail } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

/** POST { friendEmail, friendName? } → enregistre le parrainage + envoie le mail au proche. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }

  const friendEmail = String(body.friendEmail ?? "").trim().toLowerCase();
  const friendName = String(body.friendName ?? "").trim();
  const friendPhone = String(body.friendPhone ?? "").trim();
  const referrerName = String(body.referrerName ?? "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(friendEmail)) {
    return NextResponse.json({ error: "E-mail invalide." }, { status: 400 });
  }

  try {
    await getPool().query(
      `insert into referrals (referrer_email, referrer_name, friend_name, friend_email, friend_phone) values ($1,$2,$3,$4,$5)`,
      ["", referrerName, friendName, friendEmail, friendPhone],
    );

    const base = (process.env.APP_URL ?? "https://simplicicar.store").replace(/\/$/, "");
    const sellParams = new URLSearchParams();
    if (friendName) sellParams.set("name", friendName);
    if (friendEmail) sellParams.set("email", friendEmail);
    sellParams.set("type", "vente");
    const sellUrl = `${base}/recommandation?${sellParams.toString()}`;

    const buyParams = new URLSearchParams();
    if (friendName) buyParams.set("name", friendName);
    if (friendEmail) buyParams.set("email", friendEmail);
    buyParams.set("type", "achat");
    const buyUrl = `${base}/recommandation?${buyParams.toString()}`;

    const mail = referralEmail({ friendName: friendName || undefined, referrerName: referrerName || undefined, sellUrl, buyUrl });
    await sendEmail({ to: friendEmail, toName: friendName, subject: mail.subject, html: mail.html });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
