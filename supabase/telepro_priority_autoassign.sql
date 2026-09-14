-- Priorité d'assignation commercial<->téléprospecteur + mode d'attribution automatique des RDV.
alter table telepro_commercials add column if not exists priority int not null default 0;
alter table users add column if not exists auto_assign boolean not null default false;
