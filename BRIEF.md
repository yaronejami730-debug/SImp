# Brief complet — Simplicicar RDV (CRM) + YJ Solutions

Document généré pour reprendre le fil de tout ce qui a été construit. Écrit pour être collé
tel quel dans un autre outil (ChatGPT etc.) qui n'a aucun contexte préalable.

---

## 1. C'est quoi, globalement

Une seule application Next.js (App Router, TypeScript), déployée sur Vercel, appelée en interne
"Simplicicar RDV". Elle sert DEUX métiers complètement différents, volontairement cloisonnés
dans le même code :

1. **Le CRM Simplicicar** : gestion des rendez-vous d'achat de véhicules (prise de RDV,
   agenda, prospection/lead, paiements des commerciaux et téléprospecteurs, bilan, stock).
   C'est l'usage quotidien de toutes les agences ("franchises") qui tournent sous la marque
   Simplicicar (ou sous marque blanche — voir §4).

2. **YJ Solutions** : un module de démarchage B2B, séparé, pour PROSPECTER des agences
   automobiles/concessions qui ne sont PAS encore clientes — leur proposer de rejoindre le
   réseau Simplicicar (ou un mode "lead-pur"). Ce n'est pas le même produit, pas la même
   marque visible, pas le même public. Techniquement dans le même repo/déploiement, mais
   avec sa propre charte (bleu marine/rouge), son propre logo, son propre espace dans l'UI.

Base de données : Postgres (Supabase), accès via le module `pg` (`lib/db.ts`, `getPool()`).
Authentification : JWT maison signé/vérifié dans `lib/auth.ts`, porté dans le header
`Authorization` (pas de cookies de session pour l'API — sauf pour le multi-tenant, voir §4).
Emails transactionnels : Brevo (`lib/brevo.ts` pour le CRM, `lib/yj-prospection.ts` séparé
pour YJ Solutions — volontairement deux systèmes qui ne se mélangent jamais, sender différent).
SMS : AllMySms (`lib/allmysms.ts`). Stockage fichiers (logos, photos véhicule) : Vercel Blob.
Source de vérité des RDV : Google Calendar (voir §5), mirroré dans Postgres pour la vitesse
de lecture (table `appointments`, flag `READ_APPTS_FROM_DB`).

---

## 2. Les comptes et les rôles

### 2.1 Le modèle technique (table `users`)

Chaque compte a :
- un `role` unique parmi `admin` | `responsable` | `collab` (colonne SQL, un seul choix) ;
- des FLAGS cumulables, indépendants du `role` : `is_commercial`, `is_teleprospector`,
  `is_gestionnaire`, `is_associe`. Un même compte peut cumuler plusieurs flags (ex : quelqu'un
  peut être à la fois téléprospecteur ET commercial ET gestionnaire).
- `call_center_id` : le call center/agence de rattachement.
- `active` (soft-delete — voir §9) et `deleted_at`.
- `auto_assign` (nouveau) : pour un téléprospecteur, active l'attribution automatique du
  commercial à la prise de RDV (voir §5.4).

### 2.2 Le modèle métier (comment le client pense les rôles — important, ce n'est PAS 1:1 avec
le champ `role` SQL)

- **Super-administrateur** (`role = admin`) : c'est YJ Solutions. Voit tout, sans exception :
  toutes les agences, tous les call centers, tous les téléprospecteurs, gestionnaires,
  associés, administrateurs d'agence. C'est LUI qui crée les comptes, gère l'organisation, et
  c'est LUI SEUL qui crée/voit la partie **Deal** (rémunération — voir §7). Un administrateur
  d'agence ne voit PAS le Deal, même en lecture (règle changée récemment — avant, il y avait un
  accès lecture seule pour le responsable, retiré à la demande explicite : "ils ne peuvent pas
  la voir, c'est le super administrateur qui crée le deal").

- **Administrateur d'agence** (`role = responsable`, malgré le nom SQL) : c'est le "patron"
  d'une agence/franchise précise. Il ne voit QUE son agence : ses téléprospecteurs, ses
  collaborateurs, son gestionnaire. Il peut créer des téléprospecteurs dans son propre call
  center. Il NE VOIT PAS le Deal (voir ci-dessus). Son levier de rémunération, c'est le mode
  "Deal € par téléprospecteur" quand `telepro_pay_mode = "responsable"` (voir §7.4).

- **Gestionnaire** (`is_gestionnaire = true`, rôle cumulable, PAS un `role` SQL à part) :
  l'apporteur d'affaires. Négocie et POSSÈDE ses propres Deals (toujours en son nom, jamais au
  nom d'un autre gestionnaire — sauf le super-admin qui peut tout faire). C'est lui qui "vend"
  des rendez-vous à un commercial ; il touche sa part sur chaque dossier.

- **Associé** (`is_associe = true`, cumulable) : partage un bénéfice sur des deals, identité
  "libre" comme le gestionnaire (pas de rattachement organisationnel à la création).

- **Commercial** (`is_commercial = true`, cumulable) : reçoit les RDV, les honore, signe (ou
  pas) le client.

- **Téléprospecteur** (`is_teleprospector = true`, cumulable) : prend les RDV pour le compte
  d'un ou plusieurs commerciaux (crée le RDV dans le système).

### 2.3 Droits d'accès résumés (table de vérité)

| Qui                     | Voit                                                    | Deal (rémunération) |
|-------------------------|----------------------------------------------------------|----------------------|
| Super-admin              | tout, toutes agences                                     | crée + voit tout     |
| Administrateur d'agence  | sa propre agence uniquement (ses télépros, ses comptes)  | rien, même pas en lecture |
| Gestionnaire             | ce qui le concerne (ses deals, ses commerciaux)          | crée/voit SES deals uniquement |
| Commercial               | ses propres RDV/paiements                                | voit ce qui le paie/qu'il paie (bandeau "Mon deal") |
| Téléprospecteur          | ses propres RDV créés, ses commerciaux assignés          | idem commercial |

---

## 3. Organisation : agences, call centers, hiérarchie

Table `call_centers` : chaque ligne peut être une AGENCE (racine, `parent_id = null`) ou un
CALL CENTER rattaché à une agence (`parent_id` pointe vers l'agence). Une agence peut avoir
plusieurs call centers enfants. Champs notables :
- `slug` : identifiant d'URL unique, auto-généré à la création (`slugify()`/`uniqueSlug()`
  dans `lib/callcenters.ts`), sert au multi-tenant (§4).
- `brand_primary`, `brand_dark`, `logo_url`, `header_dark` : thème visuel (couleurs marque
  blanche) — voir §10.3 pour l'aperçu live.
- `responsable_email` / `responsable_email_2` : le(s) administrateur(s) d'agence.
- `gestionnaire_email` : le gestionnaire par défaut du call center.
- `telepro_pay_mode` : `"gestionnaire"` ou `"responsable"` — qui gère la paie des télépros
  de ce call center par défaut.
- `active` / `deleted_at` : soft-delete (voir §9).

Un call center hérite en cascade de son agence parente pour certaines règles (ex : commerciaux
visibles) — voir `commercialsForCallCenterInherited`, `ancestryMap()` dans `lib/callcenters.ts`.

---

## 4. Multi-tenant par slug (URL propre à chaque agence)

Chaque agence (et chaque call center) a une URL permanente : `agenda-rdv.vercel.app/<slug>/...`.
Visiter cette URL change automatiquement le branding (logo/couleurs) ET filtre les données
vues, SANS reconnexion, SANS compte séparé — même identifiants partout.

Mécanique (`middleware.ts`, racine du projet) :
- Le middleware intercepte chaque requête, regarde le premier segment d'URL (`/simplicicar-
  paris-17e/agenda` → segment `simplicicar-paris-17e`).
- Si ce segment correspond à un slug connu (résolu via `GET /api/agence-slug/[slug]`, car le
  runtime edge du middleware n'a pas d'accès direct à Postgres), il RÉÉCRIT (`rewrite`, pas
  `redirect`) l'URL vers la page normale (`/agenda`) et pose 3 cookies : `agence_slug`,
  `agence_cc_id`, `agence_theme`.
- Cache en mémoire (par instance) des résolutions slug→callCenter, TTL 6h (relevé récemment
  depuis 5 min — c'était trop court, quasi toujours un aller-retour réseau à chaque navigation
  vu que le cache est par instance edge).

Filtrage des données : `lib/agence-scope.ts` → `agenceScopeCcIds(req)` calcule, à partir du
cookie `agence_cc_id`, la liste des call center IDs visibles (le call center + tous ses
descendants). Cette liste est intersectée avec le filtrage par rôle déjà existant (jamais un
élargissement, seulement un rétrécissement). Branché dans : `/api/appointments`,
`/api/statistiques`, `/api/stock`, `/api/users` (GET). PAS ENCORE branché dans : paiements,
baremes/deals, prospection, templates, avis-admin, recherche-rdv, mon-solde, bilan (travail
identifié, pas fait — à reprendre si besoin).

Même le SUPER-ADMIN navigue toujours "sous" un slug (règle explicite du client : "je dois
avoir toujours la base pour savoir dans quelle agence je me trouve"). Un sélecteur d'agence
dans le header (`AppShell.tsx`, admin uniquement) permet de changer de contexte
(`localStorage agence_slug_pref`). `/api/me` renvoie `agenceSlug` pour tout le monde
(calculé via `slugForCallCenter(callCenterId)`).

---

## 5. Prise de RDV (le cœur du produit) — `app/simplicicar/page.tsx`

### 5.1 Formulaire

Champs : civilité (M./Mme — **plus pré-coché par défaut**, choix obligatoire avant envoi),
identité client, téléphone (français mobile uniquement, 06/07 — normalisation automatique des
formats +33/0033 vers 0X via `normalizeFrenchPhone()` dans `lib/parse.ts`), source de
l'annonce OU mini-questionnaire lead (voir 5.2), véhicule (marque/modèle/finition via
`VehiclePicker`, photos), type de RDV (agence/déplacement), commercial assigné (ou automatique,
voir 5.4), créneau (`SlotPicker`).

Le bandeau d'avertissement "numéro fixe/passerelle" a été retiré du formulaire (le client ne
voulait plus le voir) — la RÈGLE elle-même reste appliquée côté serveur (refus des 01/03/04/05).

### 5.2 Lead vs annonce

Toggle admin "Ce client est un lead" (`form.isLead`). Si lead : mini-questionnaire déclaratif
(pas d'annonce en ligne) :
- Année de mise en circulation, kilométrage, boîte (manuelle/automatique).
- Entretiens à jour (oui/non) — si non : combien reste-t-il à faire (1/2/3+).
- Habitacle propre (oui/non) — si non : message "passez un coup d'aspirateur" affiché à
  l'utilisateur (pas stocké, juste un rappel visuel).
- Vices cachés suspectés (oui/non).
- Plaque d'immatriculation (facultatif) → composant `PlaqueLookup` (`components/
  PlaqueLookup.tsx`), interroge `/api/plaque?plaque=...` (`lib/plaque.ts`) qui appelle un
  fournisseur SIV externe configuré via `PLAQUE_API_URL`/`PLAQUE_API_KEY` (avec cache DB par
  plaque pour ne pas reconsommer le quota). Le bouton "Reprendre dans la fiche" copie marque/
  modèle/finition/année/km/boîte automatiquement dans le formulaire.

Si PAS lead : lien de l'annonce + plateforme (LeBonCoin par défaut désormais — avant "Autre" ;
LaCentrale, Autre en option), avec aperçu de l'annonce (titre/image, via `/api/preview`).

Sur Google Agenda, le mot "Lead" n'apparaît JAMAIS dans la description (seulement les
caractéristiques factuelles, via `leadCaracteristiques()` dans `lib/google.ts`) — c'est une
règle explicite : la catégorisation lead/annonce reste interne au CRM, Google Agenda ne montre
que des faits.

### 5.3 Google Calendar = source de vérité, Postgres = miroir

Chaque RDV est un événement Google Calendar. Toutes les données métier (civilité, plaque,
statut de signature, etc.) sont stockées dans `extendedProperties.private` de l'événement (une
map clé/valeur texte). `lib/google.ts` contient toutes les fonctions de lecture/écriture :
`createEvent()`, `listAppointments()`, et plusieurs `patch*()` ciblés (`patchTracking`,
`patchVehicle`, `patchNote`, `patchClientName`, `patchContact`, `patchCommercial`,
`patchApptDetails`, `patchInvoicing`, `patchLeadFlag` — ce dernier ajouté pour re-tagger un RDV
"lead" après coup). Chaque écriture Google est en même temps répercutée dans la table Postgres
`appointments` (miroir, pour la vitesse de lecture côté dashboards) — flag d'env
`READ_APPTS_FROM_DB` pour lire depuis Postgres plutôt que l'API Google en direct. **Point non
vérifié : si ce flag n'est pas positionné en production Vercel, tout le monde tape l'API Google
en direct = lent. À vérifier côté Vercel (pas d'accès MCP pour le confirmer depuis ici).**

### 5.4 Attribution du commercial — manuel ou automatique

Un téléprospecteur peut avoir une liste de commerciaux qui lui sont assignés (table
`telepro_commercials`, `telepro_email` + `commercial_email` + `priority`). Gérée depuis
Comptes → fiche du téléprospecteur → modal "Assigner des commerciaux" (checkbox + priorité
1/2/3 par commercial).

Deux modes (flag `users.auto_assign`) :
- **Manuel** (par défaut) : le téléprospecteur choisit lui-même dans sa liste, au moment de
  la prise de RDV (dropdown classique).
- **Automatique** : le dropdown est masqué ("🤖 Attribution automatique"), et **le serveur**
  (`/api/appointment` POST) choisit tout seul, dans l'ordre de priorité, le premier commercial
  SANS conflit d'horaire (vérifié via `commercialConflict()` et `halfDayModalityBlocked()` —
  les mêmes règles que pour un choix manuel). Si tous les commerciaux assignés sont occupés au
  créneau demandé, le RDV part quand même avec le n°1 en priorité, avec un avertissement
  (`commercialWarning`) plutôt qu'un blocage — l'attribution auto ne doit jamais faire échouer
  la prise de RDV.

---

## 6. Le système "Lead" (rebaptisé — avant "Prospection") — `app/prospection/page.tsx`

Un pool de leads (prospects à rappeler) par call center, table `leads`
(`phone`, `listing_url`, `note`, `lead_ref` — format `SP-2026-NNN`, `first_name`, `last_name`,
`email`, `campaign`, `raw_data` jsonb, `status`). PAS de dispatch nominatif par
téléprospecteur — un pool partagé, pas d'assignation automatique (gap connu, jamais construit).

Fonctionnalités :
- Ajout manuel (téléphone + lien + note).
- Import en masse : collage de lignes tolérant (virgule/point-virgule/tabulation), OU import
  CSV avec détection intelligente des colonnes (par mot-clé d'en-tête, ou par contenu si aucun
  en-tête reconnu — ex. deviner la colonne téléphone si 60%+ des valeurs ressemblent à un
  numéro).
- Recherche par numéro (même partiel), avec debounce.
- Statuts d'appel : nouveau, absent, ne répond pas, faux numéro, NRP1/2/3, RDV pris — choisi
  par menu déroulant sur chaque carte lead.
- Conversion en RDV : bouton "Prendre rendez-vous" → redirige vers `/simplicicar` avec les
  infos du lead pré-remplies EN PARAMÈTRES D'URL (`firstName`, `lastName`, `email`, `phone`,
  `listingUrl`, et maintenant **`isLead=1`** — le formulaire de prise de RDV bascule
  automatiquement en mode "lead" sans que l'utilisateur ait à cocher quoi que ce soit). Le
  statut passe à "rdv_pris" au clic (optimiste, `keepalive: true` pour survivre à la
  navigation).
- Conversion en "rappel téléphonique" (RDV différé, pas encore un vrai RDV client) : crée une
  entrée dans `reminders`, le lead est retiré du pool.
- Fiche détail d'un lead : toutes les données brutes importées (CSV complet), historique.
- Le badge de référence (`SP-2026-NNN`) a été retiré de l'affichage (gardé en base, juste
  invisible côté UI — le client ne voulait plus le voir).

**Tag rétroactif "lead" fait pendant cette session** : 7 RDV créés AVANT l'existence du bouton
"lead" ont été identifiés par recoupement de nom (dictée vocale approximative du client,
recoupée avec la base) et marqués `isLead=1` + `platform=Lead` (Google Calendar + miroir
Postgres) via une nouvelle fonction `patchLeadFlag()` : Luc Monnier, Larkem, Hocine Dumoulin,
Mohamed Chtioui, Achour Ait Si Amer, Mehdi Brahim, Kacem Haddad. Objectif : calculer un taux de
signature par lead/par commercial (pas encore construit comme dashboard, juste les données sont
maintenant correctement taguées).

---

## 7. Deal — moteur de rémunération (`remuneration_accords`, `lib/remuneration.ts`,
`app/api/deals/route.ts`, `app/baremes/page.tsx`)

### 7.1 Logique métier

Un Deal se négocie TOUJOURS entre un GESTIONNAIRE et un COMMERCIAL : le gestionnaire "vend" des
rendez-vous au commercial, qui est son client. Le gestionnaire touche sa part sur chaque
dossier. Ensuite, deux façons de rémunérer le travail de PROSPECTION (téléprospection)
derrière :
1. Le call center prend une part et son responsable redistribue LUI-MÊME en interne à ses
   téléprospecteurs (le gestionnaire ne s'en mêle pas, ce n'est pas suivi dans le Deal).
2. Le gestionnaire a négocié DIRECT avec un téléprospecteur précis — c'est le gestionnaire qui
   le paie sur sa propre part (le télépro peut même être le gestionnaire lui-même, rôles
   cumulables).

### 7.2 Modèle de données (`Accord` dans `lib/remuneration.ts`)

Champs clés : `payer_email`, `payee_email`, `payee_kind` (call_center | gestionnaire | telepro |
apporteur | associe), `call_center_id` (scope), `commercial_email` (scope), `base_eur`
(montant fixe), `pct_nego` (% du négocié), `sold_eur`/`sold_pct` (à la vente/signature),
`sold_pct_base` (`"negocie"` ou `"plusvalue"` — nouveau : permet un accord "10% de la
PLUS-VALUE" c-à-d prix de vente moins prix de départ de l'annonce (`askingPrice`), pas 10% du
prix négocié total), `trigger_kind` (signed/honored), `payment_method`, `payment_delay_days`,
`includes_descendants` (portée agence entière, pas juste un call center précis), `deal_name`
(libellé libre), `active`.

### 7.3 Qui peut créer/voir (voir aussi §2.3)

- Super-admin : tout.
- Gestionnaire : ses propres deals uniquement, jamais au nom d'un autre.
- Responsable de call center : **RIEN** (changé cette session — avant lecture seule via
  `responsable_email`/`responsable_email_2`, complètement retiré).
- Commercial/téléprospecteur : voient un bandeau "Mon deal" (lecture, ce qui les concerne
  personnellement en tant que payer/payee), via `/api/deals` GET filtré sur leur email.

### 7.4 "Deal € — téléprospecteurs" (`/api/deal-telepro`)

Un taux plat par téléprospecteur (€ fixe/RDV signé + % négo), séparé du moteur d'accords
générique ci-dessus — c'est le levier du RESPONSABLE de call center pour rémunérer SES
téléprospecteurs quand `telepro_pay_mode = "responsable"`.

---

## 8. Paiements / Bilan / Statistiques

- `/paiements` ("Mes paiements") : ce que voit un commercial/téléprospecteur de ce qui lui est
  dû. Ledger réel par RDV (`mesRdvDus` dans `/api/deals` GET) — construit cette session pour
  remplacer une simple phrase statique par un vrai calcul ligne à ligne.
- `/api/mon-solde` : priorise le moteur Deal (accords) sur l'ancien système plat
  `commission_base/pct` quand des accords Deal existent pour le payeur — bug corrigé cette
  session (affichait le mauvais montant, 50€ au lieu de 100€, en ignorant le Deal).
- `/bilan`, `/statistiques` : agrégations RDV signés/facturés, filtrage par rôle + call center.

---

## 9. Conventions transverses importantes

- **Jamais de hard delete** sur les comptes/call centers/deals : toujours `active = false` +
  `deleted_at = now()`. L'historique de facturation doit rester résoluble indéfiniment. Un
  compte "supprimé" disparaît des LISTES ACTIVES (masqué par défaut dans Comptes, toggle
  "Afficher les comptes désactivés" pour le revoir) mais reste dans les données historiques
  (bilan, factures) avec éventuellement un badge "(supprimé)".
- **Postgres bigint → string** : `pg` renvoie les IDs numériques en string ; il faut caster en
  `Number()` explicitement avant toute comparaison stricte ou clé de Map (pattern `castIds()`
  dans plusieurs fichiers) — sinon des bugs silencieux de filtrage (ex : "commercial listé sans
  agence").
- **Pas de commit git automatique** : rien n'est commité sauf demande explicite (tout le
  travail de cette session est non commité, `git status` montre un gros diff).

---

## 10. Comptes & organisation — UI (`app/prospection-agence/comptes/page.tsx`, ~1100 lignes)

Page de gestion complète : arborescence agences → call centers (colonne gauche), fiche détail
+ liste des comptes (colonne droite). Réservée au SUPER-ADMIN uniquement (déplacée depuis
l'admin Simplicicar vers l'espace YJ Solutions cette session — voir §11).

### 10.1 Rôles — modal (pas des boutons inline)

Avant : rangée de boutons toggle inline sous chaque compte (Commercial/Téléprospecteur/
Gestionnaire/Associé + Désactiver), redondant avec les badges déjà affichés en haut de la
carte → trop chargé visuellement (retour direct du client avec capture d'écran). Remplacé par
un bouton unique "Rôles" ouvrant un modal propre (checkbox + description par rôle), avec le
bouton Désactiver/Réactiver dedans plutôt que sur la carte.

### 10.2 Assignation commerciaux — modal avec priorité + auto-assign

Idem, remplacé un mur de boutons "tous les commerciaux" par un bouton "Assigner des
commerciaux" ouvrant un modal : checkbox par commercial (de l'agence), champ priorité
numérique si coché, + toggle "🤖 Attribution automatique" (voir §5.4).

### 10.3 Couleurs de marque — aperçu live avec la VRAIE Sidebar

Dans les Réglages d'une agence : deux color-pickers (Accent, Foncé) + un aperçu qui utilise
**le vrai composant `Sidebar`** (`components/layout/Sidebar.tsx`, celui utilisé partout dans le
CRM), pas une maquette approximative. Les couleurs choisies sont injectées comme variables CSS
(`--brand-primary`, `--brand-dark`) SCOPÉES au conteneur de l'aperçu (pas au thème global tant
que "Enregistrer" n'est pas cliqué) — donc l'aperçu est pixel-perfect avec le résultat réel,
et se met à jour en direct pendant qu'on bouge les pickers. Ces mêmes variables CSS pilotent
aussi TOUS les boutons "actifs" du CRM (ex : le toggle M./Mme dans la prise de RDV utilise déjà
`var(--brand-primary)`) — donc changer la couleur d'une agence change vraiment tout, de façon
cohérente, sans code dupliqué.

### 10.4 Commerciaux liés (Réglages d'un call center) — bug corrigé

Avant : une liste plate de TOUS les commerciaux du système entier (toutes agences confondues)
affichée comme des boutons "+ Nom" — en éditant les réglages d'"Agence Automobilière Annemasse"
on voyait apparaître les commerciaux de Simplicicar Paris, aucun sens. Remplacé par : chips des
liens externes déjà actifs (commercial d'une AUTRE agence explicitement lié à celle-ci, cas
rare), + un bouton "Lier un commercial d'une autre agence" ouvrant une recherche par nom avec
l'agence d'origine affichée à côté de chaque résultat (pour éviter toute confusion).

### 10.5 Email automatique à la création de compte

Case à cocher "Envoyer un mail avec l'identifiant et le mot de passe" sur les 3 formulaires de
création (super-admin, responsable de call center, générique). Si cochée + email réel fourni
(pas le placeholder auto `xxx@no-mail.local`) : envoi d'un mail HTML minimaliste (pas de logo,
pas de couleur — volontairement sobre, `lib/account-email.ts`), sujet "Activer votre compte",
contenu : bonjour + nom, agence, lien de connexion PERMANENT (l'URL du slug de l'agence, PAS un
lien à usage unique), identifiant + mot de passe en clair dans le mail (puisque c'est
l'admin qui choisit le mot de passe directement, pas un flow d'auto-inscription).

**Historique important sur ce point** : une première version envisageait un système de "lien
d'activation" à token unique/expirant (`/activer-compte/[token]`, colonnes `setup_token` sur
`users`) où la personne choisit elle-même son mot de passe. Construit et testé de bout en bout,
puis **explicitement rejeté par le client** ("je veux pas un lien temporaire de quoi que ce
soit") — remplacé par le lien permanent de l'agence + mot de passe imposé par l'admin. Le code
du token d'activation existe toujours dans le repo (`app/activer-compte/`,
`app/api/activer-compte/`) mais n'est branché nulle part — laissé en place au cas où, pas
supprimé.

---

## 11. YJ Solutions — espace séparé (prospection B2B)

### 11.1 Pourquoi c'est séparé

Démarcher des agences PAS encore clientes, sous une marque et un ton différents de Simplicicar
(navy `#12203a` + rouge `#c21f2c`, logo différent hébergé sur Vercel Blob). Règle explicite du
client : "on ne va pas mélanger" — le super-admin choisit, après connexion, dans quel espace il
navigue ("Quel espace ?" — CRM Simplicicar ou Prospection agences), persisté en
`sessionStorage.yj_espace`. Réservé au super-admin uniquement.

### 11.2 Structure

- `/prospection-agence` : liste des agences prospectées (contacts).
- `/prospection-agence/propositions` : emails de proposition envoyés.
- `/prospection-agence/reponses` : réponses reçues.
- `/prospection-agence/comptes` : gestion complète des comptes/organisation (voir §10) —
  déplacée ici depuis l'admin Simplicicar cette session (comportement changé : les responsables
  d'agence n'ont plus d'auto-gestion de leurs comptes, seul le super-admin gère — flag connu,
  pas encore reconfirmé par le client).

Interface : `EspaceAgenceShell.tsx`, réutilise le vrai composant `Sidebar` (généralisé avec un
prop `groupes` pour remplacer la navigation Simplicicar par défaut) + un sélecteur de palette
de couleurs (4 presets : YJ par défaut, Noir&blanc, Rouge&vert, Bleu nuit), scopé en CSS,
n'affecte jamais le thème global Simplicicar.

### 11.3 Email de prospection (`lib/yj-prospection.ts`)

Texte final VERBATIM validé par le client après plusieurs itérations (ton personnel, police
serif, tableaux, pas de badges/cartes). Sender toujours "Nom du signataire — YJ Solutions",
jamais le nom/branding Simplicicar. CTA vers le formulaire de besoins (§11.4).

### 11.4 Formulaire "besoins" public (`/agence-mes-besoins/[token]`)

Questionnaire en 8 sections (société, ce que vous recherchez, volume souhaité, vendeurs/
acheteurs, zone et véhicules, organisation des RDV, transaction et encaissement, facturation et
démarrage) avec champs conditionnels (`showIf`). Sécurité (demandée explicitement, en détail) :
- Verrouillage par appareil : premier clic sur le lien = verrouille une session à CE navigateur
  via cookie nommé `yj_besoins_<token>` (bug corrigé : le cookie était scopé au chemin de la
  PAGE au lieu du chemin de l'API réellement appelée — jamais envoyé, donc jamais reconnu).
- Expiration 72h.
- Bouton self-service "Régénérer le lien" si expiré/déjà utilisé ailleurs.
- Consentement RGPD obligatoire avant soumission (case à cocher, texte sur la sécurité des
  données, aucun partage à un tiers).
Design : même système de composants que le CRM (`components/ui`), pas un look bricolé à part —
demande explicite répétée du client.

---

## 12. Ce qui reste identifié mais PAS fait (dette/backlog connu)

- `agenceScopeCcIds` pas branché dans : paiements, baremes/deals, prospection, templates,
  avis-admin, recherche-rdv, mon-solde, bilan (filtrage multi-tenant incomplet sur ces pages).
- Pas de dispatch nominatif des leads (pool partagé, pas d'assignation automatique par
  téléprospecteur) — identifié comme la plus grosse pièce manquante côté "Lead", jamais cadré.
- Stock (`/api/stock`) ne consulte pas la délégation temporaire active (vacances) comme le fait
  déjà `/api/availability` — petit correctif ciblé, jamais fait.
- Pas de rappel automatique jours fériés/ponts pour inciter à mettre à jour ses disponibilités
  ou déléguer — rien construit.
- Système de leads (`/prospection`, table `leads`) n'a AUCUN champ véhicule — donc convertir un
  lead existant en RDV ne peut rien pré-remplir côté véhicule (contrairement au nouveau
  mini-questionnaire lead qui, lui, capture ces infos à la source).
- Vérifier `READ_APPTS_FROM_DB=1` en production Vercel (voir §5.3) — impact potentiel fort sur
  la vitesse perçue de tout le CRM (agenda/bilan/statistiques), pas vérifiable depuis cette
  session (pas d'accès Vercel MCP autorisé sur ce compte/projet).
- AppShell (utilisé par l'espace YJ Solutions) se remonte entièrement à CHAQUE navigation (pas
  de layout Next.js partagé, chaque page ré-enveloppe manuellement) — cause un flash + des
  requêtes `/api/me` + `/api/callcenters` répétées à chaque clic. Identifié comme la plus
  grosse source de lenteur perçue "partout", refactor pas fait (risqué, touche potentiellement
  toutes les pages) — à faire en session dédiée.
- Le CRM Simplicicar principal (agenda, simplicicar, bilan, paiements, statistiques, baremes)
  tourne encore sur l'ANCIEN système de navigation (`components/Shell.tsx` + `components/
  Nav.tsx`), pas sur le nouveau (`AppShell.tsx` + `components/layout/Sidebar.tsx` +
  `navigation.ts`) utilisé par l'espace YJ Solutions / Comptes. Les deux systèmes de nav
  coexistent dans le repo — à garder en tête pour ne pas modifier le mauvais fichier en pensant
  changer la nav visible (piège rencontré cette session : modifier `navigation.ts` n'a AUCUN
  effet sur les pages qui utilisent encore `Shell`/`Nav.tsx`).

---

## 13. Repères fichiers utiles (pour retrouver vite)

- Auth/JWT : `lib/auth.ts`
- DB pool : `lib/db.ts`
- Comptes : `lib/users.ts`, `app/api/users/route.ts`
- Organisation (agences/call centers) : `lib/callcenters.ts`, `app/api/callcenters/route.ts`
- Deal/rémunération : `lib/remuneration.ts`, `app/api/deals/route.ts`, `app/baremes/page.tsx`
- RDV/Google Calendar : `lib/google.ts`, `lib/parse.ts`, `app/api/appointment/route.ts`
- Lead (ex-Prospection) : `lib/leads.ts`, `app/api/leads/route.ts`, `app/prospection/page.tsx`
- Multi-tenant slug : `middleware.ts`, `lib/agence.ts`, `lib/agence-scope.ts`
- Emails CRM : `lib/brevo.ts`, `lib/email-templates.ts`, `lib/account-email.ts`
- Emails YJ Solutions : `lib/yj-prospection.ts`
- Navigation ANCIENNE (live sur tout le CRM principal) : `components/Shell.tsx`,
  `components/Nav.tsx`
- Navigation NOUVELLE (live sur YJ Solutions / Comptes uniquement) : `components/layout/
  AppShell.tsx`, `components/layout/Sidebar.tsx`, `components/layout/navigation.ts`
- Plaque/SIV : `lib/plaque.ts`, `components/PlaqueLookup.tsx`, `app/api/plaque/route.ts`

---

*Fin du brief. Rien dans ce document n'est inventé — tout correspond à du code réellement
présent dans le repo à la date de rédaction, vérifié pendant la session (lecture de fichiers,
pas de suppositions sur des noms de fonctions/colonnes non vus).*
