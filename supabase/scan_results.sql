-- À exécuter une fois dans l'éditeur SQL Supabase.
create table if not exists scan_results (
  id bigserial primary key,
  url text unique not null,
  platform text not null,
  title text,
  price_eur integer,
  km integer,
  year integer,
  brand text,
  location text,
  image_url text,
  is_pro boolean default false,
  email_subject text,
  email_received_at timestamptz default now(),
  dismissed boolean default false,
  created_at timestamptz default now()
);
create index if not exists scan_results_dismissed_idx on scan_results (dismissed, created_at desc);
create index if not exists scan_results_brand_idx on scan_results (brand);
