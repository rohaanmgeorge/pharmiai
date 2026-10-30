-- Reminders clock: Supabase calls our app every minute.
-- Run ONCE in Supabase → SQL Editor, after enabling the pg_cron and pg_net extensions
-- (Database → Extensions). Replace PASTE_CRON_SECRET_HERE with the CRON_SECRET value from
-- .env.local / Vercel. The secret is stored in Supabase Vault, not in this file.

select vault.create_secret('PASTE_CRON_SECRET_HERE', 'cron_secret');

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

-- Check it is running (status 200 = good):
--   select status_code, created from net._http_response order by created desc limit 5;
-- Stop it:
--   select cron.unschedule('pharmiai-tick');
