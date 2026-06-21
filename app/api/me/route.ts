import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getCallCenter, listCallCenters } from "@/lib/call-centers";
import { getUserByEmail, listCommercials } from "@/lib/users";
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

    // Phase A : comptes commerciaux réels (sélectionnables comme exécutant), tous entités confondus.
    const commercialAccounts = await listCommercials(); // [{ email, name, call_center_id }]

    // Liste de noms (rétrocompat) = comptes commerciaux + anciens libellés + default_commercial.
    const allCcs = await listCallCenters();
    const accountNames = commercialAccounts.map((c) => c.name.trim()).filter(Boolean);
    const allCommerciaux = Array.from(new Set([
      ...accountNames,
      ...allCcs.map((c) => c.default_commercial.trim()).filter(Boolean),
      ...COMMERCIAUX,
    ]));
    // Entité 1 (Yaron) : liste complète ; autres entités : comptes commerciaux + leur default.
    const commerciaux = callCenterId === 1
      ? allCommerciaux
      : Array.from(new Set([...accountNames, def].filter(Boolean)));

    return NextResponse.json({
      ok: true,
      email: s.email, name: s.name, role: s.role, callCenterId,
      callCenter: cc ? { id: cc.id, name: cc.name, defaultCommercial: def } : null,
      commerciaux,
      allCommerciaux,
      commercialAccounts, // {email,name} pour stocker l'e-mail du commercial sur le RDV
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
