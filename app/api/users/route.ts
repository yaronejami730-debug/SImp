import { NextResponse } from "next/server";
import { listUsers, createUser, deleteUser, updateUserFlags } from "@/lib/users";
import { schemeByKey } from "@/lib/commission";
import { getAuth } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Admin (super) OU responsable de call center peuvent gérer des comptes.
function requireManager(req: Request) {
  const s = getAuth(req);
  return s && (s.role === "admin" || s.role === "responsable") ? s : null;
}

/** GET -> comptes. Super-admin = tous ; responsable = ceux de SON call center. */
export async function GET(req: Request) {
  const s = requireManager(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const users = s.role === "admin" ? await listUsers() : await listUsers(s.callCenterId);
    return NextResponse.json({ ok: true, users, role: s.role, callCenterId: s.callCenterId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> crée un compte commercial OU téléprospecteur.
 *  Super-admin : les deux, call center 1. Responsable : téléprospecteur seulement, dans SON call center. */
export async function POST(req: Request) {
  const s = requireManager(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      type?: "commercial" | "telepro";
      email?: string; password?: string; name?: string; phone?: string; schemeKey?: string;
    };
    if (!b.email?.trim() || !b.password?.trim() || !b.name?.trim()) {
      return NextResponse.json({ error: "Nom, email et mot de passe requis." }, { status: 400 });
    }
    // Un responsable ne peut créer QUE des téléprospecteurs, dans son propre call center.
    if (s.role === "responsable" && b.type !== "telepro") {
      return NextResponse.json({ error: "Un responsable ne peut ajouter que des téléprospecteurs." }, { status: 403 });
    }
    const sch = schemeByKey(b.schemeKey);
    const isCommercial = b.type === "commercial";
    const callCenterId = s.role === "admin" ? 1 : s.callCenterId;
    const user = await createUser({
      email: b.email, password: b.password, name: b.name, role: "collab",
      callCenterId, commissionBase: sch.base, commissionPct: sch.pct, phone: b.phone,
      isCommercial, isTeleprospector: !isCommercial,
    });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur.";
    return NextResponse.json({ error: /duplicate|unique/i.test(msg) ? "Cet email existe déjà." : msg }, { status: 500 });
  }
}

/** PATCH -> flags/infos d'un compte. Responsable : uniquement les comptes de son call center. */
export async function PATCH(req: Request) {
  const s = requireManager(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const b = (await req.json()) as { id?: number; isCommercial?: boolean; isTeleprospector?: boolean; active?: boolean; phone?: string; schemeKey?: string };
    if (!b.id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
    if (s.role === "responsable" && !(await sameCallCenter(b.id, s.callCenterId))) {
      return NextResponse.json({ error: "Compte hors de votre call center." }, { status: 403 });
    }
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

/** DELETE ?id= -> supprime un compte (pas un admin). Responsable : uniquement son call center. */
export async function DELETE(req: Request) {
  const s = requireManager(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
  try {
    if (s.role === "responsable" && !(await sameCallCenter(id, s.callCenterId))) {
      return NextResponse.json({ error: "Compte hors de votre call center." }, { status: 403 });
    }
    await deleteUser(id, s.callCenterId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

// Un compte appartient-il au call center du responsable ? (via la liste scopée)
async function sameCallCenter(userId: number, callCenterId: number): Promise<boolean> {
  const users = await listUsers(callCenterId);
  return users.some((u) => u.id === userId && u.role === "collab");
}
