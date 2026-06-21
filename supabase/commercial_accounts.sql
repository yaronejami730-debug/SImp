-- Phase A : les commerciaux deviennent de vrais comptes utilisateurs.
-- Un user peut être marqué "commercial" (sélectionnable comme exécutant d'un RDV).
-- Additif et rétrocompatible : par défaut false, les comptes existants ne changent pas.
alter table users add column if not exists is_commercial boolean not null default false;

create index if not exists users_is_commercial_idx on users (is_commercial) where is_commercial;

-- E-mail du compte commercial affecté sur un RDV déplacement (lien robuste, en plus du nom).
alter table appointments_mobile add column if not exists commercial_email text not null default '';
create index if not exists appt_mobile_commercial_email_idx on appointments_mobile (commercial_email);
