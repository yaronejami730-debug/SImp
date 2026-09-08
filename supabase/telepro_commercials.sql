-- Assignation fine : quel(s) commercial(aux) un téléprospecteur précis peut choisir
-- lors de la prise de RDV (en plus/à la place de la règle globale du call center).
create table if not exists telepro_commercials (
  telepro_email text not null,
  commercial_email text not null,
  primary key (telepro_email, commercial_email)
);
