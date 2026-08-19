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
  statut text not null default 'a_venir', -- 'a_venir' | 'honore' | 'absent' | 'annule' | 'deplace' | 'non_eligible'
  notes text not null default '',
  created_at timestamptz default now()
);

create index if not exists dde_appointments_date_idx on dde_appointments (rdv_date desc, rdv_time desc);
create index if not exists dde_appointments_telepro_idx on dde_appointments (lower(telepro_email));

-- Suivi opérationnel d'un rendez-vous : envoi WhatsApp, facturation, paiement du call center.
alter table dde_appointments add column if not exists whatsapp_sent_at timestamptz;
alter table dde_appointments add column if not exists invoiced_at timestamptz;
alter table dde_appointments add column if not exists callcenter_paid_at timestamptz;

-- Auteur de la saisie quand une autre personne remplit le formulaire à la place de la téléprospectrice.
alter table dde_appointments add column if not exists saisi_par_email text not null default '';
alter table dde_appointments add column if not exists saisi_par_name text not null default '';

-- Statuts définitifs : 'a_venir' | 'honore' | 'absent' | 'annule' | 'deplace' | 'non_eligible'
-- ('confirme' n'existe plus : les RDV concernés repassent à venir).
update dde_appointments set statut = 'a_venir' where statut = 'confirme';

-- Facturation et paiement du call center ne valent que pour un RDV honoré.
update dde_appointments set invoiced_at = null, callcenter_paid_at = null where statut <> 'honore';

-- Suivi à étapes (remplace les simples cases « facturé » / « payé »).
-- facturation_statut : argent entrant, facture envoyée à l'entreprise cliente.
-- callcenter_statut  : argent sortant, facture réclamée au call center puis payée.
alter table dde_appointments add column if not exists facturation_statut text not null default 'a_facturer';
alter table dde_appointments add column if not exists callcenter_statut text not null default 'appel_facture';

update dde_appointments set facturation_statut = 'facturee' where invoiced_at is not null and facturation_statut = 'a_facturer';
update dde_appointments set callcenter_statut = 'paye' where callcenter_paid_at is not null and callcenter_statut = 'appel_facture';

-- Ces suivis n'ont de sens que sur un RDV honoré.
update dde_appointments set facturation_statut = 'a_facturer', callcenter_statut = 'appel_facture' where statut <> 'honore';
