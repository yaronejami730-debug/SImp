-- Gestionnaire/associé sont des rôles CUMULABLES, comme is_commercial/is_teleprospector déjà —
-- pas une catégorie exclusive. account_kind (texte unique) était une erreur de modélisation :
-- un même compte (ex: Yaron) peut être téléprospecteur ET commercial ET gestionnaire ET associé
-- à la fois. account_kind reste en base (colonne orpheline, inoffensive) mais n'est plus utilisé.
alter table users add column if not exists is_gestionnaire boolean not null default false;
alter table users add column if not exists is_associe boolean not null default false;

-- Reprend ce qui avait déjà été taggé via account_kind (les 2 comptes test créés aujourd'hui).
update users set is_gestionnaire = true where account_kind = 'gestionnaire';
update users set is_associe = true where account_kind = 'associe';
