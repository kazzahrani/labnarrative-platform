-- Trader Core V2 transfer reconciliation invoker.
-- Keeps the worker secret inside Supabase. No cron schedule is created here.

create or replace function public.invoke_trader_v2_transfer_reconcile(p_days integer default 30)
returns bigint
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_secret text;
  v_request_id bigint;
  v_days integer := greatest(1, least(90, coalesce(p_days, 30)));
begin
  select secret into v_secret
  from public.trader_worker_secrets
  where name = 'paper_worker'
  limit 1;

  if coalesce(v_secret, '') = '' then
    raise exception 'trader_worker_secret_missing';
  end if;

  select net.http_post(
    url := 'https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-v2-transfer-reconcile',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-trader-worker-secret', v_secret
    ),
    body := jsonb_build_object('days', v_days),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.invoke_trader_v2_transfer_reconcile(integer) from public;
grant execute on function public.invoke_trader_v2_transfer_reconcile(integer) to service_role;
