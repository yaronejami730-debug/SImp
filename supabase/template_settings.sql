-- Activation / désactivation des templates (mails + SMS) depuis le dashboard.
-- Un template absent = activé par défaut. Présent avec enabled=false = ne part pas.
create table if not exists template_settings (
  template_key text not null,
  channel text not null,            -- email | sms
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (template_key, channel)
);

alter table template_settings enable row level security;
alter table template_settings force row level security;
