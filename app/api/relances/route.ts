import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { listRelances } from "@/lib/messages";

export const dynamic = "force-dynamic";

/** GET -> récap des mails de relance envoyés (followups + no-show), groupés par client. */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const rows = await listRelances(s.role === "admin" ? undefined : s.email);
    const groups = rows.map((r) => ({
      clientName: r.client_name || "—",
      email: r.to_email,
      phone: r.to_phone,
      count: r.count,
      lastSent: r.last_sent,
      types: r.types,
    }));
    const totalMails = groups.reduce((a, g) => a + g.count, 0);
    return NextResponse.json({ ok: true, groups, totalClients: groups.length, totalMails });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
