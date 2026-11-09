-- Hourly 24-hour cleanup of the `creations` bucket.
-- pg_cron triggers pg_net, which calls the cleanup-creations Edge Function.
--
-- The project URL and the secret (service) key are read from Supabase Vault. Create them ONCE,
-- in the SQL editor, before (or after) running this file — never commit the real key:
--
--   select vault.create_secret('https://nkoykaolxioiddveaovf.supabase.co', 'project_url');
--   select vault.create_secret('sb_secret_…your secret key…', 'service_role_key');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

-- Re-runnable: drop the previous schedule if present.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-creations-hourly') then
    perform cron.unschedule('cleanup-creations-hourly');
  end if;
end
$do$;

select cron.schedule(
  'cleanup-creations-hourly',
  '0 * * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/cleanup-creations',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 60000
  ) as request_id;
  $cron$
);
