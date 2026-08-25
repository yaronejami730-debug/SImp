import { NextResponse } from "next/server";
import { getDdeAuth } from "@/lib/dde";
import {
  listDdeProspects, createDdeProspect, updateDdeProspect, deleteDdeProspect,
} from "@/lib/dde-prospects-db";
import { formatMobileFR } from "@/lib/telephone-fr";

export const dynamic = "force-dynamic";

/** GET -> fichier d'appel (admin : tout ; téléprospectrice : ses prospects). */
export async function GET(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, prospects: await listDdeProspects(s) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> ajoute un prospect à la main (le gros du fichier arrive par import). */
export async function POST(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as {
      nom?: string; prenom?: string; telephone?: string; email?: string;
      codePostal?: string; ville?: string; notes?: string; teleproEmail?: string;
    };
    if (!b.nom?.trim() || !b.telephone?.trim()) {
      return NextResponse.json({ error: "Nom et téléphone sont obligatoires." }, { status: 400 });
    }
    const telephone = formatMobileFR(b.telephone);
    if (!telephone) {
      return NextResponse.json({ error: "Numéro de mobile invalide : 10 chiffres commençant par 06 ou 07." }, { status: 400 });
    }
    const prospect = await createDdeProspect(s, {
      nom: b.nom, prenom: b.prenom, telephone, email: b.email,
      code_postal: b.codePostal, ville: b.ville, notes: b.notes, teleproEmail: b.teleproEmail,
    });
    return NextResponse.json({ ok: true, prospect });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** PATCH -> statut d'appel, commentaire, appel passé, correction des coordonnées. */
export async function PATCH(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as {
      id?: number; statut?: string; notes?: string; appel?: boolean;
      nom?: string; prenom?: string; telephone?: string; email?: string; teleproEmail?: string;
    };
    if (!b.id) return NextResponse.json({ error: "id requis." }, { status: 400 });

    let telephone: string | undefined;
    if (b.telephone !== undefined) {
      const tel = formatMobileFR(b.telephone);
      if (!tel) return NextResponse.json({ error: "Numéro de mobile invalide : 10 chiffres commençant par 06 ou 07." }, { status: 400 });
      telephone = tel;
    }
    await updateDdeProspect(s, Number(b.id), {
      statut: b.statut, notes: b.notes, appel: b.appel,
      nom: b.nom, prenom: b.prenom, telephone, email: b.email, teleproEmail: b.teleproEmail,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur.";
    return NextResponse.json({ error: msg }, { status: msg === "Accès refusé." ? 403 : 400 });
  }
}

/** DELETE ?id= -> retire un prospect du fichier. Réservé à l'admin. */
export async function DELETE(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? 0);
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    await deleteDdeProspect(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
