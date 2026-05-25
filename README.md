# Prise de rendez-vous — Simplisicar

App simple : tu colles les infos en vrac → l'IA les découpe → l'événement est créé
dans **Google Agenda** + un **mail de confirmation** part via **Brevo**.
Un **cron quotidien** envoie une **relance la veille** du rendez-vous.

Pas de base de données : l'agenda Google sert de stockage.

## 1. Installer

```bash
npm install
```

## 2. Configurer les variables

Copie `.env.example` en `.env.local` et remplis les valeurs.

### Google Agenda (compte de service)
1. Console Google Cloud → crée un projet → active **Google Calendar API**.
2. Crée un **compte de service**, génère une **clé JSON**.
3. Récupère `client_email` et `private_key` dans le JSON → `GOOGLE_CLIENT_EMAIL` et `GOOGLE_PRIVATE_KEY`.
4. Dans Google Agenda (web) → paramètres de ton agenda → **Partager avec des personnes**
   → ajoute l'e-mail du compte de service avec le droit **« Apporter des modifications aux événements »**.
5. `GOOGLE_CALENDAR_ID` = l'ID de cet agenda (souvent ton adresse Gmail).

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

Ouvre http://localhost:3000, colle un texte, clique « Créer le rendez-vous ».

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
