-- Stripe customer mapping for payment method storage
create table if not exists stripe_customers (
  id bigserial primary key,
  call_center_id bigint not null references call_centers(id) on delete cascade,
  commercial_email text not null unique,
  stripe_customer_id text not null unique,
  stripe_payment_method_id text,
  payment_method_type text, -- card, etc
  payment_method_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_cc_idx on stripe_customers(call_center_id);
create index if not exists stripe_email_idx on stripe_customers(commercial_email);
create index if not exists stripe_customer_id_idx on stripe_customers(stripe_customer_id);
