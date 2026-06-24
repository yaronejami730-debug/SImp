-- Refonte CRM : rôles simples (super-admin / commercial / téléprospecteur) sur users.
-- Commerciaux et téléprospecteurs = comptes login. Pas de tables annuaire séparées.
-- Additif et rétrocompatible.
alter table users add column if not exists phone text not null default '';
alter table users add column if not exists is_teleprospector boolean not null default false;
alter table users add column if not exists active boolean not null default true;

create index if not exists users_is_teleprospector_idx on users (is_teleprospector) where is_teleprospector;
create index if not exists users_active_idx on users (active);
