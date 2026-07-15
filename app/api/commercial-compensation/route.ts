import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";

export const maxDuration = 60;

export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s || s.role === "collab") return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  try {
    const url = new URL(req.url);
    const callCenterId = Number(url.searchParams.get("callCenterId")) || s.callCenterId;

    // Vérifier accès : admin voit tout, responsable/gestionnaire ne voient que leur CC
    if (s.role !== "admin" && callCenterId !== s.callCenterId) {
      return NextResponse.json({ error: "Accès refusé à ce call center" }, { status: 403 });
    }

    const res = await getPool().query(
      `SELECT id, commercial_email, commercial_name, commission_base, commission_pct, call_center_share_pct, total_signed_rdv, total_owed, total_paid, created_at
       FROM commercial_compensation WHERE call_center_id = $1 ORDER BY commercial_name`,
      [callCenterId]
    );

    return NextResponse.json({ ok: true, compensations: res.rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || s.role === "collab") return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  try {
    const body = await req.json();
    const { callCenterId, commercialEmail, commercialName, commissionBase, commissionPct, callCenterSharePct } = body;

    if (!commercialEmail?.trim() || !commercialName?.trim()) {
      return NextResponse.json({ error: "Email et nom requis" }, { status: 400 });
    }

    if (s.role !== "admin" && callCenterId !== s.callCenterId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const res = await getPool().query(
      `INSERT INTO commercial_compensation (call_center_id, commercial_email, commercial_name, commission_base, commission_pct, call_center_share_pct)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (call_center_id, commercial_email) DO UPDATE SET
         commercial_name = $3, commission_base = $4, commission_pct = $5, call_center_share_pct = $6, updated_at = now()
       RETURNING *`,
      [callCenterId, commercialEmail.toLowerCase(), commercialName, commissionBase ?? 50, commissionPct ?? 10, callCenterSharePct ?? 50]
    );

    return NextResponse.json({ ok: true, compensation: res.rows[0] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const s = getAuth(req);
  if (!s || s.role === "collab") return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

  try {
    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "ID manquant" }, { status: 400 });

    const res = await getPool().query("DELETE FROM commercial_compensation WHERE id = $1 RETURNING call_center_id", [id]);
    if (res.rows.length === 0) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

    const ccId = res.rows[0].call_center_id;
    if (s.role !== "admin" && ccId !== s.callCenterId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
