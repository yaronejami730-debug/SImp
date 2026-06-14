-- Ajoute la colonne vehicule aux avis + aux relances (pour identifier le véhicule du client).
alter table reviews add column if not exists vehicle text default '';
alter table cancellation_followups add column if not exists vehicle text default '';
