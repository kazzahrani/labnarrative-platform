do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'wealth-binance-background-sync'
  limit 1;

  if v_jobid is not null then
    perform cron.alter_job(v_jobid, schedule := '* * * * *');
  end if;
end
$$;
