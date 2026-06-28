import { NextResponse } from "next/server";
import { patchInvoicing, type InvoicingFields } from "@/lib/google";
import { getAuth } from "@/lib/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST { eid, ...champs facturation } -> maj des frais fixes / commission d'un RDV. */
export async function POST(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const body = (await req.json()) as { eid?: string } & InvoicingFields;
    const { eid, ...fields } = body;
    if (!eid) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    await patchInvoicing(eid, fields);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
