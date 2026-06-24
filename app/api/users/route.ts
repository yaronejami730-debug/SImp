import { NextResponse } from "next/server";
import { listUsers, createUser, deleteUser, updateUserFlags } from "@/lib/users";
import { schemeByKey } from "@/lib/commission";
import { getAuth } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

function requireAdmin(req: Request) {
  const s = getAuth(req);
  return s && s.role === "admin" ? s : null;
}

/** GET -> tous les comptes (commerciaux + téléprospecteurs). */
export async function GET(req: Request) {
  const s = requireAdmin(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const users = await listUsers();
    return NextResponse.json({ ok: true, users });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> crée un compte commercial OU téléprospecteur (login), avec sa commission.
 *  { type:"commercial"|"telepro", name, email, password, phone, schemeKey } */
export async function POST(req: Request) {
  const s = requireAdmin(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      type?: "commercial" | "telepro";
      email?: string; password?: string; name?: string; phone?: string; schemeKey?: string;
    };
    if (!b.email?.trim() || !b.password?.trim() || !b.name?.trim()) {
      return NextResponse.json({ error: "Nom, email et mot de passe requis." }, { status: 400 });
    }
    const sch = schemeByKey(b.schemeKey);
    const isCommercial = b.type === "commercial";
    const user = await createUser({
      email: b.email, password: b.password, name: b.name, role: "collab",
      commissionBase: sch.base, commissionPct: sch.pct, phone: b.phone,
      isCommercial, isTeleprospector: !isCommercial,
    });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur.";
    return NextResponse.json({ error: /duplicate|unique/i.test(msg) ? "Cet email existe déjà." : msg }, { status: 500 });
  }
}

/** PATCH -> met à jour flags/infos d'un compte (rôles, actif, tél, commission). */
export async function PATCH(req: Request) {
  const s = requireAdmin(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const b = (await req.json()) as { id?: number; isCommercial?: boolean; isTeleprospector?: boolean; active?: boolean; phone?: string; schemeKey?: string };
    if (!b.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
    const patch: Parameters<typeof updateUserFlags>[1] = {
      isCommercial: b.isCommercial, isTeleprospector: b.isTeleprospector, active: b.active, phone: b.phone,
    };
    if (b.schemeKey) { const sch = schemeByKey(b.schemeKey); patch.commissionBase = sch.base; patch.commissionPct = sch.pct; }
    await updateUserFlags(b.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?id= -> supprime un compte (pas un admin). */
export async function DELETE(req: Request) {
  const s = requireAdmin(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
  try {
    await deleteUser(id, s.callCenterId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
