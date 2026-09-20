-- Partenaires du module Formation (ex : "SimpliciCar Paris 17") — liste éditable
-- depuis l'admin, jamais codée en dur dans le code.
create table if not exists formation_partners (
  id bigserial primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
