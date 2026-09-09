-- Verrouillage du lien "cadrage des besoins" envoyé par mail : au premier clic, une session est
-- créée et verrouillée sur l'appareil qui l'a ouverte (cookie), valable 72h. Un copier-coller du
-- lien vers un autre appareil ne donne pas accès ; la personne peut se régénérer un lien depuis
-- la page (expirée ou verrouillée), ce qui relance une nouvelle session de 72h.
alter table agency_prospects add column if not exists besoins_session_token text;
alter table agency_prospects add column if not exists besoins_session_lock text;
alter table agency_prospects add column if not exists besoins_session_started_at timestamptz;
