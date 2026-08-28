create table if not exists public.trader_paper_core_holdings (
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  symbol text not null,
  quantity numeric not null check (quantity >= 0),
  average_cost numeric not null check (average_cost > 0),
  acquired_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, symbol)
);

alter table public.trader_paper_core_holdings enable row level security;
revoke all on public.trader_paper_core_holdings from anon;
grant select, insert, update, delete on public.trader_paper_core_holdings to authenticated;
grant all on public.trader_paper_core_holdings to service_role;

drop policy if exists trader_paper_core_holdings_owner_select on public.trader_paper_core_holdings;
create policy trader_paper_core_holdings_owner_select on public.trader_paper_core_holdings
for select to authenticated using (
  exists (select 1 from public.trader_accounts a where a.id = account_id and a.owner_user_id = auth.uid())
);
drop policy if exists trader_paper_core_holdings_owner_insert on public.trader_paper_core_holdings;
create policy trader_paper_core_holdings_owner_insert on public.trader_paper_core_holdings
for insert to authenticated with check (
  exists (select 1 from public.trader_accounts a where a.id = account_id and a.owner_user_id = auth.uid() and (a.mode='paper' or a.account_kind='paper'))
);
drop policy if exists trader_paper_core_holdings_owner_update on public.trader_paper_core_holdings;
create policy trader_paper_core_holdings_owner_update on public.trader_paper_core_holdings
for update to authenticated using (
  exists (select 1 from public.trader_accounts a where a.id = account_id and a.owner_user_id = auth.uid() and (a.mode='paper' or a.account_kind='paper'))
) with check (
  exists (select 1 from public.trader_accounts a where a.id = account_id and a.owner_user_id = auth.uid() and (a.mode='paper' or a.account_kind='paper'))
);
drop policy if exists trader_paper_core_holdings_owner_delete on public.trader_paper_core_holdings;
create policy trader_paper_core_holdings_owner_delete on public.trader_paper_core_holdings
for delete to authenticated using (
  exists (select 1 from public.trader_accounts a where a.id = account_id and a.owner_user_id = auth.uid() and (a.mode='paper' or a.account_kind='paper'))
);

drop trigger if exists trader_paper_core_holdings_touch on public.trader_paper_core_holdings;
create trigger trader_paper_core_holdings_touch before update on public.trader_paper_core_holdings
for each row execute function public.trader_touch_updated_at();

create or replace function public.trader_seed_paper_core_holdings(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.trader_accounts a
    where a.id=p_account_id and a.owner_user_id is not null and a.status='active'
      and (a.mode='paper' or a.account_kind='paper')
  ) then return; end if;

  insert into public.trader_paper_core_holdings(account_id,symbol,quantity,average_cost,acquired_at,metadata)
  values
    (p_account_id,'BTC',28000::numeric/68500,68500,now()-interval '220 days',jsonb_build_object('starterDemo',true,'starterVersion',2,'purchaseCost',28000,'label','Long-term demo holding')),
    (p_account_id,'ETH',16000::numeric/2150,2150,now()-interval '185 days',jsonb_build_object('starterDemo',true,'starterVersion',2,'purchaseCost',16000,'label','Long-term demo holding')),
    (p_account_id,'SOL',8000::numeric/92,92,now()-interval '150 days',jsonb_build_object('starterDemo',true,'starterVersion',2,'purchaseCost',8000,'label','Long-term demo holding')),
    (p_account_id,'BNB',6000::numeric/640,640,now()-interval '120 days',jsonb_build_object('starterDemo',true,'starterVersion',2,'purchaseCost',6000,'label','Long-term demo holding'))
  on conflict (account_id,symbol) do nothing;
end;
$$;

revoke all on function public.trader_seed_paper_core_holdings(uuid) from public, anon, authenticated;
grant execute on function public.trader_seed_paper_core_holdings(uuid) to service_role;

create or replace function public.trader_upgrade_starter_paper_demo_v2(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_def record;
  v_bot public.trader_bots%rowtype;
  v_bot_id uuid;
  v_automation_type text;
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
  if not exists (
    select 1 from public.trader_accounts a
    where a.id=p_account_id and a.owner_user_id is not null and a.status='active'
      and (a.mode='paper' or a.account_kind='paper')
  ) then return; end if;

  delete from public.trader_tradingview_events e
  using public.trader_bots b
  where e.bot_id=b.id and b.account_id=p_account_id
    and b.client_id like 'starter-demo-v1-%'
    and b.client_state->>'starterDemo'='true'
    and e.payload->>'starterDemo'='true';

  delete from public.trader_trades t
  using public.trader_bots b
  where t.bot_id=b.id and b.account_id=p_account_id
    and b.client_id like 'starter-demo-v1-%'
    and b.client_state->>'starterDemo'='true'
    and t.client_state->>'starterDemo'='true';

  for v_def in
    select * from (values
      (1,'Starter · RSI Recovery 15m','dca',array['BTC/USDT','ETH/USDT','SOL/USDT']::text[],72,74,6.0::numeric,3.0::numeric,180,
        jsonb_build_array(jsonb_build_object('id','starter-v2-01','kind','RSI','timeframe','15 minutes','length',14,'comparator','Crossing Up','signal',32,'aux1',14,'aux2',1,'aux3',3)),'RSI recovery'),
      (2,'Starter · Stochastic Momentum 5m','dca',array['SOL/USDT','BNB/USDT','LINK/USDT']::text[],66,67,8.0::numeric,4.0::numeric,90,
        jsonb_build_array(jsonb_build_object('id','starter-v2-02','kind','Stochastic','timeframe','5 minutes','length',0,'comparator','Less Than','signal',25,'aux1',14,'aux2',1,'aux3',3)),'Stochastic momentum'),
      (3,'Starter · BTC EMA Trend 1h','dca',array['BTC/USDT']::text[],60,61,12.0::numeric,6.0::numeric,720,
        jsonb_build_array(jsonb_build_object('id','starter-v2-03','kind','Moving Average (MA)','timeframe','1 hour','length',0,'comparator','Crossing Up','signal',0,'aux1',1,'aux2',20,'aux3',50)),'EMA 20 / 50 trend'),
      (4,'Starter · ETH Bollinger Pullback 30m','dca',array['ETH/USDT']::text[],68,72,7.0::numeric,3.5::numeric,360,
        jsonb_build_array(jsonb_build_object('id','starter-v2-04','kind','Bollinger Bands %B','timeframe','30 minutes','length',20,'comparator','Crossing Up','signal',0.10,'aux1',2,'aux2',0,'aux3',0)),'Bollinger pullback'),
      (5,'Starter · ADX Volatility DCA 15m','dca',array['ADA/USDT','XRP/USDT','DOGE/USDT','SUI/USDT']::text[],74,77,6.5::numeric,4.0::numeric,240,
        jsonb_build_array(jsonb_build_object('id','starter-v2-05','kind','Average Directional Index','timeframe','15 minutes','length',14,'comparator','Greater Than','signal',28,'aux1',0,'aux2',0,'aux3',0)),'ADX strength'),
      (6,'Starter · MFI Conservative 4h','dca',array['BTC/USDT','ETH/USDT','BNB/USDT']::text[],58,83,4.0::numeric,2.5::numeric,1440,
        jsonb_build_array(jsonb_build_object('id','starter-v2-06','kind','Money Flow Index','timeframe','4 hours','length',14,'comparator','Crossing Up','signal',25,'aux1',0,'aux2',0,'aux3',0)),'MFI recovery'),
      (7,'Starter · CCI Mean Reversion 1h','dca',array['AVAX/USDT','LINK/USDT','NEAR/USDT','AAVE/USDT']::text[],62,65,9.0::numeric,4.5::numeric,600,
        jsonb_build_array(jsonb_build_object('id','starter-v2-07','kind','Commodity Channel Index','timeframe','1 hour','length',20,'comparator','Crossing Up','signal',-100,'aux1',0,'aux2',0,'aux3',0)),'CCI mean reversion'),
      (8,'Starter · MACD Fast Momentum 5m','dca',array['SOL/USDT','DOGE/USDT','GALA/USDT','RUNE/USDT']::text[],70,56,13.0::numeric,8.0::numeric,75,
        jsonb_build_array(jsonb_build_object('id','starter-v2-08','kind','MACD','timeframe','5 minutes','length',0,'comparator','Crossing Up','signal',0,'aux1',12,'aux2',26,'aux3',9)),'MACD momentum'),
      (9,'Starter · TV Momentum Stream','tradingview_strategy',array['BTC/USDT','ETH/USDT','SOL/USDT']::text[],64,71,8.0::numeric,4.5::numeric,210,'[]'::jsonb,'TradingView Strategy'),
      (10,'Starter · TV Multi-Pair Swing','tradingview_strategy',array['BTC/USDT','ETH/USDT','BNB/USDT','XRP/USDT']::text[],66,48,6.0::numeric,7.0::numeric,480,'[]'::jsonb,'TradingView Strategy')
    ) as d(idx,name,automation_type,pairs,trade_count,win_rate,win_roi,loss_roi,hold_base_minutes,conditions,start_label)
  loop
    select * into v_bot
    from public.trader_bots
    where account_id=p_account_id
      and client_id='starter-demo-v1-'||lpad(v_def.idx::text,2,'0')
      and client_state->>'starterDemo'='true';
    if not found then continue; end if;

    v_bot_id := v_bot.id;
    v_automation_type := v_def.automation_type;
    v_conditions := v_def.conditions;

    update public.trader_bots
    set name=v_def.name,
        pair=v_def.pairs[1], pairs=v_def.pairs,
        conditions=v_conditions,
        status='Stopped',
        client_state=coalesce(client_state,'{}'::jsonb) || jsonb_build_object(
          'name',v_def.name,'status','Stopped','conditions',v_conditions,
          'startCondition',v_def.start_label,'starterVersion',2,
          'historySource','simulated_demo','historyLabel','Demo history · simulated',
          'demoProfile','diversified_strategy_history'
        ),
        updated_at=now()
    where id=v_bot_id;

    for v_i in 1..v_def.trade_count loop
      v_pair_index := 1 + mod(v_i - 1, array_length(v_def.pairs,1));
      v_pair := v_def.pairs[v_pair_index];
      v_base_price := case v_pair
        when 'BTC/USDT' then 72000 when 'ETH/USDT' then 2600 when 'SOL/USDT' then 125
        when 'BNB/USDT' then 650 when 'XRP/USDT' then 1.30 when 'ADA/USDT' then 0.55
        when 'LINK/USDT' then 18 when 'AVAX/USDT' then 26 when 'DOGE/USDT' then 0.18
        when 'SUI/USDT' then 3.20 when 'GALA/USDT' then 0.0025 when 'RUNE/USDT' then 1.60
        when 'NEAR/USDT' then 3.00 when 'AAVE/USDT' then 260 else 10 end;

      if v_bot.max_safety_orders <= 0 then v_depth:=0;
      else
        v_depth := least(v_bot.max_safety_orders,case
          when mod(v_i*13+v_def.idx*7,100)<42 then 0
          when mod(v_i*13+v_def.idx*7,100)<68 then 1
          when mod(v_i*13+v_def.idx*7,100)<86 then 2
          when mod(v_i*13+v_def.idx*7,100)<96 then 3 else 4 end);
      end if;

      v_capital := v_bot.base_order;
      if v_depth>0 then
        for v_j in 0..v_depth-1 loop
          v_capital := v_capital + v_bot.safety_order * power(greatest(v_bot.volume_scale,0.000001),v_j);
        end loop;
      end if;

      v_entry_price := v_base_price*(1 + 0.075*sin((v_i+v_def.idx*3)::double precision/7.5) + 0.025*cos((v_i+v_def.idx)::double precision/4.2));
      v_average_price := v_entry_price*greatest(0.80,1-(v_depth*v_bot.deviation*0.0045));
      v_is_win := mod(v_i*37+v_def.idx*19,100)<v_def.win_rate;
      if v_is_win then v_roi := v_def.win_roi*(0.78+mod(v_i*17+v_def.idx*11,45)::numeric/100);
      else v_roi := -v_def.loss_roi*(0.78+mod(v_i*23+v_def.idx*5,45)::numeric/100); end if;

      v_realized := v_capital*v_roi/100;
      v_exit_price := v_average_price*(1+v_roi/100);
      v_quantity := v_capital/nullif(v_average_price,0);
      v_duration_minutes := greatest(20,v_def.hold_base_minutes+mod(v_i*53+v_def.idx*29,greatest(60,v_def.hold_base_minutes))+v_depth*210);
      v_closed_at := now()-interval '125 days' + interval '122 days'*((v_i-1)::numeric/greatest(v_def.trade_count-1,1)) + make_interval(hours=>mod(v_i*7+v_def.idx*3,18));
      v_opened_at := v_closed_at-make_interval(mins=>v_duration_minutes);
      v_trade_client_id := format('starter-demo-v2-%s-trade-%s',lpad(v_def.idx::text,2,'0'),lpad(v_i::text,3,'0'));

      if v_automation_type='tradingview_strategy' then
        v_close_reason := case when not v_is_win and mod(v_i,4)=0 then 'Stop Loss' else 'TradingView Strategy SELL' end;
      elsif v_is_win then
        v_close_reason := case when mod(v_i,5)=0 then 'Trailing Take Profit' else 'Take Profit' end;
      else
        v_close_reason := case when mod(v_i,4)=0 then 'Maximum hold period' else 'Stop Loss' end;
      end if;

      insert into public.trader_trades(
        account_id,bot_id,client_id,pair,status,entry_price,average_price,quantity,invested,
        averaging_filled,max_averaging,active_orders_limit,take_profit_pct,trailing_enabled,trailing_deviation_pct,
        stop_enabled,stop_pct,last_price,realized_pnl,exit_price,close_reason,client_state,
        opened_at,closed_at,created_at,updated_at,execution_mode,total_invested
      ) values (
        p_account_id,v_bot_id,v_trade_client_id,v_pair,'Closed',v_entry_price,v_average_price,v_quantity,v_capital,
        v_depth,v_bot.max_safety_orders,least(v_bot.limit_safety_orders,v_bot.max_safety_orders),
        case when v_automation_type='tradingview_strategy' then 0 else v_bot.take_profit_pct end,
        v_bot.trailing_pct>0,v_bot.trailing_pct,
        case when v_automation_type='tradingview_strategy' then false else v_bot.stop_enabled end,
        case when v_automation_type='tradingview_strategy' then 0 else v_bot.stop_pct end,
        v_exit_price,v_realized,v_exit_price,v_close_reason,
        jsonb_build_object('botName',v_def.name,'automationType',v_automation_type,'starterDemo',true,'starterHistory',true,'starterVersion',2,'historySource','simulated_demo','historyLabel','Demo history · simulated','simulatedRoiPct',v_roi,'demoEntryModel',v_def.start_label),
        v_opened_at,v_closed_at,v_opened_at,v_closed_at,'paper',v_capital
      );

      if v_automation_type='tradingview_strategy' then
        v_received_at:=v_opened_at-interval '1 second'; v_event_key:=v_trade_client_id||'-start';
        v_signal_id:=format('starter-tv-v2-%s-%s-start|%s',v_def.idx,v_i,(extract(epoch from v_received_at)*1000)::bigint);
        insert into public.trader_tradingview_events(account_id,bot_id,action,pair,amount,signal_id,dedupe_key,status,received_at,processed_at,error,payload)
        values(p_account_id,v_bot_id,'start',v_pair,v_capital,v_signal_id,v_event_key,'processed',v_received_at,v_opened_at,null,
          jsonb_build_object('starterDemo',true,'starterVersion',2,'orderContext',jsonb_build_object('contracts',1,'orderPrice',v_average_price,'positionSize',v_quantity,'prevPositionSize',0,'marketPosition','long','prevMarketPosition','flat'),'result',jsonb_build_object('tradeId',v_trade_client_id,'positionAction','opened','requestedQuote',v_capital,'price',v_average_price,'quote',v_capital,'executedQty',v_quantity)));

        v_received_at:=v_closed_at-interval '1 second'; v_event_key:=v_trade_client_id||'-close';
        v_signal_id:=format('starter-tv-v2-%s-%s-close|%s',v_def.idx,v_i,(extract(epoch from v_received_at)*1000)::bigint);
        insert into public.trader_tradingview_events(account_id,bot_id,action,pair,amount,signal_id,dedupe_key,status,received_at,processed_at,error,payload)
        values(p_account_id,v_bot_id,'close',v_pair,v_capital,v_signal_id,v_event_key,'processed',v_received_at,v_closed_at,null,
          jsonb_build_object('starterDemo',true,'starterVersion',2,'orderContext',jsonb_build_object('contracts',1,'orderPrice',v_exit_price,'positionSize',0,'prevPositionSize',v_quantity,'marketPosition','flat','prevMarketPosition','long'),'result',jsonb_build_object('tradeId',v_trade_client_id,'positionAction','closed','requestedQuote',v_capital,'price',v_exit_price,'quote',v_capital+v_realized,'executedQty',v_quantity)));

        if mod(v_i,5)=0 then
          v_received_at:=v_closed_at+interval '20 minutes'; v_event_key:=v_trade_client_id||'-ignored';
          v_signal_id:=format('starter-tv-v2-%s-%s-ignored|%s',v_def.idx,v_i,(extract(epoch from v_received_at)*1000)::bigint);
          v_noise_reason:=case when mod(v_i,10)=0 then 'no_active_position' else 'position_capacity_reached' end;
          insert into public.trader_tradingview_events(account_id,bot_id,action,pair,amount,signal_id,dedupe_key,status,received_at,processed_at,error,payload)
          values(p_account_id,v_bot_id,case when mod(v_i,10)=0 then 'close' else 'start' end,v_pair,v_bot.base_order,v_signal_id,v_event_key,'ignored',v_received_at,v_received_at+interval '450 milliseconds',null,
            jsonb_build_object('starterDemo',true,'starterVersion',2,'result',jsonb_build_object('reason',v_noise_reason,'requestedQuote',v_bot.base_order)));
        end if;
        if mod(v_i,8)=0 then
          v_received_at:=v_closed_at+interval '35 minutes'; v_event_key:=v_trade_client_id||'-failed';
          v_signal_id:=format('starter-tv-v2-%s-%s-failed|%s',v_def.idx,v_i,(extract(epoch from v_received_at)*1000)::bigint);
          insert into public.trader_tradingview_events(account_id,bot_id,action,pair,amount,signal_id,dedupe_key,status,received_at,processed_at,error,payload)
          values(p_account_id,v_bot_id,'start',v_pair,v_bot.base_order,v_signal_id,v_event_key,'failed',v_received_at,v_received_at+interval '1200 milliseconds','gateway_500:The operation was aborted due to timeout',
            jsonb_build_object('starterDemo',true,'starterVersion',2,'result',jsonb_build_object('reason','gateway_500:The operation was aborted due to timeout','requestedQuote',v_bot.base_order)));
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.trader_upgrade_starter_paper_demo_v2(uuid) from public, anon, authenticated;
grant execute on function public.trader_upgrade_starter_paper_demo_v2(uuid) to service_role;

create or replace function public.trader_seed_starter_paper_account_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_version integer;
begin
  if new.owner_user_id is not null and new.status='active' and (new.mode='paper' or new.account_kind='paper') then
    select version into v_version from public.trader_starter_seed_state where account_id=new.id;
    if coalesce(v_version,0)<1 then
      perform public.trader_seed_starter_paper_account(new.id);
      insert into public.trader_starter_seed_state(account_id,version) values(new.id,1)
      on conflict(account_id) do update set version=greatest(public.trader_starter_seed_state.version,excluded.version);
      v_version:=1;
    end if;
    if coalesce(v_version,0)<2 then
      perform public.trader_seed_paper_core_holdings(new.id);
      perform public.trader_upgrade_starter_paper_demo_v2(new.id);
      update public.trader_starter_seed_state set version=2 where account_id=new.id;
    end if;
  end if;
  return new;
end;
$$;

do $$ declare r record; begin
  for r in select a.id from public.trader_accounts a join public.trader_starter_seed_state s on s.account_id=a.id where s.version=1 and a.owner_user_id is not null and a.status='active' and (a.mode='paper' or a.account_kind='paper') loop
    perform public.trader_seed_paper_core_holdings(r.id);
    perform public.trader_upgrade_starter_paper_demo_v2(r.id);
    update public.trader_starter_seed_state set version=2 where account_id=r.id;
  end loop;
end $$;
