-- Espace DDE : univers isolé (comptes + rendez-vous), sans lien avec le CRM auto.

create table if not exists dde_users (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  name text not null default '',
  role text not null default 'telepro',   -- 'admin' | 'telepro'
  phone text not null default '',
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists dde_appointments (
  id bigserial primary key,
  nom text not null default '',
  prenom text not null default '',
  rdv_date date not null,
  rdv_time text not null default '',      -- "HH:MM"
  telephone text not null default '',
  telepro_email text not null default '', -- compte dde_users qui a saisi le RDV
  telepro_name text not null default '',
  statut text not null default 'a_venir', -- 'a_venir' | 'confirme' | 'honore' | 'annule' | 'absent'
  notes text not null default '',
  created_at timestamptz default now()
);

create index if not exists dde_appointments_date_idx on dde_appointments (rdv_date desc, rdv_time desc);
create index if not exists dde_appointments_telepro_idx on dde_appointments (lower(telepro_email));
