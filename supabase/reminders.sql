-- À exécuter une fois dans l'éditeur SQL Supabase.
create table if not exists reminders (
  id bigserial primary key,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null,
  listing_url text default '',
  note text default '',
  remind_at timestamptz not null,
  status text not null default 'pending',  -- pending | done | skipped
  owner text not null default '',          -- email du collaborateur
  lead_id bigint references leads(id) on delete set null,
  event_id text default '',                -- id de l'événement Google Agenda
  created_at timestamptz default now()
);
alter table reminders add column if not exists event_id text default '';
alter table reminders add column if not exists client_email text default '';
alter table reminders add column if not exists notified_at timestamptz;

create index if not exists reminders_status_idx on reminders (status, remind_at);
create index if not exists reminders_owner_idx on reminders (owner, status);
create index if not exists reminders_due_idx on reminders (status, notified_at, remind_at);
