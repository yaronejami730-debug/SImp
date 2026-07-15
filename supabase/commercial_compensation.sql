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
-- gestionnaire_email = Yaron (see call_centers.gestionnaire_email)
-- call_center_share_pct: portion visible to Call Center Responsable (rest goes to gestionnaire)
--
-- Example: Raphaël Dahan, 50€ base + 10% nego
--   Total facturé = 50€ (or more with negotiation bonus)
--   Gestionnaire (Yaron) voit: CC portion + Gestionnaire portion
--   Responsable CC voit: total only (no distribution)
insert into commercial_compensation (call_center_id, commercial_email, commercial_name, commission_base, commission_pct, call_center_share_pct)
values
  (1, 'raphael.benoliel@simplicicar.fr', 'Raphaël Benoliel', 60, 10, 50),
  (1, 'raphael.atlan@simplicicar.fr', 'Raphaël Atlan', 60, 10, 50),
  (1, 'raphael.dahan@simplicicar.fr', 'Raphaël Dahan', 50, 10, 60),  -- CC gets 60% (30€), Yaron 40% (20€)
  (1, 'samuel@simplicicar.fr', 'Samuel', 60, 10, 50)
on conflict (call_center_id, commercial_email) do nothing;
