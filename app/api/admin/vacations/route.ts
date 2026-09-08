import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listTimeOff, listDelegations, addDelegation, removeDelegation } from "@/lib/availability";
import { listCommercials } from "@/lib/users";

export const dynamic = "force-dynamic";

/** GET -> pour chaque commercial : ses vacances et ses délégations en cours. Admin uniquement.
 *  Permet à l'admin de voir qui est indisponible et de décider qui opère à sa place. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const commercials = await listCommercials();
    const rows = await Promise.all(
      commercials.map(async (c) => {
        const [timeOff, delegations] = await Promise.all([listTimeOff(c.email), listDelegations(c.email)]);
        return { email: c.email, name: c.name, timeOff, delegations };
      }),
    );
    return NextResponse.json({ ok: true, commercials, rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { action:"addDelegation", delegatorEmail, delegateEmail, start, end } | { action:"removeDelegation", delegatorEmail, id }
 *  L'admin programme, pour n'importe quel commercial, qui opère ses RDV pendant une période. Admin uniquement. */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const b = (await req.json()) as { action?: string; delegatorEmail?: string; delegateEmail?: string; start?: string; end?: string; id?: number };
    if (b.action === "addDelegation" && b.delegatorEmail && b.delegateEmail && b.start && b.end) {
      await addDelegation(b.delegatorEmail, b.delegateEmail, b.start, b.end);
    } else if (b.action === "removeDelegation" && b.delegatorEmail && b.id) {
      await removeDelegation(b.delegatorEmail, b.id);
    } else {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
