import { NextResponse } from "next/server";
import { addEstimation } from "@/lib/estimations";
import { sendEmail } from "@/lib/brevo";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? process.env.BREVO_SENDER_EMAIL ?? "";

/** POST { firstName, lastName, email, phone, brand?, model?, km?, source? } */
export async function POST(req: Request) {
  let body: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    brand?: string;
    model?: string;
    km?: number | string;
    source?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const firstName = body.firstName?.trim() ?? "";
  const lastName = body.lastName?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "Nom et prénom requis." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "E-mail invalide." }, { status: 400 });
  }
  if (phone.replace(/\D/g, "").length < 9) {
    return NextResponse.json({ error: "Téléphone invalide." }, { status: 400 });
  }

  const kmNum = typeof body.km === "number" ? body.km : Number(String(body.km ?? "").replace(/\D/g, "")) || null;

  try {
    const est = await addEstimation({
      firstName,
      lastName,
      email,
      phone,
      brand: body.brand,
      model: body.model,
      km: kmNum,
      source: body.source || "paris-17",
    });

    // Notification admin — best-effort, n'empêche pas la réponse.
    if (ADMIN_EMAIL) {
      const html = `
        <h2>Nouvelle estimation — ${est.source}</h2>
        <p><strong>${est.first_name} ${est.last_name}</strong></p>
        <p>📧 ${est.email}<br/>📞 ${est.phone}</p>
        <p>Véhicule : <strong>${est.brand} ${est.model}</strong>${est.km ? ` — ${est.km.toLocaleString("fr-FR")} km` : ""}</p>
      `;
      try {
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `🚗 Nouvelle estimation : ${est.first_name} ${est.last_name}`,
          html,
        });
      } catch (err) {
        console.error("admin notify failed", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur." },
      { status: 500 },
    );
  }
}
