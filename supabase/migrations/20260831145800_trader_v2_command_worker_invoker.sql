create or replace function public.invoke_trader_v2_command_worker()
returns bigint
language plpgsql
security definer
set search_path to 'public','net'
as $function$
declare
  v_secret text;
  v_request_id bigint;
begin
  select secret into v_secret
  from public.trader_worker_secrets
  where name='paper_worker'
  limit 1;
  if coalesce(v_secret,'')='' then raise exception 'trader_worker_secret_missing'; end if;

  select net.http_post(
    url := 'https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-v2-command-worker',
    headers := jsonb_build_object('content-type','application/json','x-trader-worker-secret',v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request_id;
  return v_request_id;
end;
$function$;

revoke all on function public.invoke_trader_v2_command_worker() from public, anon, authenticated;
grant execute on function public.invoke_trader_v2_command_worker() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname='trader-v2-command-worker-5s';

select cron.schedule(
  'trader-v2-command-worker-5s',
  '5 seconds',
  'select public.invoke_trader_v2_command_worker();'
);
