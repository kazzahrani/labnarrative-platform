create or replace function public.trader_live_snapshot_exit_v2()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_bot_state jsonb := '{}'::jsonb;
  v_targets jsonb := '[]'::jsonb;
  v_timeout integer := 0;
  v_stop_enabled boolean := false;
  v_stop_pct numeric := 0;
begin
  if new.execution_mode = 'live' and new.bot_id is not null then
    select coalesce(b.client_state, '{}'::jsonb), b.stop_enabled, b.stop_pct
      into v_bot_state, v_stop_enabled, v_stop_pct
    from public.trader_bots b
    where b.id = new.bot_id;

    v_targets := coalesce(v_bot_state->'takeProfitTargets', '[]'::jsonb);
    v_timeout := coalesce(nullif(v_bot_state->>'stopLossTimeoutSeconds','')::integer, 0);

    if jsonb_typeof(v_targets) = 'array' and jsonb_array_length(v_targets) > 0 then
      new.take_profit_pct := 0;
      new.stop_enabled := false;
      new.client_state := coalesce(new.client_state, '{}'::jsonb) || jsonb_build_object(
        'exitStrategyV2', true,
        'takeProfitTargets', v_targets,
        'takeProfitFilled', '[]'::jsonb,
        'stopLossTimeoutSeconds', greatest(0, v_timeout),
        'stopEnabled', coalesce(v_stop_enabled, false),
        'stopPct', coalesce(v_stop_pct, 0)
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.trader_live_snapshot_exit_v2() from public, anon, authenticated;
grant execute on function public.trader_live_snapshot_exit_v2() to postgres, service_role;

drop trigger if exists trader_live_trade_exit_v2_snapshot on public.trader_trades;
create trigger trader_live_trade_exit_v2_snapshot
before insert on public.trader_trades
for each row execute function public.trader_live_snapshot_exit_v2();
