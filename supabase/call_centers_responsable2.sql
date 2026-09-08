-- Deuxième responsable optionnel sur un call center : les deux se partagent 50/50
-- ce que touche le call center (affichage uniquement — un seul paiement réel reste tracé).
alter table call_centers add column if not exists responsable_email_2 text;
