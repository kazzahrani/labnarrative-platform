create or replace function public.trader_seed_starter_paper_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.trader_accounts%rowtype;
  v_def record;
  v_bot_id uuid;
  v_client_id text;
  v_created_at timestamptz;
  v_conditions jsonb;
  v_i integer;
  v_pair_index integer;
  v_pair text;
  v_base_price numeric;
  v_entry_price numeric;
  v_average_price numeric;
  v_exit_price numeric;
  v_quantity numeric;
  v_capital numeric;
  v_depth integer;
  v_is_win boolean;
  v_roi numeric;
  v_realized numeric;
  v_opened_at timestamptz;
  v_closed_at timestamptz;
  v_duration_minutes integer;
  v_trade_client_id text;
  v_close_reason text;
  v_event_key text;
  v_received_at timestamptz;
  v_signal_id text;
  v_noise_reason text;
  v_j integer;
begin
  select * into v_account
  from public.trader_accounts
  where id = p_account_id
    and owner_user_id is not null
    and status = 'active'
    and (mode = 'paper' or account_kind = 'paper');

  if not found then
    return;
  end if;

  for v_def in
    select * from (values
      (1, 'Starter · RSI Recovery 15m', 'dca', array['BTC/USDT','ETH/USDT','SOL/USDT']::text[], 72, 73, 1.15::numeric, 1.25::numeric, 300::numeric, 150::numeric, 3, 2, 3, 1.20::numeric, 1.00::numeric, 1.00::numeric, 1.20::numeric, 3.20::numeric, 0.00::numeric, '15 minutes', 14, 32, 'Crossing Up', 180),
      (2, 'Starter · Momentum Ladder 5m', 'dca', array['SOL/USDT','BNB/USDT','LINK/USDT']::text[], 66, 65, 1.45::numeric, 1.15::numeric, 250::numeric, 125::numeric, 2, 2, 4, 0.90::numeric, 1.10::numeric, 1.15::numeric, 1.50::numeric, 2.80::numeric, 0.20::numeric, '5 minutes', 7, 60, 'Greater Than', 90),
      (3, 'Starter · BTC Trend 1h', 'dca', array['BTC/USDT']::text[], 60, 59, 2.10::numeric, 1.45::numeric, 500::numeric, 250::numeric, 1, 1, 2, 1.80::numeric, 1.00::numeric, 1.00::numeric, 2.20::numeric, 4.50::numeric, 0.30::numeric, '1 hour', 14, 55, 'Greater Than', 720),
      (4, 'Starter · ETH Pullback 30m', 'dca', array['ETH/USDT']::text[], 68, 68, 1.25::numeric, 1.05::numeric, 400::numeric, 200::numeric, 3, 2, 3, 1.10::numeric, 1.00::numeric, 1.10::numeric, 1.30::numeric, 3.00::numeric, 0.00::numeric, '30 minutes', 14, 35, 'Less Than', 360),
      (5, 'Starter · Volatility DCA 15m', 'dca', array['ADA/USDT','XRP/USDT','DOGE/USDT','SUI/USDT']::text[], 74, 76, 0.85::numeric, 1.20::numeric, 220::numeric, 110::numeric, 4, 3, 5, 1.40::numeric, 1.15::numeric, 1.20::numeric, 1.00::numeric, 3.50::numeric, 0.25::numeric, '15 minutes', 14, 38, 'Crossing Up', 240),
      (6, 'Starter · Conservative RSI 4h', 'dca', array['BTC/USDT','ETH/USDT','BNB/USDT']::text[], 58, 82, 0.65::numeric, 0.95::numeric, 600::numeric, 250::numeric, 2, 1, 2, 2.00::numeric, 1.00::numeric, 1.00::numeric, 0.80::numeric, 3.00::numeric, 0.00::numeric, '4 hours', 14, 40, 'Less Than', 1440),
      (7, 'Starter · Altcoin Mean Reversion 1h', 'dca', array['AVAX/USDT','LINK/USDT','NEAR/USDT','AAVE/USDT']::text[], 62, 63, 1.55::numeric, 1.35::numeric, 300::numeric, 150::numeric, 3, 2, 4, 1.50::numeric, 1.10::numeric, 1.20::numeric, 1.60::numeric, 4.00::numeric, 0.00::numeric, '1 hour', 14, 30, 'Less Than', 600),
      (8, 'Starter · Fast Momentum 5m', 'dca', array['SOL/USDT','DOGE/USDT','GALA/USDT','RUNE/USDT']::text[], 70, 54, 0.95::numeric, 1.00::numeric, 180::numeric, 90::numeric, 1, 1, 5, 0.80::numeric, 1.00::numeric, 1.00::numeric, 1.00::numeric, 1.80::numeric, 0.15::numeric, '5 minutes', 7, 65, 'Greater Than', 75),
      (9, 'Starter · TV Momentum Stream', 'tradingview_strategy', array['BTC/USDT','ETH/USDT','SOL/USDT']::text[], 64, 70, 0.75::numeric, 1.05::numeric, 350::numeric, 0::numeric, 0, 0, 3, 1.00::numeric, 1.00::numeric, 1.00::numeric, 1.20::numeric, 2.50::numeric, 0.00::numeric, '1 minute', 14, 1000000, 'Greater Than', 210),
      (10, 'Starter · TV Multi-Pair Swing', 'tradingview_strategy', array['BTC/USDT','ETH/USDT','BNB/USDT','XRP/USDT']::text[], 66, 49, 0.95::numeric, 1.15::numeric, 450::numeric, 0::numeric, 0, 0, 4, 1.00::numeric, 1.00::numeric, 1.00::numeric, 1.50::numeric, 3.00::numeric, 0.00::numeric, '1 minute', 14, 1000000, 'Greater Than', 480)
    ) as d(
      idx, name, automation_type, pairs, trade_count, win_rate, win_roi, loss_roi,
      base_order, safety_order, max_safety_orders, limit_safety_orders, max_active_trades,
      deviation, step_scale, volume_scale, take_profit_pct, stop_pct, trailing_pct,
      timeframe, rsi_length, rsi_signal, comparator, hold_base_minutes
    )
  loop
    v_client_id := 'starter-demo-v1-' || lpad(v_def.idx::text, 2, '0');
    v_created_at := now() - interval '132 days' + make_interval(hours => v_def.idx);

    if v_def.automation_type = 'tradingview_strategy' then
      v_conditions := jsonb_build_array(jsonb_build_object(
        'id', 'starter-tv-condition-' || v_def.idx,
        'kind', 'RSI', 'length', 14, 'signal', 1000000,
        'timeframe', '1 minute', 'comparator', 'Greater Than',
        'aux1', 0, 'aux2', 0, 'aux3', 0
      ));
    else
      v_conditions := jsonb_build_array(jsonb_build_object(
        'id', 'starter-condition-' || v_def.idx,
        'kind', 'RSI', 'length', v_def.rsi_length, 'signal', v_def.rsi_signal,
        'timeframe', v_def.timeframe, 'comparator', v_def.comparator,
        'aux1', 0, 'aux2', 0, 'aux3', 0
      ));
    end if;

    select id into v_bot_id
    from public.trader_bots
    where account_id = p_account_id and client_id = v_client_id;

    if v_bot_id is null then
      insert into public.trader_bots (
        account_id, client_id, name, status, pair, pairs, all_pairs,
        base_order, safety_order, max_safety_orders, limit_safety_orders, max_active_trades,
        deviation, step_scale, volume_scale, take_profit_pct, stop_enabled, stop_pct,
        trailing_pct, max_hold_enabled, averaging_enabled, order_type, conditions,
        client_state, created_at, updated_at, is_archived, execution_mode, tradingview_enabled
      ) values (
        p_account_id, v_client_id, v_def.name, 'Stopped', v_def.pairs[1], v_def.pairs, false,
        v_def.base_order, greatest(v_def.safety_order, 1), v_def.max_safety_orders, v_def.limit_safety_orders, v_def.max_active_trades,
        v_def.deviation, v_def.step_scale, v_def.volume_scale,
        case when v_def.automation_type = 'tradingview_strategy' then 999999 else v_def.take_profit_pct end,
        case when v_def.automation_type = 'tradingview_strategy' then false else true end,
        case when v_def.automation_type = 'tradingview_strategy' then 0 else v_def.stop_pct end,
        v_def.trailing_pct, false, v_def.max_safety_orders > 0, 'Market', v_conditions,
        case when v_def.automation_type = 'tradingview_strategy' then
          jsonb_build_object(
            'name', v_def.name, 'status', 'Stopped', 'createdAt', v_created_at,
            'executionMode', 'paper', 'automationType', 'tradingview_strategy',
            'startCondition', 'TradingView Strategy', 'symbolSource', 'tradingview',
            'dynamicSymbol', true, 'entrySizing', 'fixed_quote', 'exitSizing', 'tradingview_order_stream',
            'positionModel', 'tradingview_order_stream', 'strategyVersion', 5,
            'fixedOrderAmount', v_def.base_order, 'strategyMaxOpenPositions', v_def.max_active_trades,
            'allowedQuoteAsset', 'USDT', 'takeProfitEnabled', false, 'takeProfitTargets', '[]'::jsonb,
            'exitProtectionEnabled', false,
            'starterDemo', true, 'starterHistory', true, 'starterVersion', 1,
            'historySource', 'simulated_demo', 'historyLabel', 'Demo history · simulated'
          )
        else
          jsonb_build_object(
            'id', v_client_id, 'name', v_def.name, 'pair', v_def.pairs[1], 'pairs', to_jsonb(v_def.pairs),
            'status', 'Stopped', 'allPairs', false, 'baseOrder', v_def.base_order,
            'safetyOrder', v_def.safety_order, 'maxSafetyOrders', v_def.max_safety_orders,
            'limitSafetyOrders', v_def.limit_safety_orders, 'maxActiveTrades', v_def.max_active_trades,
            'deviation', v_def.deviation, 'stepScale', v_def.step_scale, 'volumeScale', v_def.volume_scale,
            'takeProfit', v_def.take_profit_pct, 'stopEnabled', true, 'stopPct', v_def.stop_pct,
            'trailingPct', v_def.trailing_pct, 'averagingEnabled', v_def.max_safety_orders > 0,
            'direction', 'Long', 'orderType', 'Market', 'executionMode', 'paper',
            'conditions', v_conditions, 'startCondition', 'RSI', 'createdAt', v_created_at,
            'takeProfitTargets', jsonb_build_array(jsonb_build_object('profitPct', v_def.take_profit_pct, 'allocationPct', 100)),
            'starterDemo', true, 'starterHistory', true, 'starterVersion', 1,
            'historySource', 'simulated_demo', 'historyLabel', 'Demo history · simulated'
          )
        end,
        v_created_at, v_created_at, false, 'paper', false
      ) returning id into v_bot_id;
    end if;

    for v_i in 1..v_def.trade_count loop
      v_pair_index := 1 + mod(v_i - 1, array_length(v_def.pairs, 1));
      v_pair := v_def.pairs[v_pair_index];

      v_base_price := case v_pair
        when 'BTC/USDT' then 80000
        when 'ETH/USDT' then 3500
        when 'SOL/USDT' then 180
        when 'BNB/USDT' then 700
        when 'XRP/USDT' then 1.55
        when 'ADA/USDT' then 0.65
        when 'LINK/USDT' then 20
        when 'AVAX/USDT' then 28
        when 'DOGE/USDT' then 0.22
        when 'SUI/USDT' then 4.00
        when 'GALA/USDT' then 0.0020
        when 'RUNE/USDT' then 1.70
        when 'NEAR/USDT' then 3.20
        when 'AAVE/USDT' then 300
        else 10 end;

      if v_def.max_safety_orders <= 0 then
        v_depth := 0;
      else
        v_depth := least(
          v_def.max_safety_orders,
          case
            when mod(v_i * 13 + v_def.idx * 7, 100) < 47 then 0
            when mod(v_i * 13 + v_def.idx * 7, 100) < 72 then 1
            when mod(v_i * 13 + v_def.idx * 7, 100) < 88 then 2
            when mod(v_i * 13 + v_def.idx * 7, 100) < 96 then 3
            else 4
          end
        );
      end if;

      v_capital := v_def.base_order;
      if v_depth > 0 then
        for v_j in 0..v_depth - 1 loop
          v_capital := v_capital + v_def.safety_order * power(v_def.volume_scale, v_j);
        end loop;
      end if;

      v_entry_price := v_base_price * (
        1
        + 0.055 * sin((v_i + v_def.idx * 3)::double precision / 7.5)
        + 0.018 * cos((v_i + v_def.idx)::double precision / 4.2)
      );
      v_average_price := v_entry_price * greatest(0.85, 1 - (v_depth * v_def.deviation * 0.0045));

      v_is_win := mod(v_i * 37 + v_def.idx * 19, 100) < v_def.win_rate;
      if v_is_win then
        v_roi := v_def.win_roi * (0.82 + mod(v_i * 17 + v_def.idx * 11, 39)::numeric / 100);
      else
        v_roi := -v_def.loss_roi * (0.82 + mod(v_i * 23 + v_def.idx * 5, 39)::numeric / 100);
      end if;

      v_realized := v_capital * v_roi / 100;
      v_exit_price := v_average_price * (1 + v_roi / 100);
      v_quantity := v_capital / nullif(v_average_price, 0);
      v_duration_minutes := greatest(20, v_def.hold_base_minutes + mod(v_i * 53 + v_def.idx * 29, greatest(60, v_def.hold_base_minutes)) + v_depth * 210);
      v_closed_at := now() - interval '125 days'
        + interval '122 days' * ((v_i - 1)::numeric / greatest(v_def.trade_count - 1, 1))
        + make_interval(hours => mod(v_i * 7 + v_def.idx * 3, 18));
      v_opened_at := v_closed_at - make_interval(mins => v_duration_minutes);
      v_trade_client_id := format('starter-demo-v1-%s-trade-%s', lpad(v_def.idx::text,2,'0'), lpad(v_i::text,3,'0'));

      if v_def.automation_type = 'tradingview_strategy' then
        v_close_reason := case when not v_is_win and mod(v_i, 4) = 0 then 'Stop Loss' else 'TradingView Strategy SELL' end;
      elsif v_is_win then
        v_close_reason := case when mod(v_i, 5) = 0 then 'Trailing Take Profit' else 'Take Profit' end;
      else
        v_close_reason := case when mod(v_i, 4) = 0 then 'Maximum hold period' else 'Stop Loss' end;
      end if;

      insert into public.trader_trades (
        account_id, bot_id, client_id, pair, status,
        entry_price, average_price, quantity, invested,
        averaging_filled, max_averaging, active_orders_limit,
        take_profit_pct, trailing_enabled, trailing_deviation_pct,
        stop_enabled, stop_pct, last_price, realized_pnl, exit_price, close_reason,
        client_state, opened_at, closed_at, created_at, updated_at, execution_mode, total_invested
      ) values (
        p_account_id, v_bot_id, v_trade_client_id, v_pair, 'Closed',
        v_entry_price, v_average_price, v_quantity, v_capital,
        v_depth, v_def.max_safety_orders, least(v_def.limit_safety_orders, v_def.max_safety_orders),
        case when v_def.automation_type = 'tradingview_strategy' then 0 else v_def.take_profit_pct end,
        v_def.trailing_pct > 0, v_def.trailing_pct,
        case when v_def.automation_type = 'tradingview_strategy' then false else true end,
        case when v_def.automation_type = 'tradingview_strategy' then 0 else v_def.stop_pct end,
        v_exit_price, v_realized, v_exit_price, v_close_reason,
        jsonb_build_object(
          'botName', v_def.name, 'automationType', v_def.automation_type,
          'starterDemo', true, 'starterHistory', true, 'starterVersion', 1,
          'historySource', 'simulated_demo', 'historyLabel', 'Demo history · simulated',
          'simulatedRoiPct', v_roi
        ),
        v_opened_at, v_closed_at, v_opened_at, v_closed_at, 'paper', v_capital
      ) on conflict (account_id, client_id) do nothing;

      if v_def.automation_type = 'tradingview_strategy' then
        v_received_at := v_opened_at - interval '1 second';
        v_event_key := v_trade_client_id || '-start';
        v_signal_id := format('starter-tv-%s-%s-start|%s', v_def.idx, v_i, (extract(epoch from v_received_at) * 1000)::bigint);
        if not exists (
          select 1 from public.trader_tradingview_events where account_id = p_account_id and dedupe_key = v_event_key
        ) then
          insert into public.trader_tradingview_events (
            account_id, bot_id, action, pair, amount, signal_id, dedupe_key,
            status, received_at, processed_at, error, payload
          ) values (
            p_account_id, v_bot_id, 'start', v_pair, v_capital, v_signal_id, v_event_key,
            'processed', v_received_at, v_opened_at, null,
            jsonb_build_object(
              'starterDemo', true,
              'orderContext', jsonb_build_object('contracts',1,'orderPrice',v_average_price,'positionSize',v_quantity,'prevPositionSize',0,'marketPosition','long','prevMarketPosition','flat'),
              'result', jsonb_build_object('tradeId',v_trade_client_id,'positionAction','opened','requestedQuote',v_capital,'price',v_average_price,'quote',v_capital,'executedQty',v_quantity)
            )
          );
        end if;

        v_received_at := v_closed_at - interval '1 second';
        v_event_key := v_trade_client_id || '-close';
        v_signal_id := format('starter-tv-%s-%s-close|%s', v_def.idx, v_i, (extract(epoch from v_received_at) * 1000)::bigint);
        if not exists (
          select 1 from public.trader_tradingview_events where account_id = p_account_id and dedupe_key = v_event_key
        ) then
          insert into public.trader_tradingview_events (
            account_id, bot_id, action, pair, amount, signal_id, dedupe_key,
            status, received_at, processed_at, error, payload
          ) values (
            p_account_id, v_bot_id, 'close', v_pair, v_capital, v_signal_id, v_event_key,
            'processed', v_received_at, v_closed_at, null,
            jsonb_build_object(
              'starterDemo', true,
              'orderContext', jsonb_build_object('contracts',1,'orderPrice',v_exit_price,'positionSize',0,'prevPositionSize',v_quantity,'marketPosition','flat','prevMarketPosition','long'),
              'result', jsonb_build_object('tradeId',v_trade_client_id,'positionAction','closed','requestedQuote',v_capital,'price',v_exit_price,'quote',v_capital + v_realized,'executedQty',v_quantity)
            )
          );
        end if;

        if mod(v_i, 5) = 0 then
          v_received_at := v_closed_at + interval '20 minutes';
          v_event_key := v_trade_client_id || '-ignored';
          v_signal_id := format('starter-tv-%s-%s-ignored|%s', v_def.idx, v_i, (extract(epoch from v_received_at) * 1000)::bigint);
          v_noise_reason := case when mod(v_i, 10) = 0 then 'no_active_position' else 'position_capacity_reached' end;
          if not exists (
            select 1 from public.trader_tradingview_events where account_id = p_account_id and dedupe_key = v_event_key
          ) then
            insert into public.trader_tradingview_events (
              account_id, bot_id, action, pair, amount, signal_id, dedupe_key,
              status, received_at, processed_at, error, payload
            ) values (
              p_account_id, v_bot_id, case when mod(v_i,10)=0 then 'close' else 'start' end,
              v_pair, v_def.base_order, v_signal_id, v_event_key,
              'ignored', v_received_at, v_received_at + interval '450 milliseconds', null,
              jsonb_build_object('starterDemo',true,'result',jsonb_build_object('reason',v_noise_reason,'requestedQuote',v_def.base_order))
            );
          end if;
        end if;

        if mod(v_i, 8) = 0 then
          v_received_at := v_closed_at + interval '35 minutes';
          v_event_key := v_trade_client_id || '-failed';
          v_signal_id := format('starter-tv-%s-%s-failed|%s', v_def.idx, v_i, (extract(epoch from v_received_at) * 1000)::bigint);
          if not exists (
            select 1 from public.trader_tradingview_events where account_id = p_account_id and dedupe_key = v_event_key
          ) then
            insert into public.trader_tradingview_events (
              account_id, bot_id, action, pair, amount, signal_id, dedupe_key,
              status, received_at, processed_at, error, payload
            ) values (
              p_account_id, v_bot_id, 'start', v_pair, v_def.base_order, v_signal_id, v_event_key,
              'failed', v_received_at, v_received_at + interval '1200 milliseconds',
              'gateway_500:The operation was aborted due to timeout',
              jsonb_build_object('starterDemo',true,'result',jsonb_build_object('reason','gateway_500:The operation was aborted due to timeout','requestedQuote',v_def.base_order))
            );
          end if;
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.trader_seed_starter_paper_account(uuid) from public;

create or replace function public.trader_seed_starter_paper_account_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.owner_user_id is not null
     and new.status = 'active'
     and (new.mode = 'paper' or new.account_kind = 'paper') then
    perform public.trader_seed_starter_paper_account(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.trader_seed_starter_paper_account_trigger() from public;

drop trigger if exists trader_accounts_seed_starter_paper_history on public.trader_accounts;
create trigger trader_accounts_seed_starter_paper_history
after insert or update of owner_user_id, account_kind, mode, status
on public.trader_accounts
for each row
when (
  new.owner_user_id is not null
  and new.status = 'active'
  and (new.mode = 'paper' or new.account_kind = 'paper')
)
execute function public.trader_seed_starter_paper_account_trigger();
