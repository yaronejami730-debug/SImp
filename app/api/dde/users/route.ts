import { NextResponse } from "next/server";
import { getDdeAuth, listDdeUsers, createDdeUser, updateDdeUser, deleteDdeUser } from "@/lib/dde";

export const dynamic = "force-dynamic";

/** Comptes de l'espace DDE — réservé à l'admin DDE. */
export async function GET(req: Request) {
  const s = getDdeAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, users: await listDdeUsers() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const s = getDdeAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  try {
    const b = (await req.json()) as { email?: string; password?: string; name?: string; phone?: string; role?: "admin" | "telepro" };
    if (!b.email?.trim() || !b.password || !b.name?.trim()) return NextResponse.json({ error: "Nom, e-mail et mot de passe requis." }, { status: 400 });
    if (b.password.length < 8) return NextResponse.json({ error: "Mot de passe : 8 caractères minimum." }, { status: 400 });
    const user = await createDdeUser({ email: b.email, password: b.password, name: b.name, phone: b.phone, role: b.role ?? "telepro" });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    const msg = e instanceof Error && /duplicate key/.test(e.message) ? "Cet e-mail est déjà utilisé." : e instanceof Error ? e.message : "Erreur.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const s = getDdeAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  try {
    const b = (await req.json()) as { id?: number; password?: string; active?: boolean; name?: string; phone?: string };
    if (!b.id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    if (b.password && b.password.length < 8) return NextResponse.json({ error: "Mot de passe : 8 caractères minimum." }, { status: 400 });
    await updateDdeUser(Number(b.id), { password: b.password, active: b.active, name: b.name, phone: b.phone });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const s = getDdeAuth(req);
  if (s?.role !== "admin") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? 0);
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    await deleteDdeUser(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
