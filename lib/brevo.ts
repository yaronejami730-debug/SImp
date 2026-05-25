type SendOpts = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
};

/** Envoie un e-mail transactionnel via l'API Brevo. */
export async function sendEmail(opts: SendOpts) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY ?? "",
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME ?? "Simplisicar",
        email: process.env.BREVO_SENDER_EMAIL,
      },
      to: [{ email: opts.to, name: opts.toName }],
      subject: opts.subject,
      htmlContent: opts.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo ${res.status}: ${body}`);
  }
  return res.json();
}
