-- Reminders clock: Supabase calls our app every minute. Safe to run again at any time.
--
-- BEFORE running: Supabase → Database → Extensions → turn ON "pg_cron" and "pg_net".
-- Then replace PASTE_CRON_SECRET_HERE (one place, below) with the CRON_SECRET value from
-- .env.local — exactly the same value as in Vercel. Run the whole file at once.

-- 1. Store the secret in Supabase Vault (replaces an older copy if there is one).
select vault.update_secret(id, 'PASTE_CRON_SECRET_HERE') from vault.secrets where name = 'cron_secret';
select vault.create_secret('PASTE_CRON_SECRET_HERE', 'cron_secret')
where not exists (select 1 from vault.secrets where name = 'cron_secret');

-- 2. Remove an old schedule with the same name, then schedule every minute.
select cron.unschedule(jobid) from cron.job where jobname = 'pharmiai-tick';

select cron.schedule(
  'pharmiai-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://pharmiai.vercel.app/api/cron/tick',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- 3. Check: this must show one row, active = true.
select jobname, schedule, active from cron.job;

-- After 2 minutes, run this on its own. status_code 200 = working, 403 = secret mismatch:
--   select status_code, left(content::text, 80), created from net._http_response order by created desc limit 5;
