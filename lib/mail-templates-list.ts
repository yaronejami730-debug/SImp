/** Templates de mails rapides pour la section "Mail personnalisé" de la fiche client.
 *  Chaque template est texte brut. Variables {firstName} {lastName} {vehicle}
 *  pré-remplies côté UI. Le reste = [PLACEHOLDER] à remplir manuellement. */

export type MailTpl = {
  key: string;
  category: string;
  label: string;
  subject: string;
  body: string;
};

export const MAIL_TEMPLATES: MailTpl[] = [
  // === NÉGOCIATION ===
  {
    key: "offer_accepted",
    category: "Négociation",
    label: "✅ Validation de l'offre",
    subject: "Votre offre est acceptée — {vehicle}",
    body: `Excellente nouvelle ! Le propriétaire du véhicule {vehicle} accepte votre offre de [MONTANT] €.

Pour valider l'achat, voici les prochaines étapes :
- Signature du bon de commande
- Versement de l'acompte de [MONTANT_ACOMPTE] €
- Récupération du véhicule prévue le [DATE]

Je vous recontacte rapidement pour fixer le rendez-vous de signature.

À très vite,`,
  },
  {
    key: "counter_offer",
    category: "Négociation",
    label: "💬 Contre-offre du vendeur",
    subject: "Contre-proposition — {vehicle}",
    body: `Suite à votre offre sur le véhicule {vehicle}, le propriétaire vous propose une contre-offre :

Prix de vente : [PRIX] €
Condition(s) : [CONDITIONS_EVENTUELLES]

Si cette contre-offre vous convient, répondez-moi simplement par retour ou par téléphone, je m'occupe du reste.

À vous d'arbitrer,`,
  },
  {
    key: "offer_rejected",
    category: "Négociation",
    label: "❌ Offre refusée",
    subject: "Refus de l'offre — {vehicle}",
    body: `Je reviens vers vous concernant le véhicule {vehicle}.

Malheureusement, le propriétaire n'a pas accepté votre proposition de [MONTANT] €. Il est ferme sur son prix à [PRIX_VENDEUR] €.

Souhaitez-vous formuler une nouvelle proposition, ou je clôture le dossier ?

Restant à votre disposition,`,
  },
  {
    key: "offer_received",
    category: "Négociation",
    label: "📨 Offre reçue (côté vendeur)",
    subject: "Offre reçue sur votre véhicule — {vehicle}",
    body: `Bonne nouvelle : un acheteur sérieux nous a transmis une offre sur votre véhicule {vehicle}.

Proposition : [MONTANT] €
Modalités : [MODALITES]

Êtes-vous d'accord avec ce montant ? Vous pouvez aussi me communiquer une contre-proposition, je transmets immédiatement.

Cordialement,`,
  },

  // === RDV / VISITE ===
  {
    key: "visit_scheduled",
    category: "Rendez-vous",
    label: "🚗 Visite du véhicule programmée",
    subject: "Visite du véhicule confirmée — {vehicle}",
    body: `Votre visite du véhicule {vehicle} est confirmée :

📅 Date : [DATE]
🕐 Heure : [HEURE]
📍 Adresse : 3 rue Bélidor, 75017 Paris

N'oubliez pas votre pièce d'identité et votre permis pour l'essai routier.

Si vous avez le moindre empêchement, prévenez-moi le plus tôt possible.

À très bientôt,`,
  },
  {
    key: "visit_reminder",
    category: "Rendez-vous",
    label: "⏰ Rappel visite imminente",
    subject: "Rappel : visite du véhicule demain",
    body: `Petit rappel : votre rendez-vous pour le véhicule {vehicle} est prévu [DATE] à [HEURE] à notre agence (3 rue Bélidor, 75017 Paris).

Pensez à vous munir de votre pièce d'identité et de votre permis si vous souhaitez essayer le véhicule.

À demain,`,
  },
  {
    key: "visit_reschedule",
    category: "Rendez-vous",
    label: "📅 Demande de reprogrammation",
    subject: "Reprogrammation du rendez-vous — {vehicle}",
    body: `Suite à un imprévu, je dois malheureusement reprogrammer notre rendez-vous concernant le véhicule {vehicle}.

Voici les créneaux que je peux vous proposer :
- [CRÉNEAU 1]
- [CRÉNEAU 2]
- [CRÉNEAU 3]

Lequel vous arrange le mieux ?

Avec mes excuses pour la gêne occasionnée,`,
  },

  // === DOCUMENTS / ADMIN ===
  {
    key: "request_docs",
    category: "Documents",
    label: "📄 Demande de documents",
    subject: "Documents nécessaires pour la transaction",
    body: `Afin de finaliser la transaction sur le véhicule {vehicle}, j'aurais besoin des documents suivants :

- Pièce d'identité (recto + verso)
- Justificatif de domicile (moins de 3 mois)
- RIB
- Permis de conduire

Vous pouvez me les transmettre par retour de mail ou en main propre lors de notre prochain rendez-vous.

Merci d'avance,`,
  },
  {
    key: "send_mandat",
    category: "Documents",
    label: "✍️ Mandat de vente à signer",
    subject: "Mandat de vente prêt à signer — {vehicle}",
    body: `Comme convenu, vous trouverez ci-joint le mandat de vente pour votre véhicule {vehicle}.

Merci de :
1. Lire attentivement le document
2. Parapher chaque page
3. Signer la dernière page avec mention "Lu et approuvé"
4. Me le retourner par mail ou en main propre

Une fois le mandat reçu, je lance la commercialisation immédiatement.

À votre disposition pour toute question,`,
  },
  {
    key: "bc_ready",
    category: "Documents",
    label: "📝 Bon de commande à signer",
    subject: "Bon de commande prêt — {vehicle}",
    body: `Votre bon de commande pour le véhicule {vehicle} est prêt.

Montant : [PRIX] €
Acompte demandé : [ACOMPTE] €
Solde à la livraison : [SOLDE] €

Vous pouvez passer le signer à l'agence aux horaires d'ouverture, ou je peux vous l'envoyer par mail pour signature électronique. Que préférez-vous ?

Bien à vous,`,
  },

  // === VEHICULE / MISE EN VENTE ===
  {
    key: "listing_online",
    category: "Mise en vente",
    label: "📣 Véhicule mis en ligne",
    subject: "Votre véhicule est en ligne — {vehicle}",
    body: `Votre véhicule {vehicle} est désormais en ligne sur les principales plateformes (LeBonCoin, La Centrale, AutoScout24).

Prix affiché : [PRIX] €

Je vous tiens informé(e) dès qu'un acheteur sérieux se manifeste. Nous filtrons les contacts pour ne vous transmettre que les offres pertinentes.

À très vite avec de bonnes nouvelles,`,
  },
  {
    key: "price_adjustment",
    category: "Mise en vente",
    label: "💸 Ajustement de prix proposé",
    subject: "Suggestion d'ajustement de prix — {vehicle}",
    body: `Votre véhicule {vehicle} est en ligne depuis [DURÉE]. Pour accélérer la vente, je vous suggère un ajustement de prix :

Prix actuel : [PRIX_ACTUEL] €
Prix conseillé : [PRIX_CONSEILLE] €

Cette baisse devrait générer significativement plus de demandes. Qu'en pensez-vous ?

À vous de décider,`,
  },

  // === SUIVI / RELANCE ===
  {
    key: "followup_thinking",
    category: "Suivi",
    label: "🤔 Relance « réfléchit »",
    subject: "Toujours intéressé(e) par {vehicle} ?",
    body: `Suite à notre rendez-vous, je voulais m'assurer que vous aviez bien toutes les informations sur le véhicule {vehicle}.

Avez-vous des questions complémentaires ? Je peux aussi vous transmettre :
- Le rapport HistoVec
- Le carnet d'entretien
- Des photos additionnelles

Le véhicule est toujours disponible mais d'autres clients s'y intéressent. Faites-moi signe rapidement si vous voulez avancer.

À très vite,`,
  },
  {
    key: "followup_silent",
    category: "Suivi",
    label: "🔔 Relance générale",
    subject: "Des nouvelles ?",
    body: `Je reviens vers vous concernant le véhicule {vehicle}.

Je n'ai pas eu de retour depuis notre dernier échange — souhaitez-vous toujours avancer sur ce dossier, ou préférez-vous voir d'autres options ?

Dans tous les cas, n'hésitez pas, je suis là pour vous aider.

À votre écoute,`,
  },
  {
    key: "alt_vehicles",
    category: "Suivi",
    label: "🔍 Proposition d'alternatives",
    subject: "Quelques alternatives à votre véhicule",
    body: `Suite à votre intérêt pour le véhicule {vehicle}, j'ai présélectionné quelques alternatives qui pourraient vous plaire :

- [VEHICULE 1] — [PRIX] €
- [VEHICULE 2] — [PRIX] €
- [VEHICULE 3] — [PRIX] €

Souhaitez-vous que je vous envoie le détail (photos, kilométrage, options) ?

À très vite,`,
  },

  // === LIVRAISON / FIN DE DOSSIER ===
  {
    key: "payment_confirmed",
    category: "Livraison",
    label: "💰 Confirmation virement reçu",
    subject: "Paiement bien reçu — merci !",
    body: `Je vous confirme la bonne réception de votre virement de [MONTANT] € pour le véhicule {vehicle}.

Le dossier est désormais finalisé. Nous pouvons fixer la date de livraison :

[DATE_LIVRAISON]

Confirmez-moi simplement si cette date vous convient.

Encore merci pour votre confiance,`,
  },
  {
    key: "delivery_prep",
    category: "Livraison",
    label: "🛠️ Préparation livraison",
    subject: "Préparation de votre véhicule en cours",
    body: `Votre véhicule {vehicle} est en cours de préparation pour la livraison du [DATE].

Au programme :
- Nettoyage intérieur/extérieur complet
- Contrôle des niveaux et pneumatiques
- Vérification des documents administratifs
- Carte grise mise à jour

Je vous recontacte la veille pour confirmer l'heure.

À très bientôt,`,
  },
  {
    key: "delivery_done",
    category: "Livraison",
    label: "🎉 Félicitations livraison",
    subject: "Bonne route avec votre nouvelle voiture !",
    body: `Encore merci pour votre confiance et bonne route avec votre {vehicle} !

Vous trouverez en pièces jointes tous les documents (carte grise, factures, garantie).

Pour rappel, je reste disponible si vous avez la moindre question dans les semaines à venir.

Si vous êtes satisfait(e), un petit avis Google ferait très plaisir : [LIEN_AVIS]

Excellente route,`,
  },
  {
    key: "ask_review",
    category: "Livraison",
    label: "⭐ Demande d'avis Google",
    subject: "Un petit retour sur votre expérience ?",
    body: `J'espère que votre {vehicle} vous donne entière satisfaction.

Si vous avez 30 secondes, votre avis sur Google nous aiderait énormément à continuer à bien servir nos futurs clients :

👉 [LIEN_AVIS]

Un grand merci d'avance !

À bientôt,`,
  },

  // === DIVERS ===
  {
    key: "vehicle_unavailable",
    category: "Divers",
    label: "🚫 Véhicule plus disponible",
    subject: "Véhicule {vehicle} : indisponible",
    body: `Malheureusement, le véhicule {vehicle} vient d'être vendu à un autre acheteur.

Cela arrive très vite sur les beaux dossiers — mes excuses si vous comptiez réellement dessus. Je peux vous proposer :

- D'autres véhicules similaires (je vous envoie une sélection)
- De vous mettre en alerte sur le même modèle quand un nouveau sort

Que préférez-vous ?

Sincèrement,`,
  },
  {
    key: "general_info",
    category: "Divers",
    label: "💬 Information générale",
    subject: "Information — {vehicle}",
    body: `[ÉCRIRE LE MESSAGE ICI]

Bien cordialement,`,
  },
];

export const TEMPLATE_CATEGORIES = Array.from(new Set(MAIL_TEMPLATES.map((t) => t.category)));

/** Remplace {firstName} {lastName} {vehicle} dans un texte. */
export function fillVars(text: string, vars: { firstName?: string; lastName?: string; vehicle?: string }): string {
  return text
    .replace(/\{firstName\}/g, vars.firstName ?? "")
    .replace(/\{lastName\}/g, vars.lastName ?? "")
    .replace(/\{vehicle\}/g, vars.vehicle ?? "votre véhicule");
}
