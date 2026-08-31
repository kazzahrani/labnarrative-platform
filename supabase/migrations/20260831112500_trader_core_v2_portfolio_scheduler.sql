-- Trader Core V2 shadow portfolio scheduler.
-- Read-only exchange refresh; does not place/cancel orders or acquire V1 trading locks.

create or replace function public.invoke_trader_v2_portfolio_refresh()
returns bigint
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select secret into v_secret
  from public.trader_worker_secrets
  where name = 'paper_worker'
  limit 1;

  if coalesce(v_secret, '') = '' then
    raise exception 'trader_worker_secret_missing';
  end if;

  select net.http_post(
    url := 'https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-v2-portfolio-refresh',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-trader-worker-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.invoke_trader_v2_portfolio_refresh() from public;

-- Replace only this V2 job if the migration is reapplied.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'trader-v2-portfolio-refresh-15s'
  limit 1;
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end;
$$;

select cron.schedule(
  'trader-v2-portfolio-refresh-15s',
  '15 seconds',
  'select public.invoke_trader_v2_portfolio_refresh();'
);
