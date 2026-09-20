do $$
begin
  if exists (select 1 from cron.job where jobname='labnarrative-performance-cycle-worker') then
    perform cron.unschedule((select jobid from cron.job where jobname='labnarrative-performance-cycle-worker' limit 1));
  end if;
end $$;

select cron.schedule(
  'labnarrative-performance-cycle-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='trading_project_url') || '/functions/v1/performance-cycle-worker',
    body := jsonb_build_object('scheduled_at',now()),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='trading_publishable_key'),
      'x-ln-worker-key',(select decrypted_secret from vault.decrypted_secrets where name='trading-live-worker-key')
    ),
    timeout_milliseconds := 55000
  );
  $$
);