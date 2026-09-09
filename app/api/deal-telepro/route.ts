import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listCallCenters, type CallCenter } from "@/lib/callcenters";
import { listUsers, getUserById, updateUserFlags } from "@/lib/users";

export const dynamic = "force-dynamic";

/** "Deal €" : ce que touche chaque téléprospecteur d'un call center, par RDV signé.
 *  Qui a le droit de FIXER ce montant dépend de call_centers.telepro_pay_mode :
 *  - 'responsable' (par défaut) : le responsable du call center redistribue lui-même en interne.
 *  - 'gestionnaire' : celui qui a vendu le call center au commercial fixe direct, par téléprospecteur —
 *    le responsable reste visible (lecture seule) mais ne décide pas.
 *  Le super-admin peut toujours modifier, quel que soit le mode. */

function decider(me: string, cc: CallCenter): { mode: "gestionnaire" | "responsable"; isResp: boolean; isGest: boolean; canEdit: boolean } {
  const mode = cc.telepro_pay_mode ?? "responsable";
  const isResp = me === (cc.responsable_email || "").toLowerCase() || me === (cc.responsable_email_2 || "").toLowerCase();
  const isGest = !!cc.gestionnaire_email && me === cc.gestionnaire_email.toLowerCase();
  const canEdit = (mode === "responsable" && isResp) || (mode === "gestionnaire" && isGest);
  return { mode, isResp, isGest, canEdit };
}

export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const me = s.email.toLowerCase();
    const ccs = (await listCallCenters()).filter((c) => c.active !== false);
    const scoped = ccs.filter((c) => {
      if (s.role === "admin") return true;
      const d = decider(me, c);
      return d.isResp || d.isGest;
    });
    const groups = [];
    for (const c of scoped) {
      const d = decider(me, c);
      const canEdit = s.role === "admin" || d.canEdit;
      const telepros = (await listUsers(c.id)).filter((u) => u.is_teleprospector && u.active);
      if (!telepros.length && s.role !== "admin") continue;
      groups.push({
        ccId: c.id, ccName: c.name, mode: d.mode, canEdit,
        telepros: telepros.map((u) => ({ id: u.id, name: u.name, email: u.email, base: Number(u.commission_base), pct: Number(u.commission_pct) })),
      });
    }
    return NextResponse.json({ ok: true, groups });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** PATCH { userId, base, pct } -> fixe le deal € d'UN téléprospecteur. */
export async function PATCH(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as { userId?: number; base?: number; pct?: number };
    if (!b.userId) return NextResponse.json({ error: "userId requis." }, { status: 400 });
    const target = await getUserById(b.userId);
    if (!target || !target.is_teleprospector) return NextResponse.json({ error: "Téléprospecteur introuvable." }, { status: 404 });
    if (s.role !== "admin") {
      // target.call_center_id remonte en string (bigint pg non casté par getUserById) : Number() avant comparaison.
      const cc = (await listCallCenters()).find((c) => c.id === Number(target.call_center_id));
      if (!cc || !decider(s.email.toLowerCase(), cc).canEdit) {
        return NextResponse.json({ error: "Tu ne décides pas le deal € de ce call center." }, { status: 403 });
      }
    }
    await updateUserFlags(b.userId, { commissionBase: Number(b.base ?? 0), commissionPct: Number(b.pct ?? 0) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
