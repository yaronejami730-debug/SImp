-- Feature "call center" : un responsable gère son équipe de téléprospecteurs,
-- l'admin racine (Yaron, CC 1) assigne les commerciaux visibles par call center.
-- Additif + rétrocompatible : ne touche pas l'existant (CC 1 reste global à Yaron).

-- Un call center peut être limité aux RDV en agence (pas de déplacement).
alter table call_centers add column if not exists agence_only boolean not null default false;
-- E-mail du responsable du call center (référence ; le compte a role='responsable', call_center_id = ce CC).
alter table call_centers add column if not exists responsable_email text not null default '';

-- Commerciaux mis à disposition d'un call center (many-to-many).
-- Un même commercial peut être partagé à plusieurs call centers.
create table if not exists call_center_commercials (
  call_center_id   bigint not null references call_centers(id) on delete cascade,
  commercial_email text   not null,
  created_at       timestamptz not null default now(),
  primary key (call_center_id, commercial_email)
);
create index if not exists ccc_cc_idx on call_center_commercials (call_center_id);

-- Note rôle : le responsable d'un call center N'EST PAS super-admin.
-- Prévoir role='responsable' (admin de SON call_center_id uniquement), distinct de 'admin' (racine).
-- La visibilité des RDV (Google Calendar) doit filtrer sur extendedProperties.private.cc = son call_center_id.

-- White-label par agence : couleurs + logo propres à chaque agence (racine).
alter table call_centers add column if not exists brand_primary text not null default '';
alter table call_centers add column if not exists brand_dark    text not null default '';
alter table call_centers add column if not exists logo_url      text not null default '';

-- Fond du bandeau (header) : clair (défaut) ou foncé, pour la lisibilité des logos clairs.
alter table call_centers add column if not exists header_dark boolean not null default false;

-- Gestionnaire du call : la personne qui a apporté/gère le call center (touche la marge).
alter table call_centers add column if not exists gestionnaire_email text not null default '';
