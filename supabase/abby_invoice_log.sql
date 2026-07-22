-- Facturation automatique Abby (admin -> commercial direct, hors call centers).
-- Trace chaque RDV déjà mis en ligne de facture pour ne jamais le refacturer.
create table if not exists abby_invoice_log (
  id bigserial primary key,
  commercial_email text not null,
  month text not null,               -- "YYYY-MM" : mois d'émission du bouton (indicatif)
  abby_contact_id text not null,
  abby_invoice_id text not null,
  abby_invoice_number text,
  appt_ids jsonb not null default '[]',
  total_cents bigint not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists abby_invoice_log_commercial_idx on abby_invoice_log (commercial_email);
