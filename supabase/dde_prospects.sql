-- Fichier d'appel DDE : prospects repris du CRM d'origine.
-- Un prospect n'est pas un rendez-vous : on l'appelle, on note un statut (NRP, à rappeler…),
-- et s'il accepte on crée un rendez-vous depuis sa fiche (les coordonnées sont déjà connues).

create table if not exists dde_prospects (
  id bigserial primary key,
  crm_id text unique,                       -- identifiant dans le CRM d'origine : l'import est rejouable

  nom text not null default '',
  prenom text not null default '',
  telephone text not null default '',
  telephone_2 text not null default '',
  email text not null default '',
  adresse text not null default '',
  code_postal text not null default '',
  ville text not null default '',
  departement text not null default '',

  -- Travail de la téléprospectrice
  statut text not null default 'nouveau',   -- voir DDE_PROSPECT_STATUTS (lib/dde-prospects.ts)
  telepro_email text not null default '',   -- à qui appartient le prospect
  telepro_name text not null default '',
  notes text not null default '',           -- commentaire saisi pendant les appels
  appels int not null default 0,
  dernier_appel_at timestamptz,
  rdv_id bigint,                            -- rendez-vous créé depuis cette fiche

  -- Ce que disait le CRM d'origine (lecture seule, jamais modifié ici)
  crm_statut text not null default '',
  crm_campagne text not null default '',
  crm_telepro text not null default '',
  crm_commercial text not null default '',
  crm_resultat_rdv text not null default '',
  crm_commentaire text not null default '',
  crm_source text not null default '',
  crm_cree_le timestamptz,
  crm_maj_le timestamptz,
  dernier_rdv_date date,
  dernier_rdv_heure text not null default '',
  dernier_rdv_presence text not null default '',  -- 'present' | 'absent' | ''
  nb_rdv int not null default 0,
  profil jsonb not null default '[]'::jsonb,      -- questionnaire d'origine : [{ label, valeur }]
  historique jsonb not null default '[]'::jsonb,  -- journal du CRM d'origine : [{ date, action }]

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists dde_prospects_telepro_idx on dde_prospects (lower(telepro_email));
create index if not exists dde_prospects_statut_idx on dde_prospects (statut);
create index if not exists dde_prospects_tel_idx on dde_prospects (telephone);

-- Un rendez-vous garde désormais l'e-mail du client et le prospect dont il est issu.
alter table dde_appointments add column if not exists email text not null default '';
alter table dde_appointments add column if not exists prospect_id bigint;

create index if not exists dde_appointments_prospect_idx on dde_appointments (prospect_id);
