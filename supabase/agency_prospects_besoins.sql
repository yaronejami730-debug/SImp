-- Lien de questionnaire "cadrage des besoins" par contact d'agence : un token public (dans le
-- mail de prospection) mène à une page /mes-besoins/[token] où le contact répond en quelques
-- clics ; la réponse remonte automatiquement sur sa fiche dans /prospection-agence.
-- Le token est généré côté application (crypto.randomUUID), pas en SQL (évite une dépendance
-- à l'extension pgcrypto).
alter table agency_prospects add column if not exists token text;
create unique index if not exists agency_prospects_token_idx on agency_prospects (token);
alter table agency_prospects add column if not exists needs_answers jsonb;
alter table agency_prospects add column if not exists needs_raw text;
alter table agency_prospects add column if not exists needs_submitted_at timestamptz;
