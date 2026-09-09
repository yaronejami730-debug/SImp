-- Nom donné par le gestionnaire/admin à un deal (les 2-4 lignes reliées par deal_ref)
-- au moment de sa création — sert d'intitulé dans la liste, plutôt qu'une description générée.
alter table remuneration_accords add column if not exists deal_name text;
