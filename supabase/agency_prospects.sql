-- Prospection AGENCE (B2B) : agences/call centers qu'on démarche pour leur apporter de
-- l'acquisition client (à distinguer de la prospection LEAD existante, qui cherche des
-- vendeurs de véhicules). Réservé aux super-admins ; e-mails envoyés au nom de YJ Solutions,
-- jamais mélangés avec les e-mails Simplicicar (RDV clients).
create table if not exists agency_prospects (
  id serial primary key,
  name text not null,
  email text not null,
  phone text not null default '',
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text not null default '',
  last_sent_at timestamptz,
  last_sent_prices jsonb
);
create index if not exists agency_prospects_active_idx on agency_prospects (active);
