-- Lien vers l'event Google Agenda créé pour cette inscription (📞 Formation, sur le même
-- calendrier que le reste de l'app) — permet de le supprimer/recréer à la reprogrammation.
alter table formation_registrations add column if not exists calendar_event_id text;
