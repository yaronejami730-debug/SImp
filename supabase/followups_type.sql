-- Ajoute un champ `type` pour distinguer relances d'annulation / réflexion / non-signé.
alter table cancellation_followups
  add column if not exists type text not null default 'cancel';

create index if not exists cancellation_followups_type_idx
  on cancellation_followups (type, done, next_send_at);
