-- Paliers de volume sur un accord de rémunération (remuneration_accords) : au lieu d'un
-- tarif fixe par RDV, le montant dépend du nombre de RDV pris par le bénéficiaire CE JOUR-LÀ,
-- dans le périmètre de l'accord (même call center, ou même couple commercial/télépro).
--   'threshold'   : seuil — dès que le compteur du jour atteint le palier, TOUS les RDV du jour
--                   basculent au nouveau tarif (ex : 20 RDV/jour -> 20€/RDV au lieu de 10€).
--   'progressive' : progressif — chaque RDV garde le tarif de son propre rang dans la journée
--                   (ex : les 10 premiers à 60€, à partir du 11e à 100€).
alter table remuneration_accords add column if not exists tier_mode text not null default 'none'
  check (tier_mode in ('none', 'threshold', 'progressive'));

create table if not exists remuneration_tiers (
  id bigserial primary key,
  accord_id bigint not null references remuneration_accords(id) on delete cascade,
  min_count int not null,       -- seuil (mode threshold) ou rang (mode progressive) à partir duquel ce tarif s'applique
  amount_eur numeric not null,  -- remplace base_eur de l'accord pour les RDV concernés
  pct_nego numeric not null default 0, -- remplace pct_nego de l'accord pour les RDV concernés
  created_at timestamptz not null default now()
);

create index if not exists remuneration_tiers_accord_idx on remuneration_tiers (accord_id);
