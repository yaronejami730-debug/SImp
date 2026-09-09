// Prospection AGENCE (B2B) — e-mails envoyés au nom de YJ SOLUTIONS, jamais Simplicicar.
// Volontairement séparé de lib/email-templates.ts (branding client Simplicicar) pour ne
// jamais mélanger les deux expéditeurs, comme demandé explicitement.
//
// Ton volontairement sobre : une lettre personnelle qu'on croirait écrite à la main par le
// signataire, pas un template marketing de masse — pas de cartes/badges/pictogrammes, une
// mise en page simple, du vocabulaire professionnel mais naturel.

const BUSINESS = "YJ Solutions";
const LOGO_URL = "https://rz18xsip6ybhgfji.public.blob.vercel-storage.com/yj-solutions/logo.png";

const C = { navy: "#1a2740", text: "#26272b", muted: "#6b7280", line: "#e5e7eb" };
const FONT_BODY = "Georgia,'Times New Roman',serif";

export type ProspectionPrices = { citadine: number; suv: number; premium: number; lead: number };
export const DEFAULT_PROSPECTION_PRICES: ProspectionPrices = { citadine: 80, suv: 100, premium: 150, lead: 20 };
export type Signataire = { name: string; title: string; phone?: string };
export const DEFAULT_SIGNATAIRE: Signataire = { name: "Yaron", title: "Fondateur", phone: "" };

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

/** Génère le mail "proposition commerciale" YJ Solutions pour un contact d'agence. */
export function agencyProposalEmail(d: { civility?: string; name: string; prices: ProspectionPrices; signataire?: Signataire; needsUrl?: string }) {
  const civility = d.civility || "Monsieur";
  const p = d.prices;
  const sig = d.signataire ?? DEFAULT_SIGNATAIRE;
  const psNeeds = d.needsUrl
    ? `<div style="margin:0 0 28px">
        <p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:${C.muted}">
          P.-S. — Pour que je puisse affiner cette proposition à votre situation, trois minutes suffisent :
        </p>
        <a href="${d.needsUrl}" style="display:inline-block;padding:11px 20px;border-radius:6px;background:${C.navy};color:#ffffff;text-decoration:none;font-size:13.5px;font-weight:700">
          Identifier les besoins de mon agence
        </a>
        <p style="margin:10px 0 0;font-size:12px;color:${C.muted};line-height:1.6">
          Lien personnel et confidentiel, à usage unique — valable 72h après ouverture.
        </p>
      </div>`
    : "";
  const content = `
  <p style="margin:0 0 20px;font-size:15px;line-height:1.75">${civility} ${d.name},</p>

  <p style="margin:0 0 16px;font-size:15px;line-height:1.75">
    Je me permets de revenir vers vous suite à notre échange téléphonique — je vous remercie du temps que vous
    m'avez accordé.
  </p>

  <p style="margin:0 0 16px;font-size:15px;line-height:1.75">
    Comme convenu, je vous détaille ci-dessous notre proposition.
  </p>

  <p style="margin:0 0 16px;font-size:15px;line-height:1.75">
    Le marché de l'occasion connaît une croissance soutenue, dans un contexte où le démarchage téléphonique à
    froid est désormais encadré par la loi et suppose le consentement préalable du prospect. C'est la raison
    pour laquelle nous travaillons exclusivement à partir de campagnes de leads consentis, conformes au RGPD.
  </p>

  <p style="margin:0 0 6px;font-size:15px;line-height:1.75">
    Nous proposons deux formules, que vous pouvez combiner selon vos besoins.
  </p>

  <p style="margin:22px 0 8px;font-size:15px;line-height:1.75"><strong>Le rendez-vous signé</strong></p>
  <p style="margin:0 0 10px;font-size:15px;line-height:1.75">
    Nous alimentons le planning de vos commerciaux avec des clients déjà informés de votre façon de travailler.
    Le rendez-vous a lieu, et c'est au commercial de le mener sans pression ni angoisse. Dès que le client signe
    le mandat, vous nous réglez le montant correspondant à la gamme du véhicule :
  </p>
  <table role="presentation" style="border-collapse:collapse;margin:0 0 10px">
    <tr><td style="padding:2px 14px 2px 0;font-size:14.5px;vertical-align:top">–</td><td style="padding:2px 0;font-size:14.5px">une citadine (Clio, 208, Polo…) : <strong>${p.citadine} € TTC</strong></td></tr>
    <tr><td style="padding:2px 14px 2px 0;font-size:14.5px;vertical-align:top">–</td><td style="padding:2px 0;font-size:14.5px">un SUV ou intermédiaire (Range Rover, Q5, X3…) : <strong>${p.suv} € TTC</strong></td></tr>
    <tr><td style="padding:2px 14px 2px 0;font-size:14.5px;vertical-align:top">–</td><td style="padding:2px 0;font-size:14.5px">un véhicule premium, à partir de 150 000 € (Classe S, GT3 RS…) : <strong>${p.premium} € TTC</strong></td></tr>
  </table>
  <p style="margin:0 0 4px;font-size:13.5px;color:${C.muted};line-height:1.7">
    La facturation se fait groupée, tous les 15 à 30 rendez-vous, selon les modalités que nous définirons
    ensemble. Dans les faits, la grande majorité de nos dossiers se situent entre la citadine et le SUV.
  </p>

  <p style="margin:22px 0 8px;font-size:15px;line-height:1.75"><strong>Le lead qualifié</strong></p>
  <p style="margin:0 0 10px;font-size:15px;line-height:1.75">
    Un contact direct, issu de nos campagnes, livré sans engagement de signature de votre part : <strong>${p.lead} € TTC</strong>
    par lead. Un tarif dégressif est possible à partir de 100 leads par semaine — je me ferai un plaisir de vous
    en dire davantage de vive voix. Le règlement intervient sous 48 heures après la livraison de la campagne,
    par virement, carte bancaire ou prélèvement.
  </p>

  <p style="margin:22px 0 16px;font-size:15px;line-height:1.75">
    Nos critères de sélection restent stricts : véhicules de moins de 150 000 km avec entretiens à jour, de
    moins de 10 ans, une demande systématique du SOH pour l'électrique, et une vigilance particulière sur les
    véhicules accidentés.
  </p>

  <p style="margin:0 0 16px;font-size:15px;line-height:1.75">
    Si cette proposition vous convient, nous formaliserons ensemble un petit contrat précisant la formule
    retenue, les volumes souhaités et les engagements de chacun.
  </p>

  <p style="margin:0 0 28px;font-size:15px;line-height:1.75">
    Je reste à votre entière disposition pour en discuter plus en détail, par téléphone ou de vive voix.
  </p>

  ${psNeeds}

  <p style="margin:0;font-size:15px;line-height:1.6">Bien cordialement,</p>
  <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:${C.navy}">${sig.name}</p>
  <p style="margin:0;font-size:13.5px;color:${C.muted}">${sig.title}${sig.title ? " — " : ""}${BUSINESS}${sig.phone ? ` · ${sig.phone}` : ""}</p>`;

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
