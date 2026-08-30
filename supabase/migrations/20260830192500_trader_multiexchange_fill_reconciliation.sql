-- Keep exchange reconciliation idempotent across entry/edit/close paths.
-- 1) A DCA fill may be discovered while the trade is transitioning through Closing.
-- 2) The legacy buy-fill RPC already writes the aggregate fill row, so an adapter-level
--    replay of the exact same fill must not create a duplicate accounting row.

create or replace function public.trader_fill_buy_order(
  p_order_id uuid,
  p_fill_price numeric,
  p_fill_quantity numeric,
  p_fill_quote numeric,
  p_fee_amount numeric default 0,
  p_increment_averaging boolean default true
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.trader_orders%rowtype;
  v_trade public.trader_trades%rowtype;
  v_new_qty numeric;
  v_new_invested numeric;
begin
  select * into v_order from public.trader_orders where id=p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status = 'FILLED' then return v_order.trade_id; end if;
  if v_order.status not in ('OPEN','PENDING','NEW','PARTIALLY_FILLED') then return v_order.trade_id; end if;
  if v_order.side <> 'BUY' or v_order.trade_id is null then raise exception 'not a trade buy order'; end if;

  select * into v_trade from public.trader_trades where id=v_order.trade_id for update;
  if not found or v_trade.status not in ('Active','Closing') then raise exception 'active trade not found'; end if;

  update public.trader_orders set
    status='FILLED', reserved_quote=0, filled_qty=p_fill_quantity, filled_quote=p_fill_quote,
    average_fill_price=p_fill_price, filled_at=now()
  where id=p_order_id;

  insert into public.trader_fills(account_id, bot_id, trade_id, order_id, pair, side, kind, price, quantity, quote_amount, fee_amount, filled_at)
  values (v_order.account_id, v_order.bot_id, v_order.trade_id, v_order.id, v_order.pair, 'BUY',
    case when v_order.kind='add_funds' then 'Add Funds' else 'Averaging' end,
    p_fill_price, p_fill_quantity, p_fill_quote, greatest(0,p_fee_amount), now());

  v_new_qty := v_trade.quantity + p_fill_quantity;
  v_new_invested := v_trade.invested + p_fill_quote + greatest(0,p_fee_amount);
  update public.trader_trades set
    quantity=v_new_qty,
    invested=v_new_invested,
    average_price=case when v_new_qty>0 then v_new_invested/v_new_qty else average_price end,
    averaging_filled=averaging_filled + case when p_increment_averaging then 1 else 0 end,
    last_price=p_fill_price
  where id=v_trade.id;
  return v_trade.id;
end;
$function$;

create or replace function public.trader_suppress_duplicate_adapter_fill()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.metadata ? 'exchange'
     and new.order_id is not null
     and exists (
       select 1
       from public.trader_fills f
       where f.order_id = new.order_id
         and f.side = new.side
         and f.kind = new.kind
         and abs(coalesce(f.price,0) - coalesce(new.price,0)) < 0.000000000001
         and abs(coalesce(f.quantity,0) - coalesce(new.quantity,0)) < 0.000000000001
         and abs(coalesce(f.quote_amount,0) - coalesce(new.quote_amount,0)) < 0.00000001
     )
  then
    return null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trader_suppress_duplicate_adapter_fill on public.trader_fills;
create trigger trader_suppress_duplicate_adapter_fill
before insert on public.trader_fills
for each row execute function public.trader_suppress_duplicate_adapter_fill();
