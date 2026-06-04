import Anthropic from "@anthropic-ai/sdk";

const client = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquant.");
  return new Anthropic({ apiKey: key });
};

export type CarInput = {
  brand: string;
  model: string;
  fuel: string;
  finish: string;
  year: number;
  km: number;
  gearbox: string; // Manuelle / Automatique
  owners: number;
  history: string; // libre
  ct: string; // contrôle technique
  color: string;
  condition: string;
};

export type Report = {
  score: number; // 0-100
  potential: "Excellent" | "Bon" | "Moyen" | "Faible";
  demand: "Très forte" | "Forte" | "Moyenne" | "Faible";
  knownIssues: string[];
  pros: string[];
  cons: string[];
  sellTime: "moins de 7 jours" | "7 à 15 jours" | "15 à 30 jours" | "plus de 30 jours";
  priceRange: { low: number; mid: number; high: number; comment: string };
  advice: "✅ Achat recommandé" | "⚠️ Achat à négocier" | "❌ Véhicule à éviter";
  risk: number; // /10
  margin: number; // /10
  resaleEase: number; // /10
  conclusion: string;
};

const SYSTEM = `Tu es SimpliciBot, expert automobile marché occasion français. Tu analyses des véhicules pour aider un acheteur/revendeur professionnel à décider d'une reprise.

Tu connais : cotes Argus, défauts moteur/boîte/turbo/AdBlue/chaîne distribution, demande du marché, prix médians LBC/LaCentrale, durée moyenne de vente par segment.

Réponds STRICTEMENT en JSON valide selon le schéma demandé. Pas de markdown, pas de texte hors JSON.`;

const SCHEMA = `{
  "score": number (0-100),
  "potential": "Excellent" | "Bon" | "Moyen" | "Faible",
  "demand": "Très forte" | "Forte" | "Moyenne" | "Faible",
  "knownIssues": string[] (3-6 défauts connus de CE modèle/motorisation/année),
  "pros": string[] (3-5 points forts commerciaux),
  "cons": string[] (3-5 freins à la vente),
  "sellTime": "moins de 7 jours" | "7 à 15 jours" | "15 à 30 jours" | "plus de 30 jours",
  "priceRange": { "low": number, "mid": number, "high": number, "comment": string },
  "advice": "✅ Achat recommandé" | "⚠️ Achat à négocier" | "❌ Véhicule à éviter",
  "risk": number (0-10, 10=très risqué),
  "margin": number (0-10, 10=marge max),
  "resaleEase": number (0-10, 10=très facile à revendre),
  "conclusion": string (2-3 phrases verdict final)
}`;

export async function analyzeCar(c: CarInput): Promise<Report> {
  const a = client();
  const msg = await a.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Analyse cette voiture pour reprise/revente :

Marque : ${c.brand}
Modèle : ${c.model}
Motorisation : ${c.fuel}
Finition : ${c.finish}
Année : ${c.year}
Kilométrage : ${c.km} km
Boîte : ${c.gearbox}
Propriétaires : ${c.owners}
Historique : ${c.history || "non précisé"}
Contrôle technique : ${c.ct || "non précisé"}
Couleur : ${c.color || "non précisée"}
État général : ${c.condition || "non précisé"}

Renvoie UNIQUEMENT ce JSON (prix en EUR) :
${SCHEMA}`,
      },
    ],
  });

  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Réponse Claude non-JSON.");
  return JSON.parse(m[0]) as Report;
}
