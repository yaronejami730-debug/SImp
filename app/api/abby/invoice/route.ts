import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getUserByEmail, commercialEmailByName } from "@/lib/users";
import { listAppointments, patchInvoicing } from "@/lib/google";
import { findOrCreateContact, upsertDraftInvoice, type AbbyInvoiceLine } from "@/lib/abby";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DEFAULT_SCHEME = { base: 50, pct: 10 }; // repli si le commercial n'a pas de compte / barème

/** POST { commercial, apptIds: string[] } -> facture BROUILLON Abby (admin uniquement),
 *  construite EXACTEMENT à partir des dossiers filtrés/sélectionnés dans /bilan.
 *  Une ligne par montant encore "à facturer" (frais fixe + % du négocié, AU BARÈME PERSO
 *  du commercial visé — même source que /bilan, commission_base/commission_pct sur son compte).
 *  Marque ensuite ces montants "Facturé" (n° = facture Abby) pour qu'ils disparaissent du "à facturer". */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || s.role !== "admin") return NextResponse.json({ error: "Réservé au super administrateur." }, { status: 403 });

  try {
    const body = (await req.json()) as { commercial?: string; apptIds?: string[] };
    const commercialName = (body.commercial || "").trim();
    const apptIds = new Set((body.apptIds || []).filter(Boolean));
    if (!commercialName || apptIds.size === 0) {
      return NextResponse.json({ error: "commercial et apptIds requis." }, { status: 400 });
    }

    const email = await commercialEmailByName(commercialName);
    if (!email) {
      return NextResponse.json({ error: `Aucun e-mail enregistré pour ${commercialName} — complète sa fiche dans Comptes.` }, { status: 400 });
    }
    const user = await getUserByEmail(email).catch(() => undefined);
    const scheme = user ? { base: Number(user.commission_base), pct: Number(user.commission_pct) } : DEFAULT_SCHEME;

    // Fenêtre large : couvre les dossiers filtrés en bilan (jusqu'à 2 ans en arrière).
    const now = new Date();
    const start = new Date(now.getTime() - 730 * 24 * 3600 * 1000);
    const end = new Date(now.getTime() + 90 * 24 * 3600 * 1000);
    const all = await listAppointments(start, end);
    const targets = all.filter((a) => apptIds.has(a.id));

    type Line = AbbyInvoiceLine & { apptId: string; kind: "ff" | "comm" };
    const lines: Line[] = [];
    const today = now.toISOString().slice(0, 10);

    for (const a of targets) {
      if (a.cancelled) continue;
      const mandatWasSigned = a.signStatus === "signed";
      const ffBillable = mandatWasSigned && (!a.mandatRemoved || a.ffStatus === "invoiced" || a.ffStatus === "paid");
      const ffToInvoice = ffBillable && a.ffStatus === "" ? scheme.base : 0;
      const commToInvoice = a.bcSigned && a.commStatus === "" ? Math.round((scheme.pct / 100) * (a.negotiation || 0)) : 0;
      const clientName = `${a.lastName.toUpperCase()} ${a.firstName}`.trim();
      const immat = a.immatriculation ? ` — ${a.immatriculation}` : "";
      if (ffToInvoice > 0) {
        const signDate = a.signStatusAt ? new Date(a.signStatusAt).toLocaleDateString("fr-FR") : "";
        lines.push({
          apptId: a.id, kind: "ff", amountEur: ffToInvoice,
          designation: `${clientName}${immat}${signDate ? ` — ${signDate}` : ""}`,
        });
      }
      if (commToInvoice > 0) {
        const signDate = a.bcSignedAt ? new Date(a.bcSignedAt).toLocaleDateString("fr-FR") : "";
        lines.push({
          apptId: a.id, kind: "comm", amountEur: commToInvoice,
          designation: `${clientName}${immat}${signDate ? ` — ${signDate}` : ""}`,
        });
      }
    }

    if (lines.length === 0) {
      return NextResponse.json({ ok: true, empty: true, count: 0 });
    }

    const [firstname, ...rest] = (user?.name || commercialName).split(" ");
    const contactId = await findOrCreateContact({ firstname: firstname || email, lastname: rest.join(" "), email });

    // Réutilise le dernier brouillon Abby de ce commercial s'il est encore ouvert (pas
    // finalisé, pas supprimé) : les nouveaux dossiers viennent s'AJOUTER dedans plutôt
    // que de créer une nouvelle facture à chaque clic.
    const pool = getPool();
    const { rows: lastRows } = await pool.query<{ id: number; abby_invoice_id: string; appt_ids: string[] }>(
      `select id, abby_invoice_id, appt_ids from abby_invoice_log where commercial_email = $1 order by created_at desc limit 1`,
      [email],
    );
    const last = lastRows[0];
    const invoice = await upsertDraftInvoice(contactId, lines, last?.abby_invoice_id ?? null);

    // Marque chaque montant facturé (n° = facture Abby), regroupé par dossier.
    const byAppt = new Map<string, Line[]>();
    for (const l of lines) byAppt.set(l.apptId, [...(byAppt.get(l.apptId) ?? []), l]);
    for (const [apptId, ls] of byAppt) {
      const patch: Parameters<typeof patchInvoicing>[1] = {};
      for (const l of ls) {
        if (l.kind === "ff") { patch.ffStatus = "invoiced"; patch.ffNo = invoice.number ?? invoice.id; patch.ffDate = today; }
        else { patch.commStatus = "invoiced"; patch.commNo = invoice.number ?? invoice.id; patch.commDate = today; }
      }
      await patchInvoicing(apptId, patch);
    }

    if (invoice.reused && last) {
      const mergedIds = [...new Set([...(last.appt_ids ?? []), ...byAppt.keys()])];
      await pool.query(
        `update abby_invoice_log set appt_ids = $2, total_cents = $3, abby_invoice_number = coalesce($4, abby_invoice_number), created_by = $5, created_at = now() where id = $1`,
        [last.id, JSON.stringify(mergedIds), invoice.totalCents, invoice.number ?? null, s.email],
      );
    } else {
      await pool.query(
        `insert into abby_invoice_log (commercial_email, month, abby_contact_id, abby_invoice_id, abby_invoice_number, appt_ids, total_cents, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [email, today.slice(0, 7), contactId, invoice.id, invoice.number ?? null, JSON.stringify([...byAppt.keys()]), invoice.totalCents, s.email],
      );
    }

    return NextResponse.json({
      ok: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number ?? null,
      reused: invoice.reused,
      count: lines.length,
      totalEur: invoice.totalCents / 100,
    });
  } catch (e) {
    console.error("[abby/invoice]", e);
    return NextResponse.json({ error: abbyErrorMessage(e) }, { status: 500 });
  }
}

/** L'SDK Abby rejette avec le corps JSON brut de l'erreur (pas une Error) sur les réponses non-2xx. */
function abbyErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (Array.isArray(o.message)) return o.message.join(" · ");
    try { return JSON.stringify(o); } catch { /* fallthrough */ }
  }
  return String(e);
}
