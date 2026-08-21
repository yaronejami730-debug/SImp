-- Cache des recherches véhicule par plaque.
-- Les caractéristiques d'un véhicule ne bougent pas : on garde la réponse du fournisseur
-- pour ne pas repayer une requête à chaque consultation d'une fiche client.

create table if not exists plaque_cache (
  plaque text primary key,
  vehicule jsonb not null,
  created_at timestamptz not null default now()
);
