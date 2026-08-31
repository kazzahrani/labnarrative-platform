do $$
begin
  if exists (select 1 from cron.job where jobname = 'trader-live-worker-5s') then
    perform cron.unschedule('trader-live-worker-5s');
  end if;
end $$;

select cron.schedule(
  'trader-live-worker-5s',
  '5 seconds',
  'select public.invoke_trader_live_exit_manager();'
);
