import { NextResponse } from "next/server";
import { listUsers, createUser, deleteUser } from "@/lib/users";
import { createCallCenter, getCallCenter } from "@/lib/call-centers";
import { getAuth } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

function requireAdmin(req: Request) {
  const s = getAuth(req);
  return s && s.role === "admin" ? s : null;
}

/** GET -> comptes du call center courant + infos de l'entité. */
export async function GET(req: Request) {
  const s = requireAdmin(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const [users, callCenter] = await Promise.all([listUsers(s.callCenterId), getCallCenter(s.callCenterId)]);
    return NextResponse.json({ ok: true, users, callCenter });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> deux modes :
 *  - { mode:"telepro", email, password, name } : ajoute un téléprospecteur à TON call center.
 *  - { mode:"callcenter", ccName, defaultCommercial, name, email, password } : crée une NOUVELLE entité
 *    indépendante + son super-administrateur (n'a rien à voir avec ton call center). */
export async function POST(req: Request) {
  const s = requireAdmin(req);
  if (!s) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      mode?: "telepro" | "callcenter";
      email?: string; password?: string; name?: string;
      ccName?: string; defaultCommercial?: string;
    };
    if (!b.email?.trim() || !b.password?.trim() || !b.name?.trim()) {
      return NextResponse.json({ error: "Nom, email et mot de passe requis." }, { status: 400 });
    }

    if (b.mode === "callcenter") {
      if (!b.ccName?.trim()) return NextResponse.json({ error: "Nom de l'entité (call center) requis." }, { status: 400 });
      const cc = await createCallCenter(b.ccName, b.defaultCommercial ?? "");
      // L'utilisateur créé est l'admin (super-administrateur) de la NOUVELLE entité.
      const user = await createUser(b.email, b.password, b.name, "admin", cc.id);
      return NextResponse.json({ ok: true, user, callCenter: cc });
    }

    // Téléprospecteur rattaché à ton call center.
    const user = await createUser(b.email, b.password, b.name, "collab", s.callCenterId);
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur.";
    return NextResponse.json({ error: /duplicate|unique/i.test(msg) ? "Cet email existe déjà." : msg }, { status: 500 });
  }
}

/** DELETE ?id= -> supprime un téléprospecteur de ton call center (pas un admin). */
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
