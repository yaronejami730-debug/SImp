/** Templates SMS rapides pour la section "SMS personnalisé" de la fiche client.
 *  Texte court. Variables {firstName} {vehicle} pré-remplies côté UI.
 *  [PLACEHOLDER] = à compléter à la main. Signés Simplicicar + STOP. */

export type SmsTpl = {
  key: string;
  category: string;
  label: string;
  text: string;
};

export const SMS_TEMPLATES: SmsTpl[] = [
  // === RDV ===
  {
    key: "rdv_confirm",
    category: "Rendez-vous",
    label: "✅ Confirmation RDV",
    text: "Simplicicar: bonjour {firstName}, votre RDV est confirme le [DATE] a [HEURE], 3 rue Belidor 75017 Paris. A bientot! STOP au 36180",
  },
  {
    key: "rdv_reminder",
    category: "Rendez-vous",
    label: "⏰ Rappel RDV",
    text: "Simplicicar: rappel {firstName}, votre RDV est demain a [HEURE]. Pensez a la carte grise et piece d'identite. A demain! STOP au 36180",
  },
  {
    key: "rdv_reschedule",
    category: "Rendez-vous",
    label: "📅 Reprogrammer",
    text: "Simplicicar: bonjour {firstName}, un imprevu nous oblige a decaler votre RDV. Quel creneau vous arrange? Rappelez-nous. Merci! STOP au 36180",
  },
  {
    key: "on_way",
    category: "Rendez-vous",
    label: "🚗 Vous attend",
    text: "Simplicicar: bonjour {firstName}, on vous attend a l'agence, 3 rue Belidor 75017 Paris. A tout de suite! STOP au 36180",
  },

  // === SUIVI ===
  {
    key: "callback",
    category: "Suivi",
    label: "📞 Demande de rappel",
    text: "Simplicicar: bonjour {firstName}, pouvez-vous nous rappeler au [TEL] au sujet de votre dossier? Merci! STOP au 36180",
  },
  {
    key: "followup",
    category: "Suivi",
    label: "🔔 Relance",
    text: "Simplicicar: bonjour {firstName}, toujours interesse par {vehicle}? On reste dispo pour avancer ensemble. STOP au 36180",
  },
  {
    key: "nrp",
    category: "Suivi",
    label: "📵 Tentative d'appel",
    text: "Simplicicar: bonjour {firstName}, on a essaye de vous joindre sans succes. Rappelez-nous au [TEL] quand vous voulez. STOP au 36180",
  },

  // === DOCUMENTS / VENTE ===
  {
    key: "docs",
    category: "Documents",
    label: "📄 Documents",
    text: "Simplicicar: bonjour {firstName}, pour avancer il nous manque [DOCUMENT]. Vous pouvez nous l'envoyer? Merci! STOP au 36180",
  },
  {
    key: "good_news",
    category: "Vente",
    label: "🎉 Bonne nouvelle",
    text: "Simplicicar: bonjour {firstName}, bonne nouvelle concernant {vehicle}! Rappelez-nous des que possible. STOP au 36180",
  },
  {
    key: "review",
    category: "Vente",
    label: "⭐ Demande d'avis",
    text: "Simplicicar: merci {firstName}! Si vous etes satisfait, votre avis nous aide beaucoup: [LIEN_AVIS]. Merci! STOP au 36180",
  },

  // === DIVERS ===
  {
    key: "free",
    category: "Divers",
    label: "💬 Message libre",
    text: "Simplicicar: bonjour {firstName}, [MESSAGE]. STOP au 36180",
  },
];

export const SMS_TEMPLATE_CATEGORIES = Array.from(new Set(SMS_TEMPLATES.map((t) => t.category)));
