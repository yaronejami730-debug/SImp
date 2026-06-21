-- Phase B : hiérarchie d'entités (compte maître -> commerciaux -> sous-équipes).
-- parent_id = entité parente (null = racine, ex: entité 1 = Yaron).
-- Additif et rétrocompatible : les entités existantes restent racines (parent_id null).
alter table call_centers add column if not exists parent_id bigint references call_centers(id);
create index if not exists call_centers_parent_idx on call_centers (parent_id);
