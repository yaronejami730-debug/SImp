import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getConnectionStatus, deleteConnection } from "@/lib/google-connections";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET -> statut de connexion Google du commercial courant. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const conn = await getConnectionStatus(s.email);
  return NextResponse.json({ ok: true, connection: conn });
}

/** DELETE -> déconnecte l'agenda Google du commercial courant. */
export async function DELETE(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  await deleteConnection(s.email);
  return NextResponse.json({ ok: true });
}
