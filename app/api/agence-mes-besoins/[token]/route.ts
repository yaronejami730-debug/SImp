import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Lien public (bouton dans le mail de prospection agence) : le contact répond à un
 *  questionnaire de cadrage sans se connecter. Aucun compte — le token fait office de clé,
 *  mais la SESSION qui donne accès au formulaire est verrouillée sur le premier appareil qui
 *  l'ouvre (cookie) et valable 72h — un lien copié-collé ailleurs ne donne pas accès. La
 *  personne peut se régénérer un lien depuis la page si besoin (expiré ou autre appareil). */

const SESSION_MS = 72 * 3600 * 1000;
// Nommé par token (pas un path scopé à la page) : le cookie doit être envoyé aux appels
// fetch() vers /api/agence-mes-besoins/[token], pas seulement à la page elle-même.
const cookieName = (token: string) => `yj_besoins_${token}`;

type Params = { params: Promise<{ token: string }> };
type Row = {
  name: string; needs_submitted_at: string | null;
  besoins_session_token: string | null; besoins_session_lock: string | null; besoins_session_started_at: string | null;
};

function cookieValue(req: Request, token: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${cookieName(token)}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function GET(req: Request, { params }: Params) {
  const { token } = await params;
  try {
    const pool = getPool();
    const { rows } = await pool.query<Row>(
      `select name, needs_submitted_at, besoins_session_token, besoins_session_lock, besoins_session_started_at
         from agency_prospects where token = $1 and active`, [token],
    );
    const p = rows[0];
    if (!p) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
    if (p.needs_submitted_at) return NextResponse.json({ ok: true, etat: "deja", name: p.name });

    const cookieLock = cookieValue(req, token);
    const started = p.besoins_session_started_at ? new Date(p.besoins_session_started_at).getTime() : null;
    const expiree = started != null && Date.now() - started > SESSION_MS;

    // Premier clic : pas encore de session -> on en ouvre une, verrouillée sur cet appareil.
    if (!p.besoins_session_lock || expiree) {
      if (!p.besoins_session_lock) {
        const lock = randomBytes(16).toString("hex");
        await pool.query(
          `update agency_prospects set besoins_session_lock = $2, besoins_session_started_at = now(), besoins_session_token = $3 where token = $1`,
          [token, lock, randomBytes(8).toString("hex")],
        );
        const res = NextResponse.json({ ok: true, etat: "ok", name: p.name });
        res.cookies.set(cookieName(token), lock, { httpOnly: true, sameSite: "lax", maxAge: SESSION_MS / 1000, path: "/api/agence-mes-besoins" });
        return res;
      }
      // Session expirée : il faut repasser par "Régénérer le lien" (self-service, pas automatique
      // — évite qu'une simple ouverture de mail par un scanner de sécurité relance la fenêtre).
      return NextResponse.json({ ok: true, etat: "expire", name: p.name });
    }

    // Session active : l'appareil doit présenter le bon verrou.
    if (cookieLock !== p.besoins_session_lock) {
      return NextResponse.json({ ok: true, etat: "verrouille", name: p.name });
    }
    return NextResponse.json({ ok: true, etat: "ok", name: p.name });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params;
  try {
    const b = (await req.json()) as { answers?: Record<string, string>; raw?: string; action?: "regenerer" };
    const pool = getPool();

    if (b.action === "regenerer") {
      const { rowCount } = await pool.query(`select 1 from agency_prospects where token = $1 and active`, [token]);
      if (!rowCount) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
      const lock = randomBytes(16).toString("hex");
      await pool.query(
        `update agency_prospects set besoins_session_lock = $2, besoins_session_started_at = now(), besoins_session_token = $3 where token = $1`,
        [token, lock, randomBytes(8).toString("hex")],
      );
      const res = NextResponse.json({ ok: true });
      res.cookies.set(cookieName(token), lock, { httpOnly: true, sameSite: "lax", maxAge: SESSION_MS / 1000, path: "/api/agence-mes-besoins" });
      return res;
    }

    if (!b.answers || !b.raw) return NextResponse.json({ error: "Réponses manquantes." }, { status: 400 });

    // La soumission exige une session active verrouillée sur cet appareil, comme la lecture.
    const { rows } = await pool.query<Row>(
      `select name, needs_submitted_at, besoins_session_token, besoins_session_lock, besoins_session_started_at
         from agency_prospects where token = $1 and active`, [token],
    );
    const p = rows[0];
    if (!p) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
    if (p.needs_submitted_at) return NextResponse.json({ error: "Déjà répondu." }, { status: 409 });
    const started = p.besoins_session_started_at ? new Date(p.besoins_session_started_at).getTime() : null;
    const expiree = started != null && Date.now() - started > SESSION_MS;
    if (expiree || cookieValue(req, token) !== p.besoins_session_lock) {
      return NextResponse.json({ error: "Session expirée ou autre appareil — régénère un lien." }, { status: 403 });
    }

    const { rowCount } = await pool.query(
      `update agency_prospects set needs_answers = $2, needs_raw = $3, needs_submitted_at = now()
         where token = $1 and active`,
      [token, JSON.stringify(b.answers), b.raw],
    );
    if (!rowCount) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
