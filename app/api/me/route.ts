import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getCallCenter, listCallCenters } from "@/lib/call-centers";
import { getUserByEmail } from "@/lib/users";
import { COMMERCIAUX } from "@/lib/commerciaux";

export const dynamic = "force-dynamic";

/** GET -> infos de l'utilisateur courant + son entité (call center) + liste des commerciaux effective. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    // Re-dérive le call center depuis la DB (autoritatif, même si le token est ancien).
    let callCenterId = s.callCenterId;
    try { const u = await getUserByEmail(s.email); if (u?.call_center_id) callCenterId = u.call_center_id; } catch { /* défaut token */ }
    const cc = await getCallCenter(callCenterId);
    const def = cc?.default_commercial?.trim() || "";
    // Entité Yaron (1) : liste complète. Autres entités : UNIQUEMENT leur commercial (forcé).
    const commerciaux = callCenterId === 1
      ? [def, ...COMMERCIAUX].filter((c, i, arr) => c && arr.indexOf(c) === i)
      : (def ? [def] : [...COMMERCIAUX]);
    // Commerciaux de TOUTES les entités (pour assigner un déplacement à un commercial externe).
    const allCcs = await listCallCenters();
    const allCommerciaux = Array.from(new Set([...allCcs.map((c) => c.default_commercial.trim()).filter(Boolean), ...COMMERCIAUX]));

    return NextResponse.json({
      ok: true,
      email: s.email, name: s.name, role: s.role, callCenterId,
      callCenter: cc ? { id: cc.id, name: cc.name, defaultCommercial: def } : null,
      commerciaux,
      allCommerciaux,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
