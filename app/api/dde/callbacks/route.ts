import { NextResponse } from "next/server";
import { getDdeAuth } from "@/lib/dde";
import {
  listDdeRappels, createDdeRappel, updateDdeRappel, deleteDdeRappel,
  DDE_RAPPEL_STATUTS, type DdeRappelStatut,
} from "@/lib/dde-rappels";
import { formatMobileFR } from "@/lib/telephone-fr";
import { toParisISO } from "@/lib/parse";

export const dynamic = "force-dynamic";

/** GET -> rappels (admin : tous ; telepro : les siens). */
export async function GET(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, rappels: await listDdeRappels(s) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** POST -> planifie un rappel. Aucun SMS : le rappel est un outil interne. */
export async function POST(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as {
      nom?: string; prenom?: string; telephone?: string; date?: string; heure?: string;
      notes?: string; teleproEmail?: string; teleproName?: string;
    };
    if (!b.nom?.trim() || !b.telephone?.trim() || !b.date || !b.heure?.trim()) {
      return NextResponse.json({ error: "Nom, téléphone, date et heure sont obligatoires." }, { status: 400 });
    }
    const telephone = formatMobileFR(b.telephone);
    if (!telephone) {
      return NextResponse.json({ error: "Numéro de mobile invalide : 10 chiffres commençant par 06 ou 07." }, { status: 400 });
    }
    // L'heure saisie est une heure de Paris, quel que soit le fuseau du serveur.
    let callbackAt: string;
    try {
      callbackAt = toParisISO(b.date, b.heure.replace("h", ":"));
    } catch {
      return NextResponse.json({ error: "Date ou heure invalide." }, { status: 400 });
    }

    const rappel = await createDdeRappel(s, {
      nom: b.nom, prenom: b.prenom ?? "", telephone, callbackAt,
      notes: b.notes, teleproEmail: b.teleproEmail, teleproName: b.teleproName,
    });

    return NextResponse.json({ ok: true, rappel });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** PATCH -> coche « fait », annule, ou corrige un rappel. */
export async function PATCH(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const b = (await req.json()) as {
      id?: number; statut?: string; nom?: string; prenom?: string; telephone?: string;
      date?: string; heure?: string; notes?: string;
    };
    if (!b.id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    if (b.statut !== undefined && !DDE_RAPPEL_STATUTS.includes(b.statut as DdeRappelStatut)) {
      return NextResponse.json({ error: "Statut inconnu." }, { status: 400 });
    }
    let telephone: string | undefined;
    if (b.telephone !== undefined) {
      const tel = formatMobileFR(b.telephone);
      if (!tel) return NextResponse.json({ error: "Numéro de mobile invalide : 10 chiffres commençant par 06 ou 07." }, { status: 400 });
      telephone = tel;
    }
    let callbackAt: string | undefined;
    if (b.date && b.heure) {
      try {
        callbackAt = toParisISO(b.date, b.heure.replace("h", ":"));
      } catch {
        return NextResponse.json({ error: "Date ou heure invalide." }, { status: 400 });
      }
    }
    await updateDdeRappel(s, Number(b.id), {
      statut: b.statut as DdeRappelStatut | undefined,
      nom: b.nom, prenom: b.prenom, telephone, callbackAt, notes: b.notes,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}

/** DELETE ?id= -> supprime un rappel (le sien, ou n'importe lequel pour l'admin). */
export async function DELETE(req: Request) {
  const s = getDdeAuth(req);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? 0);
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });
    await deleteDdeRappel(s, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur." }, { status: 500 });
  }
}
