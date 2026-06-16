import Anthropic from "@anthropic-ai/sdk";
import { listAppointments, type AppointmentItem } from "./google";
import { listMessagesForClient } from "./messages";

const client = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquant.");
  return new Anthropic({ apiKey: key });
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const SIGN_FR: Record<string, string> = {
  signed: "A SIGNÉ une commande",
  thinking: "réfléchit",
  unsigned: "n'a PAS signé",
  "": "statut signature non renseigné",
};

const fmtFR = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "date inconnue";

const SYSTEM = `Tu es l'assistant interne de SIMPLICICAR, agence de vente de véhicules d'occasion à Paris 17.
Tu réponds aux commerciaux qui ont un doute et veulent des PREUVES sur un rendez-vous, un client ou un véhicule.

Règles STRICTES :
- Réponds UNIQUEMENT à partir des données fournies (RENDEZ-VOUS ci-dessous). N'invente jamais.
- Si aucune donnée ne correspond, dis-le clairement et propose de préciser (nom, véhicule, date).
- Réponds en français, ton pro et direct, en allant à l'essentiel.
- Donne TOUJOURS les preuves disponibles : date du RDV, véhicule, commercial, statut (présent/absent, signé/réfléchit/pas signé, annulé), et la liste des mails/SMS envoyés (avec date, statut de livraison, objet/contenu).
- Cite le lien de la fiche client (ficheUrl) pour que le commercial vérifie lui-même : mails, SMS et leurs accusés de réception y sont consultables.
- Précise la provenance : données issues de la base de données et des prestataires (Brevo = système de mailing, AllMySMS = distributeur SMS).
- Si plusieurs RDV correspondent, liste-les brièvement.`;

type ApptProof = {
  client: string;
  telephone: string;
  email: string;
  dateRdv: string;
  vehicule: string;
  plateforme: string;
  commercial: string;
  present: boolean;
  statutSignature: string;
  annule: boolean;
  ficheUrl: string;
  messagesEnvoyes: { canal: string; type: string; objetOuTexte: string; envoyeLe: string; statut: string; idPrestataire: string }[];
};

function summarize(a: AppointmentItem, baseUrl: string): Omit<ApptProof, "messagesEnvoyes"> {
  return {
    client: `${a.firstName} ${a.lastName}`.trim(),
    telephone: a.phone,
    email: a.email,
    dateRdv: fmtFR(a.startDateTime),
    vehicule: [a.carBrand, a.carModel, a.carFinish].filter(Boolean).join(" ") || "non précisé",
    plateforme: a.platform,
    commercial: a.commercial || a.owner,
    present: a.present,
    statutSignature: SIGN_FR[a.signStatus] ?? a.signStatus,
    annule: a.cancelled,
    ficheUrl: `${baseUrl}/client/${a.id}`,
  };
}

/** Recherche les RDV pertinents pour la question + leurs preuves (mails/SMS), puis demande à Claude une réponse sourcée. */
export async function answerAssistant(question: string, baseUrl: string): Promise<string> {
  const now = Date.now();
  const appts = await listAppointments(new Date(now - 365 * 24 * 3600 * 1000), new Date(now + 60 * 24 * 3600 * 1000));

  const qn = norm(question);
  const tokens = Array.from(new Set(qn.split(/[^a-z0-9]+/).filter((t) => t.length >= 3)));
  const scored = appts.map((a) => {
    const hay = norm([a.firstName, a.lastName, a.email, a.phone, a.carBrand, a.carModel, a.carFinish, a.platform, a.commercial, fmtFR(a.startDateTime)].join(" "));
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score++;
    return { a, score };
  });

  let matched = scored.filter((x) => x.score > 0).sort((x, y) => y.score - x.score).map((x) => x.a);
  if (matched.length === 0) {
    // Pas de match direct : on donne les RDV les plus récents comme contexte.
    matched = appts.filter((a) => a.startDateTime).sort((a, b) => new Date(b.startDateTime!).getTime() - new Date(a.startDateTime!).getTime()).slice(0, 20);
  }
  matched = matched.slice(0, 12);

  const proofs: ApptProof[] = [];
  for (const a of matched) {
    let msgs: Awaited<ReturnType<typeof listMessagesForClient>> = [];
    try {
      msgs = await listMessagesForClient({ email: a.email, phone: a.phone, eventId: a.id });
    } catch { /* non-bloquant */ }
    proofs.push({
      ...summarize(a, baseUrl),
      messagesEnvoyes: msgs.slice(0, 30).map((m) => ({
        canal: m.channel === "sms" ? "SMS (AllMySMS)" : "Mail (Brevo)",
        type: m.template_key || "—",
        objetOuTexte: m.channel === "sms" ? m.body_text : m.subject,
        envoyeLe: fmtFR(m.sent_at),
        statut: m.status,
        idPrestataire: m.provider_message_id,
      })),
    });
  }

  const a = client();
  const msg = await a.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `QUESTION DU COMMERCIAL :
${question}

RENDEZ-VOUS PERTINENTS (données issues de la base de données + prestataires Brevo/AllMySMS) :
${JSON.stringify(proofs, null, 2)}

Réponds à la question avec les preuves ci-dessus.`,
      },
    ],
  });

  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim() || "Je n'ai pas pu générer de réponse.";
}
