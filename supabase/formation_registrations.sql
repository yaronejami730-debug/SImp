-- Inscriptions à un créneau de formation. type/partner_id sont dénormalisés depuis le
-- créneau au moment de l'inscription : l'historique reste correct même si le créneau
-- est modifié ensuite. email_sent trace si la confirmation RÉELLE (pas un test) est partie.
create table if not exists formation_registrations (
  id bigserial primary key,
  slot_id bigint not null references formation_slots(id),
  first_name text not null,
  last_name text not null,
  email text not null,
  type text not null check (type in ('individuel', 'groupe')),
  partner_id bigint not null references formation_partners(id),
  status text not null default 'inscrit' check (status in ('inscrit', 'annule')),
  email_sent boolean not null default false,
  email_sent_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists formation_registrations_slot_idx on formation_registrations (slot_id);
