import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { sendEmail } from "@/lib/brevo";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? process.env.BREVO_SENDER_EMAIL ?? "";

/** POST { firstName, lastName, email, phone, brand, model, km, year, photos[] } */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }

  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim();
  const brand = String(body.brand ?? "").trim();
  const model = String(body.model ?? "").trim();
  const km = Number(String(body.km ?? "").replace(/\D/g, "")) || null;
  const year = Number(body.year) || null;
  const photos = Array.isArray(body.photos) ? (body.photos as string[]).slice(0, 5) : [];

  if (!firstName || !lastName) return NextResponse.json({ error: "Nom et prénom requis." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "E-mail invalide." }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 9) return NextResponse.json({ error: "Téléphone invalide." }, { status: 400 });

  try {
    await getPool().query(
      `insert into estimations (first_name, last_name, email, phone, brand, model, km, year, photos, source, referral)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'recommandation',true)`,
      [firstName, lastName, email, phone, brand, model, km, year, photos],
    );

    if (ADMIN_EMAIL) {
      const photoLinks = photos.length
        ? `<p><strong>${photos.length} photo(s)</strong> jointe(s) — voir le dashboard.</p>`
        : "";
      const html = `
        <h2>Nouvelle estimation via recommandation</h2>
        <p><strong>${firstName} ${lastName}</strong></p>
        <p>📧 ${email}<br/>📞 ${phone}</p>
        <p>Véhicule : <strong>${brand} ${model}</strong>${year ? ` — ${year}` : ""}${km ? ` — ${km.toLocaleString("fr-FR")} km` : ""}</p>
        ${photoLinks}
      `;
      try {
        await sendEmail({ to: ADMIN_EMAIL, subject: `🤝 Recommandation : ${firstName} ${lastName}`, html });
      } catch {}
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
