import Abby from "@abby-inc/node";

/** Client Abby (facturation) — clé API côté serveur uniquement, jamais exposée au navigateur. */
function client() {
  const key = process.env.ABBY_API_KEY;
  if (!key) throw new Error("ABBY_API_KEY manquante.");
  return new Abby(key);
}

export type AbbyInvoiceLine = {
  designation: string;
  description?: string;
  amountEur: number; // montant TTC de la ligne (converti en centimes en interne)
};

type LinePayload = {
  generatedId?: string; unitPrice: number; quantity: number; quantityUnit: null; designation: string;
  description: string; type: "service_delivery"; vatCode: "FR_00HT";
};

function toPayload(l: AbbyInvoiceLine): LinePayload {
  return {
    unitPrice: Math.round(l.amountEur * 100),
    quantity: 1,
    quantityUnit: null,
    designation: l.designation,
    description: l.description ?? "",
    type: "service_delivery",
    vatCode: "FR_00HT", // franchise en base de TVA — vérifier/ajuster dans Abby avant envoi si besoin
  };
}

/** Trouve un contact Abby par email, sinon le crée (nom + email). */
export async function findOrCreateContact(opts: { firstname: string; lastname: string; email: string }): Promise<string> {
  const abby = client();
  const search = await abby.contact.retrieveContacts({ query: { search: opts.email, page: 1, limit: 5 } });
  const existing = (search.data?.docs ?? []).find(
    (c: { emails?: string[] }) => (c.emails ?? []).some((e) => e.toLowerCase() === opts.email.toLowerCase()),
  );
  if (existing?.id) return existing.id;

  const created = await abby.contact.createContact({
    body: { firstname: opts.firstname, lastname: opts.lastname, emails: [opts.email] },
  });
  const id = created.data?.id;
  if (!id) throw new Error("Abby: création du contact a échoué (pas d'id renvoyé).");
  return id;
}

/** Le brouillon existe encore côté Abby et n'a pas été finalisé/supprimé -> ses lignes actuelles (sinon null). */
async function openDraftLines(invoiceId: string): Promise<LinePayload[] | null> {
  const abby = client();
  try {
    const res = await abby.invoice.getInvoice({ path: { invoiceId } });
    const inv = res.data;
    if (!inv || inv.state !== "draft") return null; // finalisé ou dans un autre état -> on n'y touche plus
    return (inv.lines ?? [])
      .filter((l) => l.unitPrice > 0) // ne jamais reconduire une ligne fantôme à 0 €
      .map((l) => ({
        generatedId: l.generatedId ?? l.id,
        unitPrice: l.unitPrice,
        quantity: l.quantity ?? 1,
        quantityUnit: null,
        designation: l.designation,
        description: l.description ?? "",
        type: "service_delivery",
        vatCode: "FR_00HT",
      }));
  } catch {
    return null; // supprimé dans Abby, ou introuvable -> on repart sur un nouveau brouillon
  }
}

/** Crée (ou complète) une facture BROUILLON pour un contact avec ses nouvelles lignes.
 *  Si `reuseInvoiceId` pointe vers un brouillon encore ouvert dans Abby, les nouvelles lignes
 *  s'AJOUTENT aux lignes déjà présentes (l'API remplace tout, donc on renvoie l'union).
 *  Si ce brouillon a été supprimé/finalisé entre-temps, une nouvelle facture est créée.
 *  Ne finalise jamais (pas de numéro définitif). */
export async function upsertDraftInvoice(
  contactId: string,
  newLines: AbbyInvoiceLine[],
  reuseInvoiceId?: string | null,
): Promise<{ id: string; number?: string; totalCents: number; reused: boolean }> {
  const abby = client();
  const existing = reuseInvoiceId ? await openDraftLines(reuseInvoiceId) : null;

  let invoiceId: string;
  let invoiceNumber: string | undefined;
  if (existing) {
    invoiceId = reuseInvoiceId as string;
  } else {
    const invoice = await abby.invoice.createInvoiceByContactOrOrganizationId({ path: { customerId: contactId } });
    const id = invoice.data?.id;
    if (!id) throw new Error("Abby: création de la facture a échoué (pas d'id renvoyé).");
    invoiceId = id;
    invoiceNumber = invoice.data?.number;
  }

  const payload = [...(existing ?? []), ...newLines.map(toPayload)].filter((l) => l.unitPrice > 0); // jamais de ligne à 0 €
  const updated = await abby.billing.updateLines({ path: { billingId: invoiceId }, body: { lines: payload } });
  const totalCents = Number(updated.data?.total?.amountWithTaxAfterDiscount ?? payload.reduce((s, p) => s + p.unitPrice, 0));
  return { id: invoiceId, number: invoiceNumber ?? updated.data?.number, totalCents, reused: !!existing };
}
