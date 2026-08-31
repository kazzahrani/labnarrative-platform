-- Trader Core V2 shadow transfer scheduler.
-- Recent-window, read-only reconciliation. Initial 30-day backfill is performed separately.

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'trader-v2-transfer-reconcile-60s'
  limit 1;
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end;
$$;

select cron.schedule(
  'trader-v2-transfer-reconcile-60s',
  '60 seconds',
  'select public.invoke_trader_v2_transfer_reconcile(2);'
);
