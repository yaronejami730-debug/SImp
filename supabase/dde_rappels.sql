-- Rappels téléphoniques DDE : la personne n'est pas disponible, on planifie un rappel.
-- Table séparée des rendez-vous : un rappel n'est pas un RDV, il ne se facture pas.

create table if not exists dde_callbacks (
  id bigserial primary key,
  nom text not null default '',
  prenom text not null default '',
  telephone text not null default '',
  callback_at timestamptz not null,          -- quand rappeler
  notes text not null default '',
  statut text not null default 'a_faire',    -- 'a_faire' | 'fait' | 'annule'
  telepro_email text not null default '',    -- à qui appartient le rappel
  telepro_name text not null default '',
  saisi_par_email text not null default '',
  saisi_par_name text not null default '',
  done_at timestamptz,
  sms_confirm_at timestamptz,                -- SMS « rappel enregistré »
  sms_24h_at timestamptz,                    -- SMS la veille
  sms_2h_at timestamptz,                     -- SMS 2h avant
  created_at timestamptz default now()
);

create index if not exists dde_callbacks_when_idx on dde_callbacks (callback_at);
create index if not exists dde_callbacks_telepro_idx on dde_callbacks (lower(telepro_email));
create index if not exists dde_callbacks_statut_idx on dde_callbacks (statut, callback_at);
