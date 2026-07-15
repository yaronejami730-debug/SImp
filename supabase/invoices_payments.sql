-- Invoice : ligne facturable (RDV signé)
create table if not exists invoices (
  id bigserial primary key,
  call_center_id bigint not null references call_centers(id) on delete cascade,
  commercial_email text not null,
  appointment_id text not null unique, -- RDV ID from Google Calendar
  client_name text not null default '',
  vehicle text not null default '',
  appointment_date timestamptz,
  signed_date timestamptz,
  amount numeric not null default 0,
  status text not null default 'pending', -- pending | paid | cancelled | disputed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inv_cc_idx on invoices(call_center_id);
create index if not exists inv_email_idx on invoices(commercial_email);
create index if not exists inv_status_idx on invoices(status);
create index if not exists inv_appt_idx on invoices(appointment_id);

-- Payment : transaction Stripe
create table if not exists payments (
  id bigserial primary key,
  call_center_id bigint not null references call_centers(id) on delete cascade,
  commercial_email text not null,
  amount numeric not null,
  stripe_payment_intent_id text not null unique,
  stripe_charge_id text,
  status text not null default 'pending', -- pending | succeeded | failed | cancelled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pay_cc_idx on payments(call_center_id);
create index if not exists pay_email_idx on payments(commercial_email);
create index if not exists pay_status_idx on payments(status);
create index if not exists pay_stripe_idx on payments(stripe_payment_intent_id);

-- Link : association invoice ↔ payment
create table if not exists invoice_payments (
  invoice_id bigint not null references invoices(id) on delete cascade,
  payment_id bigint not null references payments(id) on delete cascade,
  primary key (invoice_id, payment_id)
);

create index if not exists ipay_inv_idx on invoice_payments(invoice_id);
create index if not exists ipay_pay_idx on invoice_payments(payment_id);
