-- Multi-entités : chaque "call center" est une entité indépendante (sa propre boîte).
-- Un call center a un admin (super-administrateur), des téléprospecteurs, un commercial par défaut.
-- Tout est cloisonné par call_center_id. Le call center 1 = entité historique (Yaron).
create table if not exists call_centers (
  id bigserial primary key,
  name text not null,
  default_commercial text not null default '',
  created_at timestamptz not null default now()
);

insert into call_centers (id, name, default_commercial)
  select 1, 'Yaron Jami', 'Raphaël Dahan'
  where not exists (select 1 from call_centers where id = 1);
-- garde la séquence cohérente
select setval(pg_get_serial_sequence('call_centers','id'), greatest((select max(id) from call_centers), 1));

alter table call_centers enable row level security;
alter table call_centers force row level security;

-- Rattachement de tout aux call centers (défaut = 1, l'existant reste à Yaron).
alter table users                 add column if not exists call_center_id bigint not null default 1;
alter table appointments_mobile   add column if not exists call_center_id bigint not null default 1;
alter table reminders             add column if not exists call_center_id bigint not null default 1;
alter table leads                 add column if not exists call_center_id bigint not null default 1;
alter table cancellation_followups add column if not exists call_center_id bigint not null default 1;
alter table messages              add column if not exists call_center_id bigint not null default 1;
alter table template_settings     add column if not exists call_center_id bigint not null default 1;

create index if not exists users_cc_idx on users (call_center_id);
create index if not exists appt_mobile_cc_idx on appointments_mobile (call_center_id, start_datetime);
create index if not exists reminders_cc_idx on reminders (call_center_id);
create index if not exists leads_cc_idx on leads (call_center_id);
create index if not exists followups_cc_idx on cancellation_followups (call_center_id);
create index if not exists messages_cc_idx on messages (call_center_id, sent_at desc);
