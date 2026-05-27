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

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(friendEmail)) {
    return NextResponse.json({ error: "E-mail invalide." }, { status: 400 });
  }

  try {
    await getPool().query(
      `insert into referrals (referrer_email, referrer_name, friend_name, friend_phone) values ($1,$2,$3,$4)`,
      ["", "", friendName, friendEmail],
    );

    const base = (process.env.APP_URL ?? "https://simplicicar.store").replace(/\/$/, "");
    const params = new URLSearchParams();
    if (friendName) params.set("name", friendName);
    if (friendEmail) params.set("email", friendEmail);
    const bookUrl = `${base}/recommandation?${params.toString()}`;

    const mail = referralEmail({ friendName: friendName || undefined, bookUrl });
    await sendEmail({ to: friendEmail, toName: friendName, subject: mail.subject, html: mail.html });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
