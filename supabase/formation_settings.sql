-- Réglages globaux du module Formation — une seule ligne (id=1).
--   slot_template      : modèle hebdo éditable pour générer des créneaux, ex.
--                        [{"weekday":1,"start":"10:00","end":"12:00","type":"individuel","capacity":1}, ...]
--                        (weekday ISO : 1=lundi)
--   default_partner_id : partenaire proposé par défaut à la création d'un créneau
--   auto_send_enabled  : envoie (ou non) la confirmation réelle au participant inscrit
--   programme          : étapes de la formation, éditables — alimente aussi les puces de l'email
--                        [{"title":"..."}, ...]
create table if not exists formation_settings (
  id int primary key default 1,
  slot_template jsonb not null default '[]',
  default_partner_id bigint references formation_partners(id),
  auto_send_enabled boolean not null default false,
  programme jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  constraint formation_settings_singleton check (id = 1)
);
