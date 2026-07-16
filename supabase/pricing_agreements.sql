-- Pricing agreements between gestionnaire/call center and commercial
create table if not exists pricing_agreements (
  id bigserial primary key,
  call_center_id bigint not null references call_centers(id) on delete cascade,
  commercial_id bigint not null references users(id) on delete cascade,
  base_amount numeric not null, -- what commercial receives per RDV (e.g., 60)
  gestionnaire_amount numeric not null, -- gestionnaire cut (e.g., 30)
  call_center_amount numeric not null, -- call center cut (e.g., 30)
  status text not null default 'pending_confirmation', -- pending_confirmation, active, rejected
  confirmed_by_commercial boolean default false,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  created_by bigint references users(id), -- who created the agreement
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint status_check check (status in ('pending_confirmation', 'active', 'rejected'))
);

create index if not exists pricing_cc_idx on pricing_agreements(call_center_id);
create index if not exists pricing_commercial_idx on pricing_agreements(commercial_id);
create index if not exists pricing_status_idx on pricing_agreements(status);
create unique index if not exists pricing_unique_active on pricing_agreements(call_center_id, commercial_id) where status = 'active';
