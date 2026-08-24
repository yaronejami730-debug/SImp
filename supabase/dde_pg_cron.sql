-- SMS de rappel DDE déclenchés par la base (Supabase pg_cron + pg_net),
-- toutes les 10 minutes : SMS la veille et SMS 2 heures avant le rappel téléphonique.
--
-- À exécuter une fois dans l'éditeur SQL Supabase, en remplaçant <CRON_SECRET>
-- par la valeur de l'env CRON_SECRET et l'URL par le domaine de production.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('dde-rappels')
  where exists (select 1 from cron.job where jobname = 'dde-rappels');

select cron.schedule(
  'dde-rappels',
  '*/10 * * * *',
  $$
    select net.http_get(
      url := 'https://agenda-rdv.vercel.app/api/cron/dde-rappels',
      headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
    );
  $$
);

-- Vérifs :
--   select jobid, schedule, jobname, active from cron.job;
--   select status_code, left(content,300) from net._http_response order by id desc limit 5;
