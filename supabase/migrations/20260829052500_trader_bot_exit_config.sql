create or replace function public.trader_bot_exit_config(
  p_account_id uuid,
  p_bot_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_client_id text;
  v_take_profit numeric;
  v_stop_enabled boolean;
  v_stop_pct numeric;
  v_state jsonb;
  v_targets jsonb;
begin
  select owner_user_id
    into v_owner
  from public.trader_accounts
  where id = p_account_id
    and status = 'active';

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select
    client_id,
    take_profit_pct,
    stop_enabled,
    stop_pct,
    coalesce(client_state, '{}'::jsonb)
  into
    v_client_id,
    v_take_profit,
    v_stop_enabled,
    v_stop_pct,
    v_state
  from public.trader_bots
  where id = p_bot_id
    and account_id = p_account_id;

  if not found then
    raise exception 'automation_not_found';
  end if;

  if jsonb_typeof(v_state->'takeProfitTargets') = 'array'
     and jsonb_array_length(v_state->'takeProfitTargets') > 0 then
    v_targets := v_state->'takeProfitTargets';
  elsif coalesce(v_take_profit, 0) > 0 then
    v_targets := jsonb_build_array(
      jsonb_build_object(
        'profitPct', v_take_profit,
        'allocationPct', 100
      )
    );
  else
    v_targets := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'clientId', v_client_id,
    'takeProfit', v_take_profit,
    'takeProfitTargets', v_targets,
    'stopEnabled', coalesce(v_stop_enabled, false),
    'stopPct', v_stop_pct
  );
end;
$$;

revoke all on function public.trader_bot_exit_config(uuid, uuid) from public;
grant execute on function public.trader_bot_exit_config(uuid, uuid) to authenticated;
