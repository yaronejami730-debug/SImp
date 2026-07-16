import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import crypto from "crypto";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

export const maxDuration = 60;

/** POST: send account recovery email */
export async function POST(req: Request) {
  try {
    const { email, recoveryType } = await req.json();

    if (!email || !["username", "password", "both"].includes(recoveryType)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const pool = getPool();

    // Find user by email
    const res = await pool.query("SELECT id, email, name FROM users WHERE email = $1", [email.toLowerCase()]);

    if (res.rows.length === 0) {
      // Don't reveal if account exists
      return NextResponse.json({
        ok: true,
        message: "Si un compte existe, un email a été envoyé.",
      });
    }

    const user = res.rows[0];
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store reset token in DB
    await pool.query(
      "UPDATE users SET password_reset_token = $1, password_reset_expiry = $2 WHERE id = $3",
      [resetTokenHash, tokenExpiry, user.id]
    );

    // Build email content
    const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
    const username = user.email.split("@")[0]; // Extract username part

    let emailContent = "";
    if (recoveryType === "username") {
      emailContent = `
        <p>Votre identifiant est : <strong>${username}</strong></p>
        <p>Vous pouvez maintenant vous connecter avec cet identifiant.</p>
      `;
    } else if (recoveryType === "password") {
      emailContent = `
        <p><a href="${resetUrl}" style="background-color: var(--brand-primary); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
          Réinitialiser le mot de passe
        </a></p>
        <p>Ou copiez ce lien :<br/>${resetUrl}</p>
        <p>Ce lien expire dans 24 heures.</p>
      `;
    } else {
      emailContent = `
        <p>Votre identifiant est : <strong>${username}</strong></p>
        <p><a href="${resetUrl}" style="background-color: var(--brand-primary); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
          Réinitialiser le mot de passe
        </a></p>
        <p>Ou copiez ce lien :<br/>${resetUrl}</p>
        <p>Ce lien expire dans 24 heures.</p>
      `;
    }

    // Send via Brevo
    if (BREVO_API_KEY) {
      const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to: [{ email: user.email, name: user.name }],
          subject: "Récupération de votre compte",
          htmlContent: `
            <!DOCTYPE html>
            <html>
              <body style="font-family: Arial, sans-serif; color: #333;">
                <h2>Récupération de votre compte</h2>
                ${emailContent}
                <p>Si vous n'avez pas demandé cela, ignorez cet email.</p>
              </body>
            </html>
          `,
        }),
      });

      if (!emailRes.ok) {
        console.error("[Account Recovery] Brevo error:", await emailRes.text());
        return NextResponse.json(
          { error: "Erreur lors de l'envoi de l'email" },
          { status: 500 }
        );
      }
    }

    console.log("[Account Recovery] Email sent to", user.email, "type:", recoveryType);

    return NextResponse.json({
      ok: true,
      message: "Email sent",
    });
  } catch (e) {
    console.error("[Account Recovery] Error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
