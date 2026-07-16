import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import crypto from "crypto";
import { hashPassword } from "@/lib/auth";

export const maxDuration = 60;

/** POST: reset password with token */
export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Token et mot de passe requis" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères" },
        { status: 400 }
      );
    }

    const pool = getPool();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with valid token
    const res = await pool.query(
      "SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expiry > now()",
      [tokenHash]
    );

    if (res.rows.length === 0) {
      return NextResponse.json(
        { error: "Lien invalide ou expiré" },
        { status: 400 }
      );
    }

    const userId = res.rows[0].id;

    // Hash new password
    const hashedPassword = hashPassword(password);

    // Update password and clear reset token
    await pool.query(
      `UPDATE users
       SET password_hash = $1, password_reset_token = NULL, password_reset_expiry = NULL, updated_at = now()
       WHERE id = $2`,
      [hashedPassword, userId]
    );

    console.log("[Reset Password] Password reset for user", userId);

    return NextResponse.json({
      ok: true,
      message: "Password reset successful",
    });
  } catch (e) {
    console.error("[Reset Password] Error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
