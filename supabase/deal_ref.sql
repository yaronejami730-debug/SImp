-- Relie les 2-4 lignes (gestionnaire, call_center/telepro, associé(s)) créées ensemble par UN
-- "Nouveau deal" (voir brokerDealForCommercial) — nécessaire pour reconstruire une vue simplifiée
-- côté commercial : il ne doit voir ni gestionnaire ni associés ni répartition interne (déjà la
-- règle pour l'ancien système de commission), juste "je paie X €, je travaille avec Y".
alter table remuneration_accords add column if not exists deal_ref text;
create index if not exists remuneration_accords_deal_ref_idx on remuneration_accords (deal_ref);
