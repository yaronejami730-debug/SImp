# Guide pratique — comment ça marche, de bout en bout

Ce document explique le système par des cas concrets (pas une liste de fonctions) : tu fais
X dans l'interface, voici ce qui se passe derrière. Pour la vue d'ensemble technique, voir
`BRIEF.md`. Pour les règles déjà tranchées, voir `BUSINESS_RULES.md`.

Chaque fois que j'ai trouvé un comportement bizarre en écrivant ce guide, je le signale en
🚨 directement dans le scénario concerné, plus un récap en bas.

---

## 1. Les briques de base (rappel express)

- Une **agence** = une ligne `call_centers` sans parent (`parent_id = null`).
- Un **call center** = une ligne `call_centers` rattachée à une agence (`parent_id` =
  l'agence).
- Un **compte** (`users`) a un rôle unique (super-admin / administrateur d'agence /
  collaborateur) + des flags cumulables (commercial, téléprospecteur, gestionnaire,
  associé) — voir `BRIEF.md` §2 pour le détail.
- Un compte est toujours rattaché à UNE ligne `call_centers` (`call_center_id`) — soit
  directement à un call center, soit directement à une agence (dans ce cas on dit qu'il est
  "indépendant" : rattaché à l'agence entière, pas à un call center précis en dessous).

---

## 2. Scénario — configurer une agence et un call center

1. **Comptes** (espace YJ Solutions, super-admin uniquement) → colonne de gauche → "+ Créer
   une agence". Elle apparaît en racine, avec un slug d'URL auto-généré
   (`agenda-rdv.vercel.app/<slug>`).
2. Sous cette agence, "+ Créer un compte" → type "Call center" crée un call center enfant
   ET son responsable (l'"administrateur d'agence" pour ce périmètre) en même temps.
3. Dans les Réglages de l'agence : logo, couleurs (accent/foncé, avec aperçu live de la
   vraie sidebar), mode de rémunération télépros par défaut (gestionnaire ou responsable
   redistribue).
4. Un call center peut ensuite être restreint à une liste de commerciaux précis (voir
   scénario 4) — sinon, par défaut, **tous les commerciaux actifs du système** lui sont
   proposables.

🚨 **Trouvé en écrivant ce paragraphe, nouveau (pas dans l'audit précédent) :** le call
center d'id technique **`1`** ("Simplicicar Paris 17e", l'agence historique) est **câblé en
dur pour n'avoir JAMAIS de restriction**, quoi que tu configures dans ses Réglages
(`lib/callcenters.ts`, fonction `callCenterRule` : `if (ccId === 1) return null`). Toutes
les AUTRES agences (Annemasse, etc.) suivent la vraie logique de restriction. Concrètement :
si tu essaies de limiter les commerciaux de Simplicicar Paris 17e à une liste précise, ça ne
marchera jamais, silencieusement. Est-ce voulu (l'agence d'origine reste toujours ouverte à
tous), ou c'est un raccourci technique de l'époque où il n'y avait qu'une seule agence,
jamais généralisé ? → à ajouter aux questions Phase 2 si tu veux le corriger.

---

## 3. Scénario — créer les comptes

- **Commercial** : rattaché à une AGENCE ENTIÈRE (jamais à un call center précis — un
  commercial peut recevoir des RDV de plusieurs call centers de la même agence).
- **Téléprospecteur rattaché à un call center précis** : voit dans son formulaire de prise
  de RDV la liste des commerciaux de CE call center (héritée de l'agence si le call center
  n'a lui-même aucun commercial lié — voir scénario 4).
- **Téléprospecteur "indépendant"** : rattaché directement à l'agence (pas à un call center
  enfant) — dans ce cas la restriction appliquée est celle de l'AGENCE elle-même (si elle en
  a une), sinon aucune restriction (tous les commerciaux du système).
- Case "Envoyer un mail avec l'identifiant et le mot de passe" à la création : envoie un
  mail simple (pas de logo/couleur) avec le lien de connexion permanent de l'agence +
  identifiant + mot de passe en clair (c'est l'admin qui choisit le mot de passe, pas la
  personne elle-même).

---

## 4. Scénario — restreindre un call center à certains commerciaux

Comptes → sélectionne le call center → Réglages → section "Commerciaux liés" : coche les
commerciaux autorisés pour CE call center précis (ou lie un commercial d'une AUTRE agence,
cas rare, via le bouton de recherche dédié).

- **Aucun commercial coché** = aucune restriction, tous les commerciaux actifs du système
  restent proposables (comportement par défaut, pas un blocage).
- **Au moins un coché** = seuls ceux-là sont proposables pour un RDV créé par quelqu'un de
  ce call center — sauf le cas 🚨 de l'agence id=1 ci-dessus, et sauf le cas de
  l'assignation individuelle par téléprospecteur (scénario 5, 🚨 conflit connu).
- Si le call center lui-même n'a aucun commercial lié, la règle remonte à son AGENCE
  parente (si l'agence en a une) — c'est l'héritage. Si l'agence non plus, aucune
  restriction.

---

## 5. Scénario — assigner des commerciaux précis à UN téléprospecteur

Comptes → fiche du téléprospecteur → "Assigner des commerciaux" → coche + priorité
(1 = en premier) + option "🤖 Attribution automatique".

- **Sans assignation individuelle** : le téléprospecteur voit, dans son formulaire, la
  liste du call center/agence (scénario 4).
- **Avec assignation individuelle** : cette liste REMPLACE celle du call center pour LUI
  précisément (priorité 1, 2, 3…).
- **Mode manuel** (par défaut) : il choisit lui-même dans le dropdown.
- **Mode automatique** (`auto_assign`) : à la prise de RDV, le serveur essaie ses
  commerciaux dans l'ordre de priorité et prend le premier libre au créneau demandé (vérifie
  les conflits d'horaire + la règle demi-journée). Si tous sont occupés, il force quand même
  le n°1 avec un avertissement plutôt que de bloquer le RDV.

🚨 **Déjà identifié dans l'audit (A1/A2 dans `BUSINESS_RULES.md`, encore EN ATTENTE de ta
décision)** : l'assignation individuelle ci-dessus peut pointer vers un commercial qui n'est
PAS dans la liste autorisée du call center (scénario 4) — le système peut alors proposer ce
commercial dans le dropdown, ou l'auto-assign peut le choisir tout seul, et le serveur
REFUSE ensuite le RDV avec une erreur *"Ce call center ne peut assigner qu'à : ..."*. Tant
que tu n'as pas tranché qui doit gagner (le call center ou l'assignation perso), ce cas
précis peut produire une prise de RDV qui échoue de façon surprenante pour le
téléprospecteur concerné.

---

## 6. Scénario — la prise de RDV, du premier clic à l'événement Google Agenda

1. Le téléprospecteur (ou l'admin) ouvre "Prise de RDV". Civilité, identité client,
   téléphone (06/07 uniquement, normalisé automatiquement), type de RDV (agence ou
   déplacement).
2. **Lead ou annonce ?** Toggle admin "Ce client est un lead" — si activé (ou si on vient
   d'un lead converti, voir scénario 7), mini-questionnaire véhicule déclaratif (année, km,
   boîte, entretiens, habitacle, vices, plaque optionnelle avec recherche SIV automatique).
   Sinon, lien d'annonce + plateforme (LeBonCoin par défaut).
3. **Commercial** : voir scénarios 4/5 ci-dessus pour savoir qui est proposé/choisi.
4. **Créneau** : le `SlotPicker` affiche les disponibilités du commercial choisi (ou du
   commercial prioritaire n°1 si mode automatique — approximation, le vrai choix final peut
   être un autre commercial de la liste si le n°1 est occupé).
5. À la validation : vérif conflit d'horaire + règle demi-journée pour CE commercial
   précis → si conflit, le système propose "Créer quand même" plutôt que de bloquer net.
6. L'événement est créé sur Google Agenda (source de vérité), copié automatiquement dans
   Postgres pour la vitesse des tableaux de bord. Le mail + SMS de confirmation partent avec
   le nom et le téléphone du commercial. Le mot "Lead" n'apparaît JAMAIS sur l'événement
   Google visible — seulement les caractéristiques factuelles du véhicule.

---

## 7. Scénario — un lead devient un RDV

1. Prospection ("Lead") → ajout manuel ou import CSV/collage en masse d'une liste de
   prospects à rappeler.
2. Le téléprospecteur appelle, note un statut (nouveau / absent / ne répond pas / faux
   numéro / NRP 1-2-3 / RDV pris).
3. Clic "Prendre rendez-vous" → redirige vers la prise de RDV avec identité pré-remplie ET
   **mode lead activé automatiquement** (pas besoin de recocher le toggle) — le statut du
   lead passe direct à "RDV pris".
4. 🚨 Rappel (déjà connu, `BUSINESS_RULES.md` LEAD-001, pas encore fait) : aujourd'hui le
   pool de leads n'a aucun champ véhicule — les infos données au téléphone (année, km...) ne
   sont PAS encore transférées au RDV, il faut les ressaisir dans le mini-questionnaire au
   moment du RDV. Correction décidée, pas encore codée.
5. Alternative : "Rappel téléphonique" (pas encore un vrai RDV client) — crée un événement
   Google séparé + une entrée dans les rappels, le lead sort du pool.

---

## 8. Scénario — le Deal (qui touche quoi)

1. Un **gestionnaire** (épinglé sur un call center OU avec le flag de rôle — les deux
   comptent maintenant, `BUSINESS_RULES.md` ROLE-001) négocie TOUJOURS avec un
   **commercial** : "je te vends des rendez-vous, tu me payes X € au mandat signé + Y % à la
   vente".
2. Ensuite, deux façons de reverser à la téléprospection :
   - le call center prend une part, son responsable redistribue lui-même en interne (pas
     suivi dans le Deal) ;
   - OU le gestionnaire paie un téléprospecteur précis, en direct, sur sa propre part.
3. Comptes → Deal → "Nouveau deal" (réservé au super-admin et au gestionnaire concerné) →
   étapes : avec qui, qui touche quoi, quand (mandat signé / RDV honoré / + vente), montant
   fixe et/ou %.
4. Chacun voit un bandeau "Mon deal" avec ce qui le concerne personnellement (ce qu'il paie
   ou reçoit), en langage clair, pas des colonnes de chiffres bruts.
5. 🚨 Le plus gros chantier identifié (`BUSINESS_RULES.md` DEAL-005/006, décidé, pas encore
   codé) : le Deal ne remplace PAS encore l'ancien système à plat partout — aujourd'hui
   "Mes paiements" utilise bien le Deal, mais "Mon solde" (côté téléprospecteur),
   "Statistiques", la facturation et la fiche RDV individuelle peuvent encore afficher un
   AUTRE montant (l'ancien taux fixe du compte) pour la même personne. En clair : jusqu'à ce
   que ce soit corrigé, ne te fie pas encore à 100% aux chiffres affichés ailleurs que dans
   "Mes paiements" si un Deal existe pour la personne concernée.

---

## 9. Qui voit quoi (aide-mémoire rapide)

| Compte | Voit dans "Comptes" | Voit dans "Deal" | Attribution RDV |
|---|---|---|---|
| Super-admin | Tout, toutes agences | Tout | Peut tout configurer |
| Administrateur d'agence | Son agence entière (call centers enfants inclus, `BUSINESS_RULES.md` ROLE-005, pas encore codé) | Rien (sauf ses propres deals persos s'il cumule commercial) | Configure les restrictions de son/ses call center(s) |
| Gestionnaire | Ce qui le concerne | Ses propres deals | — |
| Commercial | Ses propres RDV/paiements | Bandeau "Mon deal" | Reçoit les RDV |
| Téléprospecteur | Ses propres RDV créés | Bandeau "Mon deal" | Choisit ou reçoit automatiquement un commercial (scénario 5) |

---

## Récap des problèmes trouvés en écrivant ce guide

1. **Nouveau** — call center id=1 ("Simplicicar Paris 17e") jamais restreignable, câblé en
   dur, contrairement à toutes les autres agences (§2).
2. **Déjà connu, en attente** — conflit entre restriction call center et assignation
   individuelle d'un téléprospecteur, peut faire échouer une prise de RDV sans explication
   claire pour l'utilisateur (§5, = A1/A2).
3. **Déjà connu, décidé mais pas codé** — pool de leads sans champ véhicule (§7 = LEAD-001).
4. **Déjà connu, décidé mais pas codé** — Deal pas encore prioritaire partout, chiffres
   possiblement différents selon l'écran (§8 = DEAL-005/006).

Le point 1 est nouveau — je te propose de l'ajouter à `PHASE2_QUESTIONS.md` /
`BUSINESS_RULES.md` si tu veux qu'on tranche dessus, dis-moi.
