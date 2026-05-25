import { NextResponse } from "next/server";
import { addLead, searchLeads, deleteLead } from "@/lib/leads";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

function checkPin(req: Request): boolean {
  const pin = process.env.DASHBOARD_PIN;
  return !pin || req.headers.get("x-pin") === pin;
}

/** GET ?phone= -> recherche de leads (PIN). */
export async function GET(req: Request) {
  if (!checkPin(req)) return NextResponse.json({ error: "Code invalide." }, { status: 401 });
  const phone = new URL(req.url).searchParams.get("phone") ?? "";
  try {
    const leads = await searchLeads(phone);
    return NextResponse.json({ ok: true, leads });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { phone, listingUrl, note? } -> ajoute un lead (PIN). */
export async function POST(req: Request) {
  if (!checkPin(req)) return NextResponse.json({ error: "Code invalide." }, { status: 401 });
  try {
    const { phone, listingUrl, note } = (await req.json()) as {
      phone?: string;
      listingUrl?: string;
      note?: string;
    };
    if (!phone?.trim() || !listingUrl?.trim()) {
      return NextResponse.json({ error: "Téléphone et lien requis." }, { status: 400 });
    }
    const lead = await addLead(phone, listingUrl, note);
    return NextResponse.json({ ok: true, lead });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?id= -> supprime un lead (PIN). */
export async function DELETE(req: Request) {
  if (!checkPin(req)) return NextResponse.json({ error: "Code invalide." }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
  try {
    await deleteLead(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
