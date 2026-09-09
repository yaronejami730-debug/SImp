-- Marque un compte "libre" (sans rattachement organisationnel) comme gestionnaire ou associé.
-- Nécessaire car ces comptes ne sont plus reliés automatiquement à un call center à la création
-- (voir /comptes "Créer un utilisateur") — sans ça, un gestionnaire fraîchement créé n'apparaît
-- nulle part (le picker "Nouveau deal" ne regardait que call_centers.gestionnaire_email).
alter table users add column if not exists account_kind text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_account_kind_check'
  ) then
    alter table users add constraint users_account_kind_check
      check (account_kind is null or account_kind in ('gestionnaire', 'associe'));
  end if;
end $$;
