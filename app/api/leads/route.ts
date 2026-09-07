import { NextResponse, after } from "next/server";
import { addLead, searchLeads, deleteLead, updateLeadStatus, LEAD_STATUSES, type LeadStatus } from "@/lib/leads";
import { getAuth } from "@/lib/auth";
import { createGoogleContact } from "@/lib/google";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

function checkPin(req: Request): boolean {
  return !!getAuth(req);
}

/** GET ?phone= -> recherche de leads (connecté). */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const phone = new URL(req.url).searchParams.get("phone") ?? "";
  try {
    const leads = await searchLeads(s.callCenterId, phone);
    return NextResponse.json({ ok: true, leads });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { phone, listingUrl, note? } -> ajoute un lead (PIN). */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Code invalide." }, { status: 401 });
  try {
    const { phone, listingUrl, note, firstName, lastName, email, campaign, rawData } = (await req.json()) as {
      phone?: string;
      listingUrl?: string;
      note?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      campaign?: string;
      rawData?: Record<string, string>;
    };
    if (!phone?.trim()) {
      return NextResponse.json({ error: "Téléphone requis." }, { status: 400 });
    }
    const lead = await addLead(phone, listingUrl, note, s.callCenterId, { firstName, lastName, email, campaign, rawData });
    const base = (process.env.APP_URL ?? "https://simplicicar.store").replace(/\/$/, "");
    after(async () => {
      try {
        await createGoogleContact({
          firstName: lead.first_name || lead.lead_ref,
          lastName: lead.last_name || undefined,
          email: lead.email || undefined,
          phone: lead.phone,
          websites: [lead.listing_url, `${base}/lead/${lead.lead_ref}`].filter(Boolean),
        });
      } catch { /* non-bloquant */ }
    });
    return NextResponse.json({ ok: true, lead });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** PATCH { id, status } -> change le statut d'un lead (NRP1/2/3, rdv_pris...). */
export async function PATCH(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Code invalide." }, { status: 401 });
  try {
    const { id, status } = (await req.json()) as { id?: number; status?: string };
    if (!id || !status || !LEAD_STATUSES.includes(status as LeadStatus)) {
      return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
    }
    const lead = await updateLeadStatus(id, status as LeadStatus, s.callCenterId);
    if (!lead) return NextResponse.json({ error: "Lead introuvable." }, { status: 404 });
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
