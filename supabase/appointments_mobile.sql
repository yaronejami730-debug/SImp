-- Rendez-vous EN DÉPLACEMENT (module Jérémy Bonamy). Totalement séparés des RDV physiques.
-- Source de vérité = cette table (dispo, CRM, stats indépendants). Sync best-effort vers Google Agenda.
create table if not exists appointments_mobile (
  id bigserial primary key,
  teleprospecteur text not null default '',   -- qui crée le RDV (email)
  commercial text not null default 'Jeremy Bonamy', -- qui réalise le RDV
  civility text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  car_brand text not null default '',
  car_model text not null default '',
  immatriculation text not null default '',
  address text not null default '',           -- adresse complète du client (déplacement)
  start_datetime timestamptz not null,
  notes text not null default '',
  status text not null default 'booked',       -- prospect | booked | confirmed | done | cancelled
  google_event_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists appt_mobile_start_idx on appointments_mobile (start_datetime);
create index if not exists appt_mobile_status_idx on appointments_mobile (status, start_datetime);

alter table appointments_mobile enable row level security;
alter table appointments_mobile force row level security;
