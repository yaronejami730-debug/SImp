-- Journal de TOUS les messages envoyés (mails + SMS). Preuves irréfutables.
-- À exécuter une fois dans l'éditeur SQL Supabase.
create table if not exists messages (
  id bigserial primary key,
  channel text not null,                 -- email | sms
  direction text not null default 'out', -- out (envoyé) | in (reçu, futur)
  client_key text default '',            -- tél normalisé ou email (lien fiche CRM)
  to_email text default '',
  to_phone text default '',
  client_name text default '',
  owner text default '',                 -- collaborateur
  event_id text default '',              -- id event Google Agenda lié
  template_key text default '',          -- confirmation | reminder24 | reminder2 | parking | sms_confirmation ...
  subject text default '',               -- objet (mail)
  body_html text default '',             -- corps mail rendu
  body_text text default '',             -- corps SMS
  provider text default '',              -- brevo | allmysms
  provider_message_id text default '',   -- messageId Brevo / id AllMySMS (preuve)
  status text not null default 'sent',   -- sent | delivered | opened | error
  origin text not null default 'auto',   -- auto (cron/système) | manual (bouton commercial)
  error text default '',
  sent_at timestamptz not null default now(),
  meta jsonb default '{}'::jsonb
);

-- Sécurité : RLS activé, aucune policy -> l'API REST publique (clé anon) ne peut rien lire/écrire.
-- L'app se connecte en direct (rôle postgres, BYPASSRLS) : non impactée.
alter table messages enable row level security;
alter table messages force row level security;

create index if not exists messages_client_key_idx on messages (client_key, sent_at desc);
create index if not exists messages_event_idx on messages (event_id, sent_at desc);
create index if not exists messages_email_idx on messages (to_email, sent_at desc);
create index if not exists messages_phone_idx on messages (to_phone, sent_at desc);
