import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listNotifications, unreadCount, markRead, archiveNotification, deleteNotification } from "@/lib/notifications";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET -> notifications de l'utilisateur courant + compteur non-lues. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const [notifications, unread] = await Promise.all([listNotifications(s.email), unreadCount(s.email)]);
  return NextResponse.json({ ok: true, notifications, unread });
}

/** POST { action: "read"|"readAll"|"archive", id? } */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const b = (await req.json()) as { action?: string; id?: number };
  if (b.action === "readAll") await markRead(s.email);
  else if (b.action === "read" && b.id) await markRead(s.email, b.id);
  else if (b.action === "archive" && b.id) await archiveNotification(s.email, b.id);
  else return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** DELETE ?id= */
export async function DELETE(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id manquant." }, { status: 400 });
  await deleteNotification(s.email, id);
  return NextResponse.json({ ok: true });
}
