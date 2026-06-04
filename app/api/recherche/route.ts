import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { analyzeCar, type CarInput } from "@/lib/simplicibot";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!getAuth(req)) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    const body = (await req.json()) as Partial<CarInput>;
    const required: (keyof CarInput)[] = ["brand", "model", "fuel", "year", "km"];
    const missing = required.filter((k) => !body[k] && body[k] !== 0);
    if (missing.length) {
      return NextResponse.json({ error: `Champs manquants : ${missing.join(", ")}` }, { status: 400 });
    }
    const input: CarInput = {
      brand: String(body.brand),
      model: String(body.model),
      fuel: String(body.fuel ?? ""),
      finish: String(body.finish ?? ""),
      year: Number(body.year),
      km: Number(body.km),
      gearbox: String(body.gearbox ?? ""),
      owners: Number(body.owners ?? 1),
      history: String(body.history ?? ""),
      ct: String(body.ct ?? ""),
      color: String(body.color ?? ""),
      condition: String(body.condition ?? ""),
    };
    const report = await analyzeCar(input);
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
