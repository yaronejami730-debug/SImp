import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";

export const maxDuration = 60;

/** GET: list invoices (commercial sees only own, admin/responsable see their scope) */
export async function GET(req: Request) {
  const s = getAuth(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // pending | paid | cancelled

    let query = `SELECT * FROM invoices WHERE 1=1`;
    const params: any[] = [];

    if (s.role === "collab" && s.isCommercial) {
      // Commercial sees only own invoices
      query += ` AND commercial_email = $${params.length + 1}`;
      params.push(s.email.toLowerCase());
    } else if (s.role === "responsable") {
      // Responsable sees invoices from their CC only
      query += ` AND call_center_id = $${params.length + 1}`;
      params.push(s.callCenterId);
    } else if (s.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY appointment_date DESC`;

    const res = await getPool().query(query, params);
    return NextResponse.json({ ok: true, invoices: res.rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/** POST: create invoice (called by cron after RDV signed) */
export async function POST(req: Request) {
  const s = getAuth(req);
  if (!s || s.role === "collab") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { callCenterId, commercialEmail, appointmentId, clientName, vehicle, amount, appointmentDate, signedDate } = body;

    if (!commercialEmail?.trim() || !appointmentId?.trim() || amount <= 0) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Check if invoice already exists for this appointment
    const existing = await getPool().query(
      "SELECT id FROM invoices WHERE appointment_id = $1",
      [appointmentId]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ ok: true, invoice: existing.rows[0], duplicate: true });
    }

    const res = await getPool().query(
      `INSERT INTO invoices (call_center_id, commercial_email, appointment_id, client_name, vehicle, amount, appointment_date, signed_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [callCenterId, commercialEmail.toLowerCase(), appointmentId, clientName || "", vehicle || "", amount, appointmentDate, signedDate]
    );

    return NextResponse.json({ ok: true, invoice: res.rows[0] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
