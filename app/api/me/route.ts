import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getCallCenter } from "@/lib/call-centers";
import { COMMERCIAUX } from "@/lib/commerciaux";

export const dynamic = "force-dynamic";

/** GET -> infos de l'utilisateur courant + son entité (call center) + liste des commerciaux effective. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const cc = await getCallCenter(s.callCenterId);
    const def = cc?.default_commercial?.trim() || "";
    // Le commercial par défaut de l'entité en tête, sans doublon.
    const commerciaux = [def, ...COMMERCIAUX].filter((c, i, arr) => c && arr.indexOf(c) === i);
    return NextResponse.json({
      ok: true,
      email: s.email, name: s.name, role: s.role,
      callCenter: cc ? { id: cc.id, name: cc.name, defaultCommercial: def } : null,
      commerciaux,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
