create or replace function public.invoke_trader_paper_worker()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'net'
as $function$
declare
  v_secret text;
  v_request_id bigint;
begin
  select secret into v_secret
  from public.trader_worker_secrets
  where name = 'paper_worker';

  if v_secret is null then
    raise exception 'trader worker secret missing';
  end if;

  select net.http_post(
    url := 'https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-paper-exit-worker',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-trader-worker-secret', v_secret
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  return v_request_id;
end;
$function$;
