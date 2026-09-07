-- Champs supplémentaires pour les leads importés depuis un CSV (Google Sheet) :
-- identité + campagne + copie brute de la ligne CSV (pour la fiche détail).
alter table leads add column if not exists first_name text;
alter table leads add column if not exists last_name text;
alter table leads add column if not exists email text;
alter table leads add column if not exists campaign text;
alter table leads add column if not exists raw_data jsonb;
