import { NextResponse } from "next/server";
import { parseAlertEmail, insertListings } from "@/lib/scan";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Webhook Brevo Inbound Parsing.
 * Brevo POST en JSON. Sécurité = secret en query string `?secret=...`
 * (Brevo ne signe pas la payload, donc URL secrète = barrière suffisante).
 *
 * Payload type Brevo Inbound :
 * { items: [ { From: {Address, Name}, Subject, RawHtmlBody, RawTextBody, SentAtDate, ... } ] }
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!process.env.SCAN_INBOUND_SECRET || secret !== process.env.SCAN_INBOUND_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { items?: Array<Record<string, unknown>> };
    const items = body.items ?? [];
    let totalInserted = 0;
    let totalParsed = 0;

    for (const it of items) {
      const from = (it.From as { Address?: string; Name?: string } | undefined)?.Address ?? "";
      const subject = (it.Subject as string | undefined) ?? null;
      const html = (it.RawHtmlBody as string | undefined) ?? "";
      const text = (it.RawTextBody as string | undefined) ?? "";

      const parsed = parseAlertEmail({ from, subject: subject ?? undefined, html, text });
      totalParsed += parsed.length;
      const inserted = await insertListings(parsed, subject);
      totalInserted += inserted;
    }

    return NextResponse.json({ ok: true, parsed: totalParsed, inserted: totalInserted });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
