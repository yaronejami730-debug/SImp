-- Présence en ligne : dernière activité connue d'un compte, mise à jour par un ping client
-- toutes les ~45s tant que le CRM est ouvert. Utilisé par la page Comptes ("en ligne" si < 2 min).
alter table users add column if not exists last_seen_at timestamptz;
