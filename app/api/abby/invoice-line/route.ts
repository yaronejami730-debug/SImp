import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getEvent, eventToAppointmentItem, patchInvoicing } from "@/lib/google";
import { listAccords, teleproDeal } from "@/lib/remuneration";
import { listCallCenters, ancestryMap } from "@/lib/callcenters";
import { getUserByEmail } from "@/lib/users";
import { findOrCreateContact, upsertDraftInvoice, type AbbyInvoiceLine } from "@/lib/abby";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST { eid, kind: "ff"|"comm" } -> ajoute UNE ligne (ce dossier) au DERNIER brouillon Abby
 *  connu de ce téléprospecteur (s'il est encore ouvert), sinon en démarre un nouveau. Montant
 *  pris sur le deal réel du téléprospecteur (remuneration_accords), pas le barème plat.
 *  Admin uniquement. Marque ensuite ffStatus/commStatus "invoiced". */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé au super administrateur." }, { status: 403 });

  try {
    const body = (await req.json()) as { eid?: string; kind?: "ff" | "comm" };
    const { eid, kind } = body;
    if (!eid || (kind !== "ff" && kind !== "comm")) {
      return NextResponse.json({ error: "eid et kind ('ff'|'comm') requis." }, { status: 400 });
    }

    const ev = await getEvent(eid);
    const p = ev.extendedProperties?.private ?? {};
    if (!p.owner) return NextResponse.json({ error: "Dossier sans téléprospecteur (owner)." }, { status: 400 });

    const appt = eventToAppointmentItem(ev);
    const [accords, ccs] = await Promise.all([listAccords(), listCallCenters()]);
    const deal = teleproDeal(appt, accords, ancestryMap(ccs));
    const u = deal ? undefined : await getUserByEmail(p.owner).catch(() => undefined);
    const base = deal ? deal.base_eur : Number(u?.commission_base ?? 50);
    const pct = deal ? ((deal.pct_nego > 0 ? deal.pct_nego : deal.sold_pct)) : Number(u?.commission_pct ?? 10);
    const soldEur = deal?.sold_eur ?? 0;
    const nego = appt.negotiation || 0;

    const clientName = `${appt.lastName.toUpperCase()} ${appt.firstName}`.trim();
    const immat = appt.immatriculation ? ` — ${appt.immatriculation}` : "";
    const vehicle = [appt.carBrand, appt.carModel, appt.carFinish].filter(Boolean).join(" ");

    let amountEur = 0;
    let designation = "";
    let description = "";
    if (kind === "ff") {
      amountEur = base;
      const signDate = appt.signStatusAt ? new Date(appt.signStatusAt).toLocaleDateString("fr-FR") : "";
      designation = `${clientName}${immat}${signDate ? ` — ${signDate}` : ""}`;
      description = [signDate, vehicle, "mandat signé"].filter(Boolean).join(" · ");
    } else {
      amountEur = Math.round((pct / 100) * nego) + Math.round(soldEur);
      const signDate = appt.bcSignedAt ? new Date(appt.bcSignedAt).toLocaleDateString("fr-FR") : "";
      designation = `${clientName}${immat}${signDate ? ` — ${signDate}` : ""}`;
      description = [signDate, vehicle, "commission"].filter(Boolean).join(" · ");
    }
    if (amountEur <= 0) return NextResponse.json({ error: "Montant à facturer nul — rien à envoyer à Abby." }, { status: 400 });

    const email = p.owner.toLowerCase();
    const [firstname, ...rest] = (appt.teleprospector || email).split(" ");
    const contactId = await findOrCreateContact({ firstname: firstname || email, lastname: rest.join(" "), email });

    const pool = getPool();
    const { rows: lastRows } = await pool.query<{ abby_invoice_id: string }>(
      `select abby_invoice_id from abby_invoice_log where commercial_email = $1 order by created_at desc limit 1`,
      [email],
    );
    const line: AbbyInvoiceLine = { designation, description, amountEur };
    const invoice = await upsertDraftInvoice(contactId, [line], lastRows[0]?.abby_invoice_id ?? null);

    const today = new Date().toISOString().slice(0, 10);
    const patch: Parameters<typeof patchInvoicing>[1] = kind === "ff"
      ? { ffStatus: "invoiced", ffNo: invoice.number ?? invoice.id, ffDate: today }
      : { commStatus: "invoiced", commNo: invoice.number ?? invoice.id, commDate: today };
    await patchInvoicing(eid, patch);

    if (invoice.reused) {
      const { rows } = await pool.query<{ id: number; appt_ids: string[] }>(
        `select id, appt_ids from abby_invoice_log where abby_invoice_id = $1`,
        [invoice.id],
      );
      const row = rows[0];
      if (row) {
        const mergedIds = [...new Set([...(row.appt_ids ?? []), eid])];
        await pool.query(
          `update abby_invoice_log set appt_ids = $2, total_cents = $3, abby_invoice_number = coalesce($4, abby_invoice_number), created_by = $5, created_at = now() where id = $1`,
          [row.id, JSON.stringify(mergedIds), invoice.totalCents, invoice.number ?? null, s.email],
        );
      }
    } else {
      await pool.query(
        `insert into abby_invoice_log (commercial_email, month, abby_contact_id, abby_invoice_id, abby_invoice_number, appt_ids, total_cents, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [email, today.slice(0, 7), contactId, invoice.id, invoice.number ?? null, JSON.stringify([eid]), invoice.totalCents, s.email],
      );
    }

    return NextResponse.json({ ok: true, invoiceId: invoice.id, invoiceNumber: invoice.number ?? null, amountEur, reused: invoice.reused });
  } catch (e) {
    console.error("[abby/invoice-line]", e);
    const message = e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e) ? String((e as { message: unknown }).message) : "Erreur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
