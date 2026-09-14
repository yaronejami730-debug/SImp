# BUSINESS_RULES.md — la constitution du CRM

Chaque règle ci-dessous vient d'une question posée pendant l'audit (Phase 2,
`PHASE2_QUESTIONS.md`) et d'une réponse explicite du client. Une fois une règle ici, elle
est figée : tout futur code doit la respecter, et toute envie de la changer repasse par une
nouvelle question posée explicitement, jamais par une décision technique silencieuse.

Format : `RÈGLE [DOMAINE]-[NNN]` + l'énoncé + la source (quelle question, quelle réponse).

---

## SÉCURITÉ

### RÈGLE AUTH-001
Le raccourci d'authentification par PIN (`lib/auth.ts`, header `x-pin` = `DASHBOARD_PIN`
donnant une session admin complète sans vérification de compte) est **supprimé**. Ce n'est
pas un accès de secours voulu.

*Source : question S1, réponse "Retirer".*
*Statut : FAIT.*

### RÈGLE AUTH-002
Les 4 routes cron (`reminders`, `daily-signature-check`, `dde-rappels`,
`reconcile-appointments`) doivent TOUJOURS bloquer si `CRON_SECRET` n'est pas configuré —
jamais s'ouvrir par défaut. Comportement uniforme sur les 4.

*Source : question S2, réponse "Oui, bloquer toutes les 4".*
*Statut : décidé, pas encore implémenté (Phase 4).*

### RÈGLE AUTH-003
La page Comptes de l'espace YJ Solutions (`/prospection-agence/comptes`) doit passer par un
accès dédié réservé au super-admin, séparé de `/api/users` (qui reste accessible aux
responsables ailleurs dans le CRM pour gérer leur propre call center — ne pas y toucher).

*Source : question S3, réponse "Créer un accès séparé admin-only".*
*Statut : décidé, pas encore implémenté (Phase 4).*

### RÈGLE AUTH-004
Les vérifications de droits d'accès seront centralisées dans un seul système commun (un
`lib/authz.ts` ou équivalent), utilisé par toutes les routes API — objectif Phase 4 de la
refonte. Les incohérences trouvées (ex : `ownsOrAdmin` différent selon la sous-route client,
scope Agenda vs Stock différent pour un responsable) seront reprises et tranchées une par
une AU MOMENT de cette centralisation, pas avant.

*Source : question S4, réponse "Un seul système central (Phase 4)".*
*Statut : décidé — c'est un chantier de structure, pas un fix ponctuel. Attend la Phase 4.*

## RÔLES & PERMISSIONS

### RÈGLE ROLE-001
"Être gestionnaire" = être épinglé comme `gestionnaire_email` d'un call center OU avoir le
flag de rôle `is_gestionnaire` coché sur son compte. `isGestionnaireEmail()` (et donc
`/api/me`, et donc l'affichage du lien Deal dans la navigation) doit vérifier les DEUX
signaux, alignée sur ce que le serveur autorise déjà côté `/api/deals`.

*Source : question R1, réponse "Fusionner : le bouton suit les 2 signaux".*
*Statut : FAIT.*

### RÈGLE ROLE-002
Le token de connexion doit inclure `isGestionnaire`/`isAssocie`, comme il inclut déjà
`isCommercial`/`isTeleprospector` — cohérence et vitesse. Nuance à garder en tête à
l'implémentation : si un admin change ces flags dans Comptes, la personne déjà connectée ne
verra le changement qu'à sa prochaine connexion (le token est valable 30 jours) — c'est déjà
le cas aujourd'hui pour `isCommercial`/`isTeleprospector`, donc pas un changement de
comportement, juste à ne pas être surpris si ça arrive pour gestionnaire/associé aussi.

*Source : question R2, réponse "Ajouter au badge".*
*Statut : FAIT.*

### RÈGLE ROLE-003
La prise de main (impersonation) n'a aucune restriction sur la cible : un super-admin peut
prendre la main sur n'importe quel compte, y compris un autre super-admin ou un compte
désactivé. Comportement actuel confirmé volontaire — ne pas y toucher.

*Source : question R3, réponse "Pas de limite, garder comme ça".*
*Statut : décidé, rien à changer.*

### RÈGLE ROLE-004
Un responsable d'agence qui cumule aussi la casquette commercial voit ses PROPRES deals
personnels (où il est payer/payee) dans l'écran Deal — ce n'est pas une fuite de sa
casquette "responsable", c'est la visibilité normale de sa propre transaction. La règle
"un responsable ne voit pas le Deal" s'entend comme "ne voit pas les deals des AUTRES /
de son agence en tant que responsable", pas comme une interdiction absolue de voir ses
propres contrats personnels. Comportement actuel confirmé correct — ne pas y toucher.

*Source : question R4, réponse "Autoriser : il voit ses deals persos".*
*Statut : décidé, rien à changer.*

### RÈGLE ROLE-005
Un responsable voit tous les comptes de SON AGENCE ENTIÈRE (son call center + tous les
call centers enfants), pas seulement les comptes directement rattachés à son propre call
center. `/api/users` GET doit élargir son filtre en conséquence pour ce rôle.

*Source : question R5, réponse "Oui, il doit voir toute son agence".*
*Statut : décidé, pas encore implémenté (Phase 4).*

## RÉMUNÉRATION

### RÈGLE DEAL-001
`/api/mon-solde`, vue téléprospecteur ("je reçois"), doit prioriser le Deal
(`remuneration_accords`) sur l'ancien système à plat (`commission_base`/`pct`) dès qu'un
accord Deal existe pour la personne — même logique déjà appliquée côté "Mes paiements" et
côté vue commercial de "Mon solde".

*Source : question D1, réponse "Oui, corriger".*
*Statut : décidé, pas encore implémenté (Phase 4).*

### RÈGLE DEAL-002
`/api/telepro-earnings` (récap admin "combien on doit à chaque télépro") doit prioriser le
Deal sur l'ancien système à plat, même règle que DEAL-001.

*Source : question D2, réponse "Oui, corriger pareil".*
*Statut : décidé, pas encore implémenté (Phase 4).*

### RÈGLE DEAL-003
`/api/abby/invoice` (facturation) doit prioriser le Deal sur l'ancien système à plat, même
règle que DEAL-001/002.

*Source : question D3, réponse "Oui, corriger pareil".*
*Statut : décidé, pas encore implémenté (Phase 4).*

### RÈGLE DEAL-004
`/api/client/[id]` (fiche RDV, "commission due" affichée) doit prioriser le Deal sur
l'ancien système à plat, même règle que DEAL-001/002/003.

### RÈGLE DEAL-005 (principe général)
**Le Deal (`remuneration_accords`) prime TOUJOURS sur l'ancien système à plat
(`commission_base`/`commission_pct`) dès qu'un accord Deal existe pour la personne
concernée** — sur TOUS les écrans sans exception (paiements, solde, récap admin,
facturation, fiche RDV, et tout futur écran qui affiche une commission). L'ancien système à
plat ne s'applique que quand AUCUN accord Deal ne couvre la personne pour ce RDV.

*Source : questions D1, D2, D3, D4 — toutes répondues "Oui, corriger pareil", confirmant
un principe général plutôt que 4 décisions séparées.*
*Statut : décidé, pas encore implémenté (Phase 4).*

### RÈGLE DEAL-006
`/api/statistiques` (et `/api/commercial-compensation`, table `commercial_compensation`)
doit aussi être aligné sur DEAL-005 (Deal prioritaire). La table `commercial_compensation`
devient obsolète à terme une fois cet alignement fait — pas supprimée dans l'immédiat, mais
plus la source de calcul.

*Source : question D5, réponse "L'aligner aussi sur le Deal".*
*Statut : décidé, pas encore implémenté (Phase 4).*

## ATTRIBUTION DU COMMERCIAL (prise de RDV)

### EN ATTENTE — A1/A2
Qui doit gagner quand la liste du call center et l'assignation personnelle d'un
téléprospecteur se contredisent (le call center restreint à certains commerciaux,
l'assignation perso du télépro pointe vers un commercial hors de cette liste) — pas encore
tranché, à reprendre plus tard.

*Source : questions A1/A2, réponse "on regarde ça plus tard".*
*Statut : EN ATTENTE, ne pas coder ce chantier tant que ce n'est pas répondu.*

### RÈGLE ATTR-001
L'attribution automatique doit limiter/optimiser ses appels Google Calendar (aujourd'hui
2 appels live par commercial candidat, testés un par un) — à réduire pour ne pas ralentir
la prise de RDV quand un téléprospecteur a beaucoup de commerciaux en priorité.

*Source : question A3, réponse "Limiter/optimiser dès maintenant".*
*Statut : décidé, pas encore implémenté (Phase 5 — perf).*

## DONNÉES — sources de vérité, suppression, schéma

### RÈGLE DATA-001
Le module RDV "en déplacement" (`appointments_mobile`, Jérémy Bonamy) reste
intentionnellement séparé et indépendant du système principal RDV (Google Calendar comme
référence). Il garde sa propre logique inversée (Postgres comme référence, Google en
simple sync best-effort) — pas un chantier d'unification à prévoir.

*Source : question V1, réponse "Voulu, garder séparé".*
*Statut : décidé, rien à changer.*

### RÈGLE DATA-002
Le miroir Postgres écrit en fire-and-forget (pas de confirmation attendue, échec loggé
seulement) reste tel quel — le filet de sécurité (réconciliation cron toutes les 10 min)
est jugé suffisant. Pas d'alerte supplémentaire à construire.

*Source : question V2, réponse "Ça va comme ça".*
*Statut : décidé, rien à changer.*

### RÈGLE DATA-003
`/api/my-telepros` doit désactiver (soft-delete, comme `deleteUser()`) plutôt que
supprimer physiquement un compte téléprospecteur personnel — aligné sur la règle générale
"jamais d'effacement réel d'un compte", sans exception pour ce cas.

*Source : question V3, réponse "Aligner : désactiver au lieu d'effacer".*
*Statut : décidé, pas encore implémenté (Phase 4).*

### RÈGLE DATA-004
`app/api/reglements` peut supprimer réellement une ligne `invoices` — usage confirmé
volontaire (correction/reset d'une facture pas encore finalisée, pas une facture
historique déjà émise). Comportement actuel confirmé correct, rien à changer.

*Source : question V4, réponse "Oui, c'est une correction/reset voulu".*
*Statut : décidé, rien à changer.*

### RÈGLE DATA-005
La contrainte SQL sur `remuneration_accords.payee_kind` doit exister réellement en base et
inclure officiellement `'associe'` (avec `call_center`, `gestionnaire`, `telepro`,
`apporteur`) — documente ce qui est vraiment accepté au lieu de reposer sur l'absence de
contrainte.

*Source : question V5, réponse "Écrire la règle officielle avec associe inclus".*
*Statut : décidé, pas encore implémenté (Phase 4).*

### RÈGLE DATA-006
Reconstruire un fichier `create table` canonique et documenté pour `users` et `leads` (même
principe que ce qui a déjà été fait pour `remuneration_accords` dans
`deal_extensions.sql`) — pure documentation, aucun changement de comportement.

*Source : question V6, réponse "Oui, reconstruire le plan clair".*
*Statut : décidé, pas encore implémenté (Phase 3/4 — c'est de la doc, faisable tôt).*

### RÈGLE DATA-007
La RLS activée sur `call_centers` est retirée — vérifié en base (lecture seule, session en
cours) : zéro règle (`pg_policies`) derrière, et la connexion applicative (`postgres`) la
contourne systématiquement (`bypassrls=true`). Confirmé inerte, pur bruit, à nettoyer.

*Source : question V7, réponse "Retirer, c'est du bruit inutile" (après vérification live).*
*Statut : décidé, pas encore implémenté (Phase 4).*

## LEAD

### RÈGLE LEAD-001
Ajouter les mêmes champs véhicule (année, km, boîte, entretiens, habitacle, vices) sur la
table `leads` — pour que l'info qualifiée au téléphone survive jusqu'au RDV, au lieu de
devoir être redemandée. Choix fait par défaut (le plus logique) : un téléprospecteur qui
qualifie déjà un lead au téléphone ne devrait pas avoir à reposer les mêmes questions au
moment du RDV.

*Source : question L1, réponse "fait ce qui le plus logique" (décision déléguée).*
*Statut : décidé, pas encore implémenté (Phase 6).*

### RÈGLE LEAD-002
`createReminderEvent()` doit écrire `leadId` dans `extendedProperties` de l'événement
Google "rappel téléphonique" — cohérence avec le reste (tout vit déjà dans
`extendedProperties.private` pour les RDV normaux).

*Source : question L2, réponse "À ajouter".*
*Statut : décidé, pas encore implémenté (Phase 4/6).*

## NAVIGATION & UI

### RÈGLE NAV-001 — fait immédiatement
`components/Nav.tsx` supprimé (code mort confirmé, 0 import dans tout le repo). `tsc`
propre après suppression.

*Source : question N1, réponse "Supprimer".*
*Statut : FAIT.*

### RÈGLE NAV-002
Introduire un `layout.tsx` partagé pour que `AppShell` reste monté entre deux navigations
(au lieu de se reconstruire à chaque clic) — programmé pour la Phase 5/6 (perf), chantier
technique pur, aucun changement visible pour l'utilisateur une fois fait.

*Source : question N3, réponse "Oui, Phase 5/6".*
*Statut : décidé, pas encore implémenté.*

### RÈGLE NAV-003
Migrer les polices (`app/layout.tsx`) vers `next/font/google` — inclus dans le chantier
perf Phase 5, aucun changement visuel.

*Source : question N4, réponse "Oui, même chantier perf".*
*Statut : décidé, pas encore implémenté.*

## INTÉGRATIONS & YJ SOLUTIONS

### RÈGLE INTEG-001
"Ne jamais mélanger" CRM Simplicicar et YJ Solutions porte sur ce que voit le
destinataire (nom d'expéditeur, branding, contenu) — pas sur l'infrastructure technique
d'envoi. Adresse Brevo technique partagée confirmée acceptable, rien à changer.

*Source : question I1, réponse "Le nom suffit".*
*Statut : décidé, rien à changer.*

### RÈGLE INTEG-002
La conversion d'un questionnaire "besoins" rempli en vraie agence dans Comptes reste
manuelle, décidée au cas par cas par le super-admin. Pas de bouton d'automatisation à
construire.

*Source : question I2, réponse "Ça va comme ça, manuel".*
*Statut : décidé, rien à changer.*

### EN ATTENTE — I3
Le fallback codé en dur `simplicicar.store` (3 fichiers, reconnexion Google) — inconnu si
ce domaine est encore actif. Faible enjeu (échoue de façon visible si jamais utilisé, pas
de risque silencieux) — à vérifier avec qui gère les domaines avant de trancher.

*Source : question I3, réponse "Je ne sais pas".*
*Statut : EN ATTENTE.*

### RÈGLE INTEG-003 — fait immédiatement
Système de lien d'activation de compte entièrement supprimé : `app/activer-compte/`,
`app/api/activer-compte/`, fonctions `lib/users.ts` (`generateSetupToken`,
`userBySetupToken`, `setPasswordViaSetupToken`), colonnes `users.setup_token`/
`setup_token_created_at` (dropées en base — a aussi nettoyé les 2 lignes résiduelles
"david"/"hayat" automatiquement, PAS les comptes eux-mêmes, juste leurs jetons périmés),
fichier `supabase/user_setup_token.sql`. `tsc` propre.

*Source : question I4, réponse "Supprimer maintenant".*
*Statut : FAIT.*

### RÈGLE INTEG-004 (mineure)
`GOOGLE_MOBILE_CALENDAR_ID` (variable orpheline, jamais lue) reste en place, sans
conséquence.

*Source : question I5, réponse "Laisser, sans importance".*
*Statut : décidé, rien à changer.*

### RÈGLE INTEG-005 (mineure)
Le fallback email personnel codé en dur dans `lib/commerciaux.ts` reste en place,
volontaire.

*Source : question I6, réponse "Encore pertinent, garder".*
*Statut : décidé, rien à changer.*

---

## Résumé — ce qui reste EN ATTENTE (pas encore répondu)

- **A1/A2** : qui gagne entre la restriction du call center et l'assignation personnelle
  d'un téléprospecteur quand elles se contredisent (attribution automatique/manuelle du
  commercial à la prise de RDV).
- **I3** : le domaine `simplicicar.store` codé en dur en fallback — encore actif ou pas.

Tout le reste de `PHASE2_QUESTIONS.md` est tranché ci-dessus.
