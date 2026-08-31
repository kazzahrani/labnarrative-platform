-- Trader Core V2 normalized Positions read model.
-- Read-only projection over existing trade/order state; no execution behavior changes.

create or replace view public.trader_v2_positions_latest
with (security_invoker = true)
as
select
  t.account_id,
  t.id as trade_id,
  t.public_trade_no,
  t.bot_id,
  nullif(t.client_state->>'botName', '') as bot_name,
  upper(t.pair) as pair,
  lower(coalesce(
    nullif(t.exchange_provider, ''),
    nullif(t.client_state->>'exchangeProvider', ''),
    nullif(t.client_state->>'exchange', ''),
    'binance'
  )) as provider,
  t.execution_mode,
  t.status,
  coalesce(t.average_price, t.entry_price, 0)::numeric as average_price,
  greatest(coalesce(t.quantity, 0), 0)::numeric as quantity,
  greatest(coalesce(t.quantity, 0), 0)::numeric * greatest(coalesce(t.average_price, t.entry_price, 0), 0)::numeric as remaining_cost_basis,
  greatest(coalesce(t.last_price, t.average_price, t.entry_price, 0), 0)::numeric as last_price,
  greatest(coalesce(t.quantity, 0), 0)::numeric * greatest(coalesce(t.last_price, t.average_price, t.entry_price, 0), 0)::numeric as market_value,
  greatest(coalesce(t.quantity, 0), 0)::numeric * (
    greatest(coalesce(t.last_price, t.average_price, t.entry_price, 0), 0)::numeric -
    greatest(coalesce(t.average_price, t.entry_price, 0), 0)::numeric
  ) as unrealized_pnl,
  case
    when coalesce(t.average_price, t.entry_price, 0) > 0
      then ((coalesce(t.last_price, t.average_price, t.entry_price, 0) / coalesce(t.average_price, t.entry_price)) - 1) * 100
    else 0
  end::numeric as unrealized_pct,
  coalesce(t.realized_pnl, 0)::numeric as realized_pnl,
  coalesce(t.averaging_filled, 0) as completed_dca_orders,
  coalesce(t.max_averaging, 0) as max_dca_orders,
  coalesce(t.active_orders_limit, 0) as active_dca_limit,
  (
    select count(*)::integer
    from public.trader_orders o
    where o.trade_id = t.id
      and lower(o.kind) = 'averaging'
      and upper(o.status) in ('NEW', 'OPEN', 'PARTIALLY_FILLED', 'PARTIALLY FILLED')
  ) as active_dca_orders,
  case
    when lower(coalesce(t.client_state->>'stopEnabled', '')) in ('true','false')
      then (t.client_state->>'stopEnabled')::boolean
    else coalesce(t.stop_enabled, false)
  end as stop_enabled,
  case
    when coalesce(t.client_state->>'stopPct', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      then (t.client_state->>'stopPct')::numeric
    else coalesce(t.stop_pct, 0)::numeric
  end as stop_pct,
  case
    when jsonb_typeof(t.client_state->'takeProfitTargets') = 'array'
      then t.client_state->'takeProfitTargets'
    when coalesce(t.take_profit_pct, 0) > 0
      then jsonb_build_array(jsonb_build_object('profitPct', t.take_profit_pct, 'allocationPct', 100))
    else '[]'::jsonb
  end as take_profit_targets,
  case
    when jsonb_typeof(t.client_state->'takeProfitFilled') = 'array'
      then t.client_state->'takeProfitFilled'
    else '[]'::jsonb
  end as take_profit_filled,
  coalesce((t.client_state->>'exitStrategyV2')::boolean, false) as exit_strategy_v2,
  t.opened_at,
  t.updated_at
from public.trader_trades t
where t.status = 'Active';

comment on view public.trader_v2_positions_latest is
  'Normalized, read-only Core V2 projection of active Trader positions. Exit Strategy V2 client_state takes precedence over legacy SL/TP columns.';

grant select on public.trader_v2_positions_latest to service_role;
