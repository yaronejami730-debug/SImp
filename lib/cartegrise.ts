/** OCR carte grise via Claude vision (Anthropic).
 *  Env requise : ANTHROPIC_API_KEY (déjà en place).
 *  Pas de nouveau compte / abo.
 */
import Anthropic from "@anthropic-ai/sdk";

export type CarteGriseExtract = {
  plate?: string;
  vin?: string;
  brand?: string;
  commercialModel?: string;
  fuel?: string;
  year?: number;
  firstRegistrationDate?: string;
  power?: number;
  co2?: number;
  ownerName?: string;
  raw: unknown;
};

const client = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquant.");
  return new Anthropic({ apiKey: key });
};

const SYSTEM = `Tu lis des cartes grises françaises (certificat d'immatriculation).
Tu extrais STRICTEMENT en JSON les champs visibles.
Aucune supposition : si un champ n'est pas lisible, omets-le ou null.
Réponds UNIQUEMENT le JSON, sans markdown ni commentaire.`;

const SCHEMA = `{
  "plate": string | null,                    // A : N° immatriculation (ex: AB-123-CD)
  "vin": string | null,                       // E : VIN / numéro de série
  "brand": string | null,                     // D.1 : Marque (ex: RENAULT)
  "commercialModel": string | null,           // D.3 : Dénomination commerciale (ex: Clio IV)
  "fuel": string | null,                      // P.3 : Carburant code (GO=Diesel, ES=Essence, EL=Électrique, EH=Hybride, etc.)
  "firstRegistrationDate": string | null,     // B : Date 1re mise en circulation (YYYY-MM-DD ou DD/MM/YYYY)
  "power": number | null,                     // P.6 : Puissance fiscale (CV)
  "co2": number | null,                       // V.7 : émissions CO2 (g/km)
  "ownerName": string | null                  // C.1.1 : Nom + prénom du titulaire
}`;

export async function readCarteGrise(file: { name: string; type: string; buffer: Buffer }): Promise<CarteGriseExtract> {
  const a = client();
  const mediaType = file.type === "application/pdf" ? "application/pdf" : (file.type || "image/jpeg");
  const data = file.buffer.toString("base64");

  const msg = await a.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data },
          },
          { type: "text", text: `Extrais les champs de cette carte grise française.\n\nRenvoie UNIQUEMENT ce JSON :\n${SCHEMA}` },
        ],
      },
    ],
  });

  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Réponse Claude non-JSON.");
  const j = JSON.parse(m[0]);

  // Année depuis firstRegistrationDate
  let year: number | undefined;
  const raw = j.firstRegistrationDate;
  if (raw) {
    const yMatch = String(raw).match(/\b(19|20)\d{2}\b/);
    if (yMatch) year = Number(yMatch[0]);
  }

  return {
    plate: j.plate ?? undefined,
    vin: j.vin ?? undefined,
    brand: j.brand ?? undefined,
    commercialModel: j.commercialModel ?? undefined,
    fuel: j.fuel ?? undefined,
    year,
    firstRegistrationDate: raw ?? undefined,
    power: j.power ?? undefined,
    co2: j.co2 ?? undefined,
    ownerName: j.ownerName ?? undefined,
    raw: j,
  };
}
