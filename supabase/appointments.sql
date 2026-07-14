-- P1 : les RDV migrent vers Postgres (source de vérité cible). Google Calendar devient miroir.
-- Étape 1 : table + double écriture + backfill + réconciliation pg_cron. Lectures encore sur Google.
create table if not exists appointments (
  google_event_id  text primary key,
  call_center_id   bigint not null default 1,
  start_at         timestamptz,
  end_at           timestamptz,
  first_name text not null default '', last_name text not null default '',
  email text not null default '', phone text not null default '',
  commercial text not null default '', commercial_email text not null default '',
  owner text not null default '', teleprospector text not null default '',
  sign_status text not null default '',
  cancelled boolean not null default false,
  mandat_removed boolean not null default false,
  present text not null default '',            -- '1' présent / '0' absent / '' inconnu
  bc_signed boolean not null default false,
  vehicle_sold boolean not null default false,
  confirmed boolean not null default false,
  deplacement boolean not null default false,
  negotiation numeric not null default 0,
  platform text not null default '',
  car_brand text not null default '', car_model text not null default '',
  immatriculation text not null default '',
  summary text not null default '', location text not null default '',
  props jsonb not null default '{}'::jsonb,    -- extendedProperties.private complet (vérité fine)
  created_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists appt_start_idx on appointments (start_at);
create index if not exists appt_cc_start_idx on appointments (call_center_id, start_at);
create index if not exists appt_owner_idx on appointments (lower(owner));
create index if not exists appt_commercial_idx on appointments (lower(commercial_email));
create index if not exists appt_sign_idx on appointments (sign_status) where not cancelled;
