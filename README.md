# Prise de rendez-vous — Simplisicar

App simple : tu remplis le formulaire → la réservation est créée
dans **cal.com** + un **mail de confirmation** part via **Brevo**.
Un **cron quotidien** envoie une **relance la veille** du rendez-vous.

Pas de base de données : cal.com sert de stockage des rendez-vous.

## 1. Installer

```bash
npm install
```

## 2. Configurer les variables

Copie `.env.example` en `.env.local` et remplis les valeurs.

### cal.com (API v2)
1. cal.com → **Settings → Developer → API Keys** → crée une clé (préfixe `cal_`) → `CALCOM_API_KEY`.
2. Crée un **Event Type** (durée du RDV, disponibilités). Configure des dispos larges :
   une réservation hors créneau dispo est **refusée** par cal.com.
3. Récupère l'**ID numérique** de cet event type (URL d'édition, ou `GET /v2/event-types`)
   → `CALCOM_EVENT_TYPE_ID`.
4. Les infos client (plateforme, annonce, adresse) sont stockées dans le `metadata`
   de la réservation ; le cron de relance les relit de là.

### Brevo
1. Brevo → SMTP & API → crée une **clé API** → `BREVO_API_KEY`.
2. Vérifie un expéditeur → `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME`.

### IA (Vercel AI Gateway)
- En local : mets une clé dans `AI_GATEWAY_API_KEY`.
- Sur Vercel : géré automatiquement (OIDC), rien à faire.

## 3. Lancer en local

```bash
npm run dev
```

Ouvre http://localhost:3000, remplis le formulaire, clique « Créer le rendez-vous ».

## 4. Déployer

```bash
vercel
```

Ajoute les variables d'env dans le projet Vercel (`vercel env add ...`).
Le cron de relance (`vercel.json`) tourne tous les jours à 8h UTC (~10h Paris)
et envoie un rappel pour chaque rendez-vous du **lendemain**.

## Tester le cron en local

```bash
curl http://localhost:3000/api/cron/reminders
```
