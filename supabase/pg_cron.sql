-- Déclenchement des rappels par la BASE DE DONNÉES (Supabase pg_cron + pg_net),
-- pas par Vercel. La base appelle /api/cron/reminders toutes les 10 minutes.
-- Cet unique endpoint gère : rappel 24h, rappel 2h, SMS+mail 15 min avant,
-- mail parking, et toutes les relances (annulation / réflexion / non-signé / no-show).
--
-- À exécuter une fois dans l'éditeur SQL Supabase (remplace <CRON_SECRET> par la
-- vraie valeur de l'env CRON_SECRET, et l'URL par ton domaine de prod).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- (ré)installe le job
select cron.unschedule('simplicicar-reminders')
  where exists (select 1 from cron.job where jobname = 'simplicicar-reminders');

select cron.schedule(
  'simplicicar-reminders',
  '*/10 * * * *',
  $$
    select net.http_get(
      url := 'https://www.simplicicar.store/api/cron/reminders',
      headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
    );
  $$
);

-- Vérifs utiles :
--   select jobid, schedule, jobname, active from cron.job;
--   select status_code, left(content,300) from net._http_response order by id desc limit 5;
