-- À exécuter une fois dans l'éditeur SQL Supabase (ou via scripts/migrate-estimations.mjs).
create table if not exists estimations (
  id bigserial primary key,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  brand text default '',
  model text default '',
  km integer,
  source text default 'paris-17',
  created_at timestamptz default now()
);
create index if not exists estimations_created_idx on estimations (created_at desc);
