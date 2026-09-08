-- Mode de rémunération télépros d'un call center — réglable, super-admin uniquement :
--   'gestionnaire' : le gestionnaire fixe lui-même le barème (€/RDV) de CHAQUE téléprospecteur.
--   'responsable'  : le gestionnaire donne un montant global au call center ; c'est un repère
--                     indiquant que la redistribution interne est éditée par ailleurs (toujours
--                     par le super-admin aujourd'hui — ce mode est descriptif, pas un droit d'édition).
alter table call_centers add column if not exists telepro_pay_mode text not null default 'gestionnaire'
  check (telepro_pay_mode in ('gestionnaire', 'responsable'));
