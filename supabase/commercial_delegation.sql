-- Délégation temporaire : pendant une période (vacances...), un autre commercial
-- prend la main sur l'agenda du commercial délégant (son lien de prise de RDV
-- redirige vers les disponibilités et l'agenda du délégué).
create table if not exists commercial_delegation (
  id serial primary key,
  delegator_email text not null,
  delegate_email text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists commercial_delegation_delegator_idx on commercial_delegation (lower(delegator_email));
