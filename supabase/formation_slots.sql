-- Créneaux de formation (concrets, datés) — générés depuis formation_settings.slot_template
-- ou créés à la main. "active=false" ferme un créneau sans perdre l'historique des inscriptions.
create table if not exists formation_slots (
  id bigserial primary key,
  date date not null,
  start_time text not null,   -- "HH:MM"
  end_time text not null,     -- "HH:MM"
  type text not null check (type in ('individuel', 'groupe')),
  partner_id bigint not null references formation_partners(id),
  capacity int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (date, start_time, end_time, partner_id)
);

create index if not exists formation_slots_date_idx on formation_slots (date);
