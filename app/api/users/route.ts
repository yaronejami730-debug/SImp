import { NextResponse } from "next/server";
import { listUsers, createUser, deleteUser } from "@/lib/users";
import { getAuth } from "@/lib/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

function requireAdmin(req: Request) {
  const s = getAuth(req);
  return s && s.role === "admin" ? s : null;
}

/** GET -> liste des comptes (admin). */
export async function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, users: await listUsers() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST { email, password, name } -> crée un collaborateur (admin). */
export async function POST(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  try {
    const { email, password, name } = (await req.json()) as { email?: string; password?: string; name?: string };
    if (!email?.trim() || !password?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "Nom, email et mot de passe requis." }, { status: 400 });
    }
    const user = await createUser(email, password, name, "collab");
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur.";
    return NextResponse.json({ error: /duplicate|unique/i.test(msg) ? "Cet email existe déjà." : msg }, { status: 500 });
  }
}

/** DELETE ?id= -> supprime un collaborateur (admin, pas un admin). */
export async function DELETE(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Réservé admin." }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
  try {
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
