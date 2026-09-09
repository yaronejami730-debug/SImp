-- La commission de sortie (sold_pct) peut se calculer sur le NÉGOCIÉ TOTAL (comportement
-- historique, tous les deals existants) ou sur la PLUS-VALUE (prix vendu - prix initial du
-- mandat) — cas d'un téléprospecteur payé au pourcentage de la marge qu'il a fait gagner.
alter table remuneration_accords add column if not exists sold_pct_base text not null default 'negocie';
alter table remuneration_accords drop constraint if exists remuneration_accords_sold_pct_base_check;
alter table remuneration_accords add constraint remuneration_accords_sold_pct_base_check
  check (sold_pct_base in ('negocie', 'plusvalue'));
