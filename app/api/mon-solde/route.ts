import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { listAppointments } from "@/lib/google";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const tokset = (x: string) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

export type StatutDossier = "signe" | "reflexion" | "non_signe" | "absent" | "honore" | "a_venir";

/** GET -> tout ce qu'un commercial doit voir : ses rendez-vous depuis le début,
 *  ce qu'il doit, ce qu'il a déjà réglé, et son solde. Calculé à partir des RDV
 *  eux-mêmes (aucune table de factures à alimenter au préalable).
 *  ?email= : réservé à l'admin, pour consulter le solde d'un commercial. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const demande = params.get("email");
  const cible = (demande && s.role === "admin" ? demande : s.email).toLowerCase();

  // Période demandée (YYYY-MM-DD). Sans période : tout l'historique.
  const jour = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const debut = jour(params.get("from"));
  const fin = jour(params.get("to"));

  try {
    // Rattachement : le call center du compte, et l'agence racine au-dessus de lui.
    const { rows: urows } = await getPool().query(
      `select u.email, u.name, u.commission_base, u.commission_pct, u.call_center_id,
              u.is_commercial, u.is_teleprospector,
              cc.name as call_center_name, coalesce(p.name, cc.name) as agence_name
         from users u
         left join call_centers cc on cc.id = u.call_center_id
         left join call_centers p on p.id = cc.parent_id
        where lower(u.email) = lower($1)`,
      [cible],
    );
    const moi = urows[0] as {
      email: string; name: string; commission_base: string; commission_pct: string;
      is_commercial: boolean; is_teleprospector: boolean;
      call_center_name: string | null; agence_name: string | null;
    } | undefined;
    if (!moi) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });

    const base = Number(moi.commission_base ?? 0);
    const pct = Number(moi.commission_pct ?? 0);
    const monNom = tokset(moi.name);

    // Historique complet : un commercial doit voir tous ses dossiers, pas les 60 derniers jours.
    const now = Date.now();
    const items = await listAppointments(new Date(now - 5 * 365 * 86400e3), new Date(now + 2 * 365 * 86400e3));

    // Deux lectures possibles du même dossier :
    //  - commercial : ce qu'il DOIT au téléprospecteur qui lui a apporté le rendez-vous ;
    //  - téléprospecteur : ce qui LUI EST DÛ pour les rendez-vous qu'il a générés.
    const vueDemandee = params.get("vue");
    const sens: "doit" | "recoit" =
      vueDemandee === "telepro" ? "recoit"
        : vueDemandee === "commercial" ? "doit"
        : moi.is_commercial ? "doit"
        : moi.is_teleprospector ? "recoit"
        : "doit";

    const miens = sens === "doit"
      ? items.filter((a) =>
          (!!a.commercialEmail && a.commercialEmail.toLowerCase() === cible) ||
          (!a.commercialEmail && !!monNom && tokset(a.commercial) === monNom))
      : items.filter((a) =>
          (a.owner ?? "").toLowerCase() === cible ||
          (a.teleprospectorEmail ?? "").toLowerCase() === cible ||
          (!!monNom && tokset(a.teleprospector) === monNom));

    const statutDe = (a: typeof items[number]): StatutDossier => {
      // Mandat retiré : le dossier ne se facture plus, il ne compte donc pas comme signé.
      if (a.signStatus === "signed" && !a.mandatRemoved) return "signe";
      if (a.signStatus === "signed" && a.mandatRemoved) return "non_signe";
      if (a.signStatus === "thinking") return "reflexion";
      if (a.signStatus === "unsigned" || a.signStatus === "listed") return "non_signe";
      if (a.presence === "absent") return "absent";
      if (a.presence === "present") return "honore";
      return "a_venir";
    };

    const dansPeriode = (iso: string | null) => {
      if (!iso) return false;
      const j = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date(iso));
      if (debut && j < debut) return false;
      if (fin && j > fin) return false;
      return true;
    };

    const dossiers = miens
      .filter((a) => !a.cancelled)
      .filter((a) => (debut || fin ? dansPeriode(a.startDateTime) : true))
      .map((a) => {
        const statut = statutDe(a);
        const negociation = Number(a.negotiation || 0);
        // Le commercial doit sa commission dès que le mandat est signé.
        const fixe = statut === "signe" ? base : 0;
        const variable = statut === "signe" ? (pct / 100) * negociation : 0;
        const montant = fixe + variable;
        // Deux lignes de facturation par dossier : le frais fixe (ff) et la part
        // variable sur le négocié (comm). Chacune a son propre état, posé à la main.
        const etat = (v: string): "paye" | "facturation" | "a_payer" =>
          v === "paid" ? "paye" : v === "invoiced" ? "facturation" : "a_payer";
        const etatFixe = etat(a.ffStatus ?? "");
        const etatVariable = etat(a.commStatus ?? "");
        const parts = [
          ...(fixe > 0 ? [etatFixe] : []),
          ...(variable > 0 ? [etatVariable] : []),
        ];
        // L'état le moins avancé l'emporte : un dossier n'est réglé que si tout l'est.
        const paiement: "paye" | "facturation" | "a_payer" | "sans_objet" =
          parts.length === 0 ? "sans_objet"
            : parts.includes("a_payer") ? "a_payer"
            : parts.includes("facturation") ? "facturation"
            : "paye";
        return {
          id: a.id,
          date: a.startDateTime,
          client: `${a.firstName} ${a.lastName}`.trim(),
          vehicule: [a.carBrand, a.carModel].filter(Boolean).join(" "),
          statut,
          negociation,
          fixe,
          variable,
          montant,
          paiement,
          etatFixe,
          etatVariable,
          bcSigned: a.bcSigned,
          vehicleSold: a.vehicleSold,
        };
      })
      .sort((x, y) => (x.date ?? "") < (y.date ?? "") ? 1 : -1);

    const { rows: paiements } = await getPool().query(
      `select id, amount, status, created_at from payments where lower(commercial_email) = lower($1) order by created_at desc`,
      [cible],
    );
    const paye = paiements
      .filter((p) => ["paid", "succeeded", "completed"].includes(String(p.status)))
      .reduce((n, p) => n + Number(p.amount || 0), 0);

    const du = dossiers.reduce((n, d) => n + d.montant, 0);
    const sommeParts = (cible: "a_payer" | "facturation" | "paye") =>
      dossiers.reduce((n, d) =>
        n + (d.fixe > 0 && d.etatFixe === cible ? d.fixe : 0)
          + (d.variable > 0 && d.etatVariable === cible ? d.variable : 0), 0);
    const aPayer = sommeParts("a_payer");
    const enFacturation = sommeParts("facturation");
    const regle = sommeParts("paye");
    const compte = (st: StatutDossier) => dossiers.filter((d) => d.statut === st).length;

    // Chiffre d'affaires généré : les montants négociés des mandats signés.
    const ca = dossiers.filter((d) => d.statut === "signe").reduce((n, d) => n + d.negociation, 0);
    // Facturé : ce qui a fait l'objet d'une facture émise (table invoices).
    const { rows: fact } = await getPool().query(
      `select coalesce(sum(amount), 0)::float total from invoices where lower(commercial_email) = lower($1)`,
      [cible],
    );
    const facture = Number(fact[0]?.total ?? 0);

    return NextResponse.json({
      ok: true,
      commercial: {
        email: moi.email, name: moi.name, base, pct,
        callCenter: moi.call_center_name ?? "", agence: moi.agence_name ?? "",
        sens, // "doit" = commercial qui paie ; "recoit" = téléprospecteur payé
      },
      periode: { from: debut, to: fin },
      totaux: {
        rdv: dossiers.length,
        signes: compte("signe"),
        honores: compte("honore") + compte("signe") + compte("reflexion") + compte("non_signe"),
        absents: compte("absent"),
        aVenir: compte("a_venir"),
        ca, du, facture, paye: regle, solde: du - regle,
        aPayer, enFacturation, regle,
      },
      dossiers,
      paiements,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
