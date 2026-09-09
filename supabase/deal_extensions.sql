-- "Deal" — moteur de rémunération programmable + intégrité facturation.
-- Reconstruction défensive de remuneration_accords (sa création n'était pas trackée dans le
-- repo — seul remuneration_tiers.sql l'altère) puis extension : méthode/délai de paiement,
-- portée agence-entière (includes_descendants). + soft-delete réel des call centers (aucune
-- colonne active/deleted_at n'existait jusqu'ici) + horodatage d'audit sur users.

create table if not exists remuneration_accords (
  id bigserial primary key,
  call_center_id bigint references call_centers(id),
  commercial_email text not null default '',
  payee_email text not null default '',
  payee_kind text not null default 'call_center'
    check (payee_kind in ('call_center', 'gestionnaire', 'telepro', 'apporteur')),
  base_eur numeric not null default 0,
  pct_nego numeric not null default 0,
  sold_eur numeric not null default 0,
  sold_pct numeric not null default 0,
  trigger_kind text not null default 'signed' check (trigger_kind in ('signed', 'honored')),
  payer_email text not null default '',
  label text not null default '',
  active boolean not null default true,
  tier_mode text not null default 'none' check (tier_mode in ('none', 'threshold', 'progressive')),
  created_at timestamptz not null default now()
);

create index if not exists remuneration_accords_cc_idx on remuneration_accords (call_center_id);
create index if not exists remuneration_accords_payer_idx on remuneration_accords (lower(payer_email));
create index if not exists remuneration_accords_payee_idx on remuneration_accords (lower(payee_email));

alter table remuneration_accords add column if not exists payment_method text not null default '';
alter table remuneration_accords add column if not exists payment_delay_days int not null default 0;
alter table remuneration_accords add column if not exists includes_descendants boolean not null default false;

alter table call_centers add column if not exists active boolean not null default true;
alter table call_centers add column if not exists deleted_at timestamptz;

alter table users add column if not exists deleted_at timestamptz;

-- Un hard delete (users/call_centers) ne doit plus jamais effacer l'historique de facturation.
-- Le code applicatif passe désormais par une désactivation (active=false) ; ces contraintes
-- deviennent une ceinture-bretelles : si un futur hard delete est fait par erreur, il échoue
-- au lieu d'emporter en silence les accords/factures/paiements liés.
do $$
begin
  if exists (select 1 from information_schema.table_constraints
             where constraint_name = 'pricing_agreements_call_center_id_fkey') then
    alter table pricing_agreements drop constraint pricing_agreements_call_center_id_fkey;
    alter table pricing_agreements add constraint pricing_agreements_call_center_id_fkey
      foreign key (call_center_id) references call_centers(id) on delete restrict;
  end if;
  if exists (select 1 from information_schema.table_constraints
             where constraint_name = 'pricing_agreements_commercial_id_fkey') then
    alter table pricing_agreements drop constraint pricing_agreements_commercial_id_fkey;
    alter table pricing_agreements add constraint pricing_agreements_commercial_id_fkey
      foreign key (commercial_id) references users(id) on delete restrict;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.table_constraints
             where constraint_name = 'invoices_call_center_id_fkey') then
    alter table invoices drop constraint invoices_call_center_id_fkey;
    alter table invoices add constraint invoices_call_center_id_fkey
      foreign key (call_center_id) references call_centers(id) on delete restrict;
  end if;
  if exists (select 1 from information_schema.table_constraints
             where constraint_name = 'payments_call_center_id_fkey') then
    alter table payments drop constraint payments_call_center_id_fkey;
    alter table payments add constraint payments_call_center_id_fkey
      foreign key (call_center_id) references call_centers(id) on delete restrict;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.table_constraints
             where constraint_name = 'commercial_compensation_call_center_id_fkey') then
    alter table commercial_compensation drop constraint commercial_compensation_call_center_id_fkey;
    alter table commercial_compensation add constraint commercial_compensation_call_center_id_fkey
      foreign key (call_center_id) references call_centers(id) on delete restrict;
  end if;
  if exists (select 1 from information_schema.table_constraints
             where constraint_name = 'call_center_teams_call_center_id_fkey') then
    alter table call_center_teams drop constraint call_center_teams_call_center_id_fkey;
    alter table call_center_teams add constraint call_center_teams_call_center_id_fkey
      foreign key (call_center_id) references call_centers(id) on delete restrict;
  end if;
  if exists (select 1 from information_schema.table_constraints
             where constraint_name = 'stripe_customers_call_center_id_fkey') then
    alter table stripe_customers drop constraint stripe_customers_call_center_id_fkey;
    alter table stripe_customers add constraint stripe_customers_call_center_id_fkey
      foreign key (call_center_id) references call_centers(id) on delete restrict;
  end if;
end $$;
