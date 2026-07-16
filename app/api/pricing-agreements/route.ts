import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";

export const maxDuration = 60;

/** GET: list pricing agreements */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const pool = getPool();
    const url = new URL(req.url);
    const callCenterId = url.searchParams.get("callCenterId");
    const status = url.searchParams.get("status"); // pending_confirmation, active

    let query = `
      SELECT
        pa.*,
        u.name as commercial_name,
        u.email as commercial_email,
        cc.name as call_center_name
      FROM pricing_agreements pa
      JOIN users u ON pa.commercial_id = u.id
      JOIN call_centers cc ON pa.call_center_id = cc.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // If commercial, show only their agreements (lookup by email)
    if (s.role === "collab" && s.isCommercial) {
      query += ` AND u.email = $${params.length + 1}`;
      params.push(s.email.toLowerCase());
    } else if (callCenterId) {
      // Gestionnaire/Admin can filter by call center
      query += ` AND pa.call_center_id = $${params.length + 1}`;
      params.push(parseInt(callCenterId));
    } else if (s.role === "responsable") {
      // Responsable sees only their call center
      query += ` AND pa.call_center_id = $${params.length + 1}`;
      params.push(s.callCenterId);
    }

    if (status) {
      query += ` AND pa.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY pa.created_at DESC`;

    const res = await pool.query(query, params);
    return NextResponse.json({ ok: true, agreements: res.rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/** POST: create new pricing agreement */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { callCenterId, commercialId, baseAmount, gestionnaireAmount, callCenterAmount } = body;

    if (!callCenterId || !commercialId || !baseAmount || gestionnaireAmount === undefined || callCenterAmount === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const pool = getPool();

    // Autorisé : super-admin OU le GESTIONNAIRE de CE call center (rôle relationnel, pas un rôle de compte).
    const ccRow = await pool.query("SELECT gestionnaire_email FROM call_centers WHERE id = $1", [callCenterId]);
    const gest = (ccRow.rows[0]?.gestionnaire_email ?? "").toLowerCase();
    if (s.role !== "admin" && gest !== s.email.toLowerCase()) {
      return NextResponse.json({ error: "Réservé au gestionnaire de ce call center (ou admin)." }, { status: 403 });
    }

    // Le commercial doit être rattaché au call center : compte dedans OU lié via call_center_commercials (héritage agence inclus).
    const commRes = await pool.query("SELECT id, email, name FROM users WHERE id = $1 AND is_commercial = true", [commercialId]);
    if (commRes.rows.length === 0) {
      return NextResponse.json({ error: "Commercial introuvable." }, { status: 404 });
    }
    const commercialEmail = (commRes.rows[0].email ?? "").toLowerCase();
    const { commercialsForCallCenterInherited } = await import("@/lib/callcenters");
    const linked = await commercialsForCallCenterInherited(Number(callCenterId));
    const sameCc = await pool.query("SELECT 1 FROM users WHERE id = $1 AND call_center_id = $2", [commercialId, callCenterId]);
    if (!sameCc.rows.length && !linked.some((c) => c.email.toLowerCase() === commercialEmail)) {
      return NextResponse.json({ error: "Ce commercial n'est pas lié à ce call center." }, { status: 400 });
    }

    // Lookup creator by email
    const creatorRes = await pool.query("SELECT id FROM users WHERE email = $1", [s.email.toLowerCase()]);
    const creatorId = creatorRes.rows[0]?.id || null;

    // Create agreement
    const res = await pool.query(
      `INSERT INTO pricing_agreements (call_center_id, commercial_id, base_amount, gestionnaire_amount, call_center_amount, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [callCenterId, commercialId, baseAmount, gestionnaireAmount, callCenterAmount, creatorId]
    );

    return NextResponse.json({ ok: true, agreement: res.rows[0] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/** PUT: confirm/reject agreement (commercial action) */
export async function PUT(req: Request) {
  const s = getAuth(req);
  if (!s || (s.role === "collab" && !s.isCommercial)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { agreementId, action } = body; // action: confirm, reject

    if (!agreementId || !["confirm", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const pool = getPool();

    // Verify ownership (lookup commercial by email)
    const commRes = await pool.query("SELECT id FROM users WHERE email = $1", [s.email.toLowerCase()]);
    if (commRes.rows.length === 0) {
      return NextResponse.json({ error: "Commercial not found" }, { status: 404 });
    }
    const commercialId = commRes.rows[0].id;

    const agreeRes = await pool.query(
      "SELECT * FROM pricing_agreements WHERE id = $1 AND commercial_id = $2",
      [agreementId, commercialId]
    );

    if (agreeRes.rows.length === 0) {
      return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
    }

    const agreement = agreeRes.rows[0];
    if (agreement.status !== "pending_confirmation") {
      return NextResponse.json({ error: "Agreement already processed" }, { status: 400 });
    }

    // Update agreement
    const newStatus = action === "confirm" ? "active" : "rejected";
    const res = await pool.query(
      `UPDATE pricing_agreements
       SET status = $1, confirmed_by_commercial = $2, ${action === "confirm" ? "confirmed_at" : "rejected_at"} = now(), updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [newStatus, action === "confirm", agreementId]
    );

    return NextResponse.json({ ok: true, agreement: res.rows[0] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
