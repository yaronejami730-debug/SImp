// Prospection AGENCE (B2B) — e-mails envoyés au nom de YJ SOLUTIONS, jamais Simplicicar.
// Volontairement séparé de lib/email-templates.ts (branding client Simplicicar) pour ne
// jamais mélanger les deux expéditeurs, comme demandé explicitement.
//
// Texte validé tel quel par le client (voir conversation) — ne pas reformuler son contenu,
// seulement les variables (civilité/nom, tarifs, signataire, lien besoins).

const BUSINESS = "YJ Solutions";
const LOGO_URL = "https://rz18xsip6ybhgfji.public.blob.vercel-storage.com/yj-solutions/logo.png";

const C = { navy: "#1a2740", text: "#26272b", muted: "#6b7280", line: "#e5e7eb" };
const FONT_BODY = "Georgia,'Times New Roman',serif";

export type ProspectionPrices = { citadine: number; suv: number; premium: number; lead: number };
export const DEFAULT_PROSPECTION_PRICES: ProspectionPrices = { citadine: 80, suv: 100, premium: 150, lead: 20 };
export type Signataire = { name: string; title: string; phone?: string };
export const DEFAULT_SIGNATAIRE: Signataire = { name: "Yaron Jami", title: "", phone: "" };

function shell(content: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#ffffff;font-family:${FONT_BODY};color:${C.text}">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <div style="margin-bottom:26px">
      <img src="${LOGO_URL}" alt="${BUSINESS}" width="120" style="width:120px;height:auto;display:inline-block;border:0"/>
    </div>
    ${content}
  </div>
</body></html>`;
}

const puce = (texte: string) =>
  `<tr><td style="padding:3px 12px 3px 0;font-size:15px;vertical-align:top">•</td><td style="padding:3px 0;font-size:15px;line-height:1.7">${texte}</td></tr>`;

/** Génère le mail "proposition commerciale" YJ Solutions pour un contact d'agence. */
export function agencyProposalEmail(d: { civility?: string; name: string; prices: ProspectionPrices; signataire?: Signataire; needsUrl?: string }) {
  const civility = d.civility || "Monsieur";
  const p = d.prices;
  const sig = d.signataire ?? DEFAULT_SIGNATAIRE;
  const ctaBesoins = d.needsUrl
    ? `<p style="margin:0 0 10px;font-size:14px;line-height:1.75;color:${C.muted}">
        Pour aller plus loin, si vous le souhaitez — identifions ensemble vos besoins précis (facultatif, deux minutes) :
      </p>
      <p style="margin:0 0 28px">
        <a href="${d.needsUrl}" style="display:inline-block;padding:11px 20px;border-radius:6px;background:${C.navy};color:#ffffff;text-decoration:none;font-size:13.5px;font-weight:700">
          Identifions ensemble vos besoins
        </a>
      </p>`
    : "";

  const content = `
  <p style="margin:0 0 20px;font-size:15px;line-height:1.75">Bonjour ${civility} ${d.name},</p>

  <p style="margin:0 0 16px;font-size:15px;line-height:1.75">
    Suite à notre échange, je vous fais un petit récapitulatif des différentes possibilités que nous pouvons
    mettre en place.
  </p>

  <p style="margin:0 0 16px;font-size:15px;line-height:1.75">
    Pour les leads qualifiés avec consentement, le tarif est de <strong>${p.lead} € TTC</strong> par lead. Votre
    équipe peut ensuite reprendre directement contact avec le propriétaire.
  </p>

  <p style="margin:0 0 8px;font-size:15px;line-height:1.75">
    Pour les rendez-vous, le tarif dépend principalement du type et de la valeur du véhicule :
  </p>
  <table role="presentation" style="border-collapse:collapse;margin:0 0 16px">
    ${puce(`<strong>${p.citadine} € TTC</strong> pour les citadines et petits véhicules`)}
    ${puce(`<strong>${p.suv} € TTC</strong> pour les SUV, berlines et véhicules intermédiaires`)}
    ${puce(`<strong>${p.premium} € TTC</strong> pour les véhicules haut de gamme et de plus forte valeur`)}
    ${puce(`Pour les véhicules à partir de 150 000 €, nous définissons directement le tarif ensemble.`)}
  </table>

  <p style="margin:0 0 16px;font-size:15px;line-height:1.75">
    Nous pouvons également fonctionner sur une formule où le rendez-vous est rémunéré uniquement lorsqu'il
    aboutit à la signature d'un mandat. Dans ce cas, le tarif est défini en fonction du véhicule et des critères
    recherchés.
  </p>

  <p style="margin:0 0 16px;font-size:15px;line-height:1.75">
    L'idée est vraiment de pouvoir adapter les conditions en fonction de vos besoins, du volume et des véhicules
    que vous souhaitez rentrer. Les tarifs ne sont donc pas figés.
  </p>

  <p style="margin:0 0 16px;font-size:15px;line-height:1.75">
    Pour commencer, je peux également vous proposer des conditions intéressantes sur les premiers dossiers afin
    que vous puissiez voir concrètement la qualité des rendez-vous.
  </p>

  <p style="margin:0 0 28px;font-size:15px;line-height:1.75">
    Je reste disponible pour en discuter et voir ce qui serait le plus intéressant pour vous.
  </p>

  ${ctaBesoins}

  <p style="margin:0;font-size:15px;line-height:1.6">Bien cordialement,</p>
  <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:${C.navy}">${sig.name}</p>
  <p style="margin:0;font-size:13.5px;color:${C.muted}">${sig.title ? `${sig.title} — ` : ""}${BUSINESS}${sig.phone ? ` · ${sig.phone}` : ""}</p>`;

  return { subject: `Proposition commerciale — ${BUSINESS}`, html: shell(content) };
}

/** Envoie le mail via Brevo, TOUJOURS au nom de YJ Solutions — jamais l'expéditeur Simplicicar
 *  (voir lib/brevo.ts, utilisé pour les e-mails clients RDV). Séparation volontaire. */
export async function sendAgencyProposalEmail(opts: { to: string; toName?: string; civility?: string; name: string; prices: ProspectionPrices; signataire?: Signataire; needsUrl?: string }) {
  const mail = agencyProposalEmail({ civility: opts.civility, name: opts.name, prices: opts.prices, signataire: opts.signataire, needsUrl: opts.needsUrl });
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY ?? "",
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: (opts.signataire?.name ? `${opts.signataire.name} — ` : "") + BUSINESS, email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: opts.to, name: opts.toName }],
      subject: mail.subject,
      htmlContent: mail.html,
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { messageId?: string };
  return { messageId: json.messageId, subject: mail.subject, html: mail.html };
}
