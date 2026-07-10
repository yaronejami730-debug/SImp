-- Phase 1 : connexion Google par commercial (sync CRM -> son agenda perso).
create table if not exists google_connections (
  user_email    text primary key,
  google_user_id text not null default '',
  gmail         text not null default '',
  calendar_id   text not null default 'primary',
  access_token  text not null default '',   -- chiffré (AES-256-GCM)
  refresh_token text not null default '',   -- chiffré
  token_expiry  timestamptz,
  connected_at  timestamptz not null default now(),
  last_sync_at  timestamptz,
  sync_state    text not null default 'connected'  -- connected | error | revoked
);

-- Mapping RDV CRM <-> copie dans l'agenda perso de l'utilisateur (sync bouton).
create table if not exists google_event_map (
  user_email   text not null,
  crm_event_id text not null,
  g_event_id   text not null,
  updated_at   timestamptz not null default now(),
  primary key (user_email, crm_event_id)
);
