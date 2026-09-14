# Phase 2 — Questions métier (avant toute Phase 3/4/6)

Issu du scan complet Phase 1 (6 audits read-only en parallèle, rien modifié sauf un fix
mineur signalé en bas de page). Chaque question suit le format : **fait observé (avec
référence fichier)** → **ce qu'il faut trancher**. Rien n'a été jugé bon ou mauvais — la
logique métier existante est traitée comme une spécification, pas comme quelque chose à
améliorer d'office.

Réponds par groupe si tu veux, dans l'ordre que tu préfères — pas besoin de tout traiter
d'un coup. Une fois répondu, chaque réponse devient une règle figée dans `BUSINESS_RULES.md`
(Phase 3), et seulement après ça on touche au code (Phase 4+).

---

## 🔴 Sécurité — à traiter en premier, indépendamment du reste

**S1 — Porte dérobée PIN.** `lib/auth.ts:104-114` : un header `x-pin` égal à
`DASHBOARD_PIN` renvoie une session super-admin complète, sans aucune vérification
d'identité réelle (pas de lookup en base). Équivalent à une clé passe-partout sur TOUTE
l'API pour quiconque connaît le PIN. Accès de secours volontaire à documenter comme tel,
ou reliquat à retirer ?

**S2 — Routes cron qui s'ouvrent si le secret est absent.** `app/api/cron/reminders/
route.ts:32` et `app/api/cron/daily-signature-check/route.ts:33` ne bloquent QUE si
`CRON_SECRET` est défini (`if (process.env.CRON_SECRET && auth !== ...)`) — absent, la
route est ouverte à tous. Les 2 autres routes cron du repo (`dde-rappels`,
`reconcile-appointments`) bloquent, elles, inconditionnellement. Faut-il aligner les 4 sur
le comportement fail-closed ?

**S3 — `/api/users` accessible à un responsable, y compris via la page réservée
super-admin.** `app/api/users/route.ts:14-17` (`requireManager`) accepte `admin` ET
`responsable`. Or `/prospection-agence/comptes` est présentée comme réservée au
super-admin — un responsable qui connaît l'URL peut quand même appeler cette API et
récupérer la liste des comptes de son call center (`/api/callcenters`, lui, resterait
bloqué : la page serait cassée mais pas silencieuse). Faut-il verrouiller `/api/users` en
admin-only dans ce contexte précis, sachant qu'elle sert AUSSI à un responsable pour gérer
son propre call center ailleurs dans le CRM ?

**S4 — Guards de permission non centralisés.** 109 routes API, chacune réimplémente son
propre check (`requireAdmin()` local à `callcenters`, `requireManager()` local à `users`,
la majorité en inline). Deux exemples concrets où ça a déjà dérivé : (a) `ownsOrAdmin()`
redéfinie 4 fois pour la fiche client, avec une variante différente sur 3 des 4 fichiers
(le commercial voit la fiche principale mais pas messages/photos/timeline — voulu ?) ; (b)
le scope d'un responsable diffère entre Agenda (inclut les call centers dont il est
gestionnaire) et Stock (non). Faut-il centraliser dans un seul point (`lib/authz.ts`) —
c'est tout l'objet de la Phase 4 proposée — ou est-ce prématuré tant que ces divergences
n'ont pas été toutes recensées et tranchées une par une d'abord ?

---

## 🟠 Rôles & permissions

**R1 — Deux définitions indépendantes de "gestionnaire".** `isGestionnaireEmail()`
(`lib/callcenters.ts:171`, utilisée par `/api/me` → pilote l'affichage du lien Deal dans
la nav) ne regarde QUE `call_centers.gestionnaire_email`. Mais côté serveur,
`app/api/deals/route.ts:122-125` (qui décide qui peut réellement créer/voir un deal) unit
CE signal ET `users.is_gestionnaire` (le flag réglable dans Comptes → Rôles). Résultat
concret : un compte avec `is_gestionnaire=true` mais jamais "pinné" sur un call center a
les droits serveur pour créer un deal, mais ne voit jamais le lien de navigation vers Deal.
Faut-il aligner `isGestionnaireEmail()` sur les deux signaux, ou est-ce volontairement deux
notions différentes ("gestionnaire pinné sur un CC" vs "flag de rôle gestionnaire") ?

**R2 — `isGestionnaire`/`isAssocie` absents du token JWT.** Contrairement à
`isCommercial`/`isTeleprospector` qui SONT dans le token signé (`lib/auth.ts:21`), ces deux
flags en sont absents — toute route qui en a besoin requête la DB à chaque appel. Volontaire
(flags qui changent plus souvent) ou oubli au moment de leur ajout ?

**R3 — Impersonation sans restriction de cible.** `/api/users/impersonate` vérifie
seulement que l'appelant est admin — aucune vérification sur QUI peut être impersonné.
Un admin peut-il impersonner un autre admin, ou un compte désactivé ? Volontaire (l'admin
peut tout faire) ou faut-il des garde-fous ?

**R4 — Deal personnel d'un responsable qui cumule aussi commercial.** `GET /api/deals`
laisse voir un accord dès que `payer_email`/`payee_email` correspond au compte connecté,
AVANT toute vérification de rôle. Un responsable qui cumule `is_commercial` et a un Deal
personnel comme commercial verrait donc CE deal — pas parce qu'il est responsable
d'agence, mais parce qu'il est personnellement partie au contrat. Voulu (visibilité de ses
propres transactions, indépendante de sa casquette responsable), ou faut-il bloquer ce cas
aussi vu la règle "un administrateur d'agence ne voit pas le Deal" ?

**R5 — Scope `/api/users` GET par call center exact, pas par agence.** `s.role === "admin"
? listUsers() : listUsers(s.callCenterId)` — filtre sur le `call_center_id` EXACT du
responsable, pas sur son agence + call centers enfants. Si un responsable d'agence-racine
doit voir toute SON agence (règle énoncée : "il voit ses téléprospecteurs, ses
collaborateurs"), ce filtre suffit-il, ou un responsable d'agence-racine ne voit-il
aujourd'hui que les comptes directement sur son propre call center, pas ceux de ses call
centers enfants ?

---

## 🟡 Rémunération — Deal vs système à plat vs 3ᵉ système (le plus riche en contradictions)

Contexte : trois mécanismes de calcul de rémunération coexistent dans la base :
1. `users.commission_base`/`commission_pct` (flat par compte, le plus ancien) ;
2. `remuneration_accords` (le Deal, "censé remplacer" le flat dès qu'il existe pour la
   personne) ;
3. `commercial_compensation` (table dédiée à `/api/statistiques`, dont le commentaire de
   migration dit littéralement *"Replaces hardcoded COMMISSION_SCHEMES"* — un remplacement
   du système 1 jamais mené à terme : les trois vivent aujourd'hui en parallèle).

Le Deal ne prime déjà sur le flat que dans "Mes paiements" (`mesRdvDus`) et la vue
commercial de "Mon solde" (fix de cette session). Partout ailleurs, c'est encore l'ancien
flat :

**D1 — "Mon solde" côté téléprospecteur ignore le Deal.** La vue "je reçois" (télépro
consultant son solde) n'utilise que `commission_base/pct`, jamais `remuneration_accords` —
alors que la vue "je paie" (commercial) a été corrigée. Si un gestionnaire a un Deal direct
avec ce téléprospecteur, il voit un montant correct dans "Mes paiements" mais potentiellement
faux dans "Mon solde". Même règle des deux côtés, ou "Mon solde" télépro doit rester sur
l'ancien système pour une autre raison ?

**D2 — `/api/telepro-earnings` (récap admin "combien on doit à chaque télépro") ignore le
Deal.** Même lacune que D1 mais sur le tableau de bord admin. Faut-il l'aligner ?

**D3 — Facturation Abby (`/api/abby/invoice`) ignore le Deal.** Calcule les montants de
facture uniquement via `commission_base/pct`, jamais via le Deal. Une facture émise pour un
commercial sous Deal utiliserait potentiellement le mauvais montant. À corriger, ou la
facturation Abby suit-elle délibérément une autre logique que le Deal ?

**D4 — Fiche RDV individuelle (`/api/client/[id]`) — même angle mort, mais l'écran le plus
consulté.** Affiche "commission due" via `commission_base/pct` uniquement (avec un repli
codé en dur 50€/10% si le compte est introuvable), jamais le Deal. Prioritaire vu sa
visibilité ?

**D5 — Troisième système, `commercial_compensation`, encore vivant ?** Utilisé
uniquement par `/api/statistiques`. Son propre commentaire de migration dit qu'il devait
REMPLACER le système flat — jamais fait. `/api/statistiques` peut donc afficher une
commission différente de celle de `/bilan`, `/paiements` ou `/api/mon-solde` pour la MÊME
personne. Ce troisième système sert-il encore à quelque chose de spécifique à
`/statistiques`, ou est-ce un reliquat de migration à finir ou retirer ?

**D6 — Quelle règle générale figer ?** Vu D1-D4, la question de fond : "le Deal remplace
le flat dès qu'il existe pour la personne" doit-elle devenir une règle UNIFORME appliquée
à TOUS les écrans (solde, récap admin, facturation, fiche RDV, statistiques), ou certains
écrans ont-ils une bonne raison de rester sur l'ancien système que je ne connais pas ?

---

## 🟡 Attribution du commercial (prise de RDV)

Trois mécanismes trouvés, pas toujours cohérents entre eux : (1) restriction du call center
(`callCenterRule`, liste de commerciaux "mis à disposition"), (2) assignation individuelle
par téléprospecteur avec priorité (`telepro_commercials`), (3) l'attribution automatique
(`users.auto_assign`, construite cette session).

**A1 — L'assignation individuelle peut proposer/choisir un commercial hors périmètre du
call center — puis se faire rejeter.** `/api/me` (qui peuple le dropdown) ignore
volontairement la restriction du call center dès qu'un téléprospecteur a une assignation
individuelle (commentaire explicite dans le code : "on cherche dans TOUS les commerciaux
actifs"). L'attribution automatique fait pareil. Résultat : le serveur peut rejeter en 403
("Ce call center ne peut assigner qu'à : ...") un commercial que le client proposait
pourtant lui-même dans son dropdown, ou que l'auto-assign a choisi tout seul. Est-ce voulu
que l'assignation individuelle d'un téléprospecteur prime TOUJOURS sur la restriction du
call center (jamais bloquée), ou la restriction du call center doit-elle rester une limite
absolue qu'aucun des deux autres mécanismes ne peut dépasser ?

**A2 — Découle de A1 : l'auto-assign peut donc échouer à cause d'une règle qu'il ignore
par construction** — ce qui contredit l'intention documentée ("l'attribution automatique ne
doit jamais faire échouer la prise de RDV", qui ne couvre en fait que le cas "conflit
d'horaire", pas celui-ci). Si la réponse à A1 est "la restriction du call center prime",
faut-il que l'auto-assign ne pioche que dans l'INTERSECTION (assignation individuelle ∩
liste du call center) ?

**A3 — Coût de latence de l'auto-assign.** Chaque commercial candidat testé déclenche 2
appels Google Calendar API live et séquentiels. Avec beaucoup de commerciaux en priorité
chez un même téléprospecteur, ça peut ralentir sensiblement la prise de RDV. Volume attendu
faible en pratique, ou faut-il prévoir un plafond / optimiser les appels ?

---

## 🟡 Données — sources de vérité, suppression, schéma

**V1 — Deux familles de RDV, deux sources de vérité opposées.** Les RDV "en agence" ont
Google Calendar comme source de vérité (Postgres en miroir, synchronisé + réconcilié par
cron toutes les 10 min). Les RDV "en déplacement" (module dédié) ont l'INVERSE : Postgres
est la source de vérité, Google Calendar n'est qu'une synchronisation best-effort. Distinction
volontaire et durable entre les deux familles, ou vestige historique (le module déplacement
fait à part, jamais unifié) à harmoniser si on retouche l'architecture ?

**V2 — Miroir Postgres écrit en fire-and-forget.** Chaque écriture Google Calendar pousse
vers Postgres sans attendre la confirmation (pas de `await`) — en cas d'échec, seul un log
serveur le signale, rien ne relance ni n'alerte. Le filet de sécurité (cron de
réconciliation, 10 min) limite la casse. Niveau de risque accepté tel quel, ou faut-il une
alerte/retry plus robuste sur l'échec d'écriture du miroir ?

**V3 — Hard delete d'un compte utilisateur, hors du chemin standard.**
`app/api/my-telepros/route.ts` supprime PHYSIQUEMENT un compte téléprospecteur ("mes
télépros persos", recrutés par un commercial) — seule brèche trouvée dans la convention
stricte "jamais de hard delete sur un compte" appliquée partout ailleurs. Ces comptes
génèrent de vrais RDV (référencés par email en texte libre, pas de FK) — les supprimer
détruit l'identité lisible mais pas l'historique RDV lui-même. Voulu (ces comptes
personnels sont "jetables"), ou à aligner sur le soft-delete standard ?

**V4 — Hard delete d'une ligne de facturation.** `app/api/reglements/route.ts` fait un
vrai `delete from invoices` — alors que le reste du système (conversion des FK cascade→
restrict) insiste explicitement pour ne jamais perdre l'historique de facturation. Dans
quel cas ce endpoint est-il appelé (correction d'une facture pas finalisée, reset
volontaire) — et la ligne doit-elle vraiment disparaître, ou faudrait-il un `active=false`
ici aussi ?

**V5 — `payee_kind = 'associe'` fonctionne par accident.** Le code insère/lit des accords
Deal avec `payee_kind = 'associe'`, mais la contrainte SQL censée limiter les valeurs
possibles ne le liste pas — et, vérifié en base réelle, cette contrainte n'existe en fait
pas du tout (probablement un `create table if not exists` qui n'a jamais pris car la table
existait déjà). Ça marche aujourd'hui uniquement parce que rien ne bloque. Faut-il ajouter
une vraie contrainte qui documente ce qui est réellement accepté, ou la laisser absente
pour rester souple si d'autres valeurs de `payee_kind` arrivent plus tard ?

**V6 — `users` et `leads` sans migration de création tracée.** Comme `remuneration_accords`
avant sa reconstruction défensive, ces deux tables centrales n'ont aucun `create table`
dans le repo — seulement des `alter table` éparpillés sur ~15 fichiers. Rien à corriger
dans l'immédiat (l'app tourne), mais si l'objectif est une vraie "constitution" documentée
du CRM, faut-il aussi reconstruire un schéma canonique explicite pour elles ?

**V7 — RLS activée sur une seule table (`call_centers`), aucune autre.** L'app se connecte
en direct via `pg` (pas via l'API REST Supabase) — selon le rôle de connexion utilisé, cette
RLS peut soit ne servir à rien pour l'app elle-même, soit imposer un filtrage invisible dont
le code applicatif n'a l'air conscient nulle part. Reliquat d'un essai jamais terminé, ou
protection volontaire encore active — auquel cas il faut connaître ses policies avant de
toucher au multi-tenant ?

---

## 🟢 Lead

**L1 — Le pool `leads` et le mini-questionnaire véhicule (sur le RDV) sont deux choses
séparées qui ne se recoupent jamais.** La table `leads` n'a aucun champ véhicule — un lead
converti en RDV ne peut donc rien pré-remplir côté véhicule, contrairement au
mini-questionnaire qui, lui, capture ces infos mais uniquement au moment du RDV. Voulu
(deux étapes différentes du parcours, qui n'ont pas à partager cette donnée), ou faut-il
à terme ajouter les mêmes champs sur `leads` pour que l'info saisie au téléphone survive
jusqu'au RDV ?

**L2 — Lien lead↔rappel absent côté Google Agenda.** `reminders.lead_id` existe en
Postgres, mais jamais écrit dans l'événement Google "rappel téléphonique" — consulter
l'agenda Google directement ne permet pas de retrouver de quel lead vient un rappel. Sans
importance (le lien n'est utile que côté CRM), ou à ajouter par cohérence avec le reste ?

---

## 🟢 Navigation & UI

**N1 — `components/Nav.tsx` est du code mort (0 import dans tout le repo).** Contient
pourtant des règles de visibilité périmées (dont un lien vers `/comptes`, route déjà
supprimée). Supprimable maintenant, ou garder "au cas où" ?

**N2 — Déjà corrigé pendant ce tour** : la règle "un responsable ne voit pas Deal" avait
été appliquée dans `Nav.tsx` (mort, sans effet) au lieu de `components/layout/
navigation.ts:56` (le fichier réellement lu par `Sidebar`, donc par TOUTES les pages du
CRM). Corrigé — plus de lien Deal visible pour un responsable nulle part maintenant.

**N3 — `AppShell` se remonte à chaque navigation, sur les ~24 pages du CRM (pas seulement
YJ Solutions comme supposé au premier audit — c'est systémique).** Aucun `layout.tsx`
porteur de composant n'existe pour garder `AppShell` monté entre deux pages. Séquence à
chaque clic : flash → `/api/me` → (si admin) `/api/callcenters` en série. Introduire un
`layout.tsx` par section pour garder `AppShell` monté une fois — réorganisation technique
de `app/`, sans changement visible pour l'utilisateur — c'est le morceau de Phase 5/6 le
plus impactant sur la lenteur ressentie "partout". Prêt à le programmer en session dédiée
une fois les Phases 2-3 bouclées ?

**N4 — Polices via `<link>` classique, pas `next/font/google`.** Bloque légèrement le
premier rendu. Changement purement technique, sans impact visuel — à faire en Phase 5 avec
le reste perf ?

---

## 🟢 Intégrations & YJ Solutions

**I1 — Emails CRM et YJ Solutions partagent la même adresse d'envoi technique Brevo**
(`BREVO_SENDER_EMAIL`), seul le nom affiché change (confirmé : aucun appel `sendEmail()`
partagé ne vient du code YJ Solutions, qui fait son propre fetch Brevo séparé — le
cloisonnement tient au niveau du code). Le "jamais mélangé" doit-il aller jusqu'à une
adresse d'envoi séparée, ou le nom affiché suffit à ta définition de "ne pas mélanger" ?

**I2 — Rien ne relie automatiquement un questionnaire "besoins" rempli à la création d'une
vraie agence.** Aujourd'hui 100% manuel : le super-admin doit recréer l'agence à la main
dans Comptes après avoir lu les réponses. Voulu à ce stade (décision au cas par cas), ou
faut-il un bouton "Convertir en agence" sur `/prospection-agence/reponses` qui pré-remplit
la création à partir des réponses ?

**I3 — `GOOGLE_REDIRECT_BASE` a un fallback codé en dur vers `https://
www.simplicicar.store`** (3 fichiers), absent de `.env.local`, domaine différent de l'URL
de prod connue (`agenda-rdv.vercel.app`). Domaine encore réellement utilisé, ou reliquat à
mettre à jour ?

**I4 — 2 tokens d'activation de compte résiduels en base** (`users.setup_token`, comptes
"david" et "hayat", créés pendant les tests de la session précédente) — expirés par le TTL
de 72h mais jamais nettoyés. Le système entier (page + route + colonnes) reste dans le repo
malgré ton rejet explicite la dernière fois. Supprimer le code + nettoyer les 2 lignes
maintenant, ou garder "au cas où" comme décidé alors ?

**I5 (mineur)** — `GOOGLE_MOBILE_CALENDAR_ID` définie dans `.env.local` mais jamais lue par
le code : variable orpheline, sans conséquence, à noter.

**I6 (mineur)** — `lib/commerciaux.ts` contient un email personnel codé en dur en fallback
si aucune variable d'environnement n'est définie. À vérifier si ce fallback est encore
pertinent ou à retirer.

---

*Fin Phase 2. Rien n'a été changé suite à ce scan, sauf le fix N2 ci-dessus (correction
d'un oubli de cette session même, pas une décision métier nouvelle). La suite (Phase 3 —
figer tes réponses dans `BUSINESS_RULES.md`) attend tes réponses, groupe par groupe ou en
bloc, comme tu préfères.*
