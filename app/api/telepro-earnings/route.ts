import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { listAppointments } from "@/lib/google";
import { commissionOf } from "@/lib/commission";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const tokset = (x: string) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

/** GET -> récap "combien on doit à chaque téléprospecteur" (super-admin uniquement).
 *  Même logique que /api/mon-solde (vue "recoit"), calculée pour tous les télépros en un passage. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé super-admin." }, { status: 403 });
  try {
    // Pas de filtre "active" : un téléprospecteur désactivé (compte supprimé) doit rester
    // dans ce récap tant qu'il a de l'historique — voir champ `active` dans la réponse.
    const { rows: telepros } = await getPool().query<{
      email: string; name: string; commission_base: string; commission_pct: string; call_center_name: string | null; active: boolean;
    }>(
      `select u.email, u.name, u.commission_base, u.commission_pct, u.active, cc.name as call_center_name
         from users u left join call_centers cc on cc.id = u.call_center_id
        where u.is_teleprospector = true
        order by u.name`,
    );
    if (telepros.length === 0) return NextResponse.json({ ok: true, telepros: [] });

    const now = Date.now();
    const items = await listAppointments(new Date(now - 5 * 365 * 86400e3), new Date(now + 2 * 365 * 86400e3));

    const { rows: paiements } = await getPool().query<{ commercial_email: string; amount: string; status: string }>(
      `select commercial_email, amount, status from payments where status in ('paid','succeeded','completed')`,
    );

    const out = telepros.map((t) => {
      const email = t.email.toLowerCase();
      const nom = tokset(t.name);
      const base = Number(t.commission_base ?? 0);
      const pct = Number(t.commission_pct ?? 0);
      const miens = items.filter((a) =>
        !a.cancelled && (
          (a.owner ?? "").toLowerCase() === email ||
          (a.teleprospectorEmail ?? "").toLowerCase() === email ||
          (!!nom && tokset(a.teleprospector) === nom)
        ));
      const signes = miens.filter((a) => a.signStatus === "signed" && !a.mandatRemoved);
      const du = signes.reduce((n, a) => n + commissionOf(base, pct, Number(a.negotiation || 0)), 0);
      const paye = paiements.filter((p) => (p.commercial_email || "").toLowerCase() === email).reduce((n, p) => n + Number(p.amount || 0), 0);
      return {
        email: t.email, name: t.active === false ? `${t.name} (compte supprimé)` : t.name, callCenter: t.call_center_name ?? "", base, pct,
        rdv: miens.length, signes: signes.length, du, paye, solde: du - paye, active: t.active !== false,
      };
    });

    return NextResponse.json({ ok: true, telepros: out });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
