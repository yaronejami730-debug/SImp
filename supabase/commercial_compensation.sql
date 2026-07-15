-- Commercial compensation management at Call Center level
-- Replaces hardcoded COMMISSION_SCHEMES

create table if not exists commercial_compensation (
  id bigserial primary key,
  call_center_id bigint not null references call_centers(id) on delete cascade,
  commercial_email text not null,
  commercial_name text not null default '',
  -- Compensation structure
  commission_base numeric not null default 50,        -- € per signed RDV
  commission_pct numeric not null default 10,         -- % of negotiation margin
  -- Internal distribution (hidden from commercial)
  call_center_share_pct numeric not null default 50,  -- % for Call Center (rest to beneficiary)
  -- Tracking
  total_signed_rdv bigint not null default 0,
  total_owed numeric not null default 0,
  total_paid numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(call_center_id, commercial_email)
);

create index if not exists cc_compensation_cc_idx on commercial_compensation(call_center_id);
create index if not exists cc_compensation_email_idx on commercial_compensation(commercial_email);

-- Data: Initial configuration for Call Center 1 (Simplicicar Paris 17)
-- Raphaël Benoliel: 60€ + modifiable %
insert into commercial_compensation (call_center_id, commercial_email, commercial_name, commission_base, commission_pct)
values
  (1, 'raphael.benoliel@simplicicar.fr', 'Raphaël Benoliel', 60, 10),
  (1, 'raphael.atlan@simplicicar.fr', 'Raphaël Atlan', 60, 10),
  (1, 'raphael.dahan@simplicicar.fr', 'Raphaël Dahan', 50, 10),
  (1, 'samuel@simplicicar.fr', 'Samuel', 60, 10)
on conflict (call_center_id, commercial_email) do nothing;
