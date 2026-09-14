// E-mail "votre compte est prêt" envoyé automatiquement à la création d'un compte CRM
// (agence, call center, téléprospecteur, commercial...) par le super-admin. Volontairement
// sobre — pas de logo, pas de couleurs, un mail simple — contrairement aux mails clients
// (lib/email-templates.ts) et à la prospection agences (lib/yj-prospection.ts).

export function accountReadyEmail(d: { name: string; agenceName?: string; identifiant: string; password: string; loginUrl: string }) {
  const phraseAgence = d.agenceName ? ` Vous faites partie de l'agence ${d.agenceName}.` : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222;line-height:1.6">
  <p>Bonjour ${d.name},</p>
  <p>Votre compte est sur le point d'être activé.${phraseAgence}</p>
  <p>Veuillez cliquer sur le lien ci-dessous pour vous connecter :</p>
  <p><a href="${d.loginUrl}">${d.loginUrl}</a></p>
  <p>Identifiant : ${d.identifiant}<br>Mot de passe : ${d.password}</p>
</body></html>`;
  return { subject: "Activer votre compte", html };
}
