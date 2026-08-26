alter table public.trader_trades add column if not exists total_invested numeric(30,12) not null default 0;

update public.trader_trades t
set total_invested = greatest(
  coalesce(t.invested, 0),
  coalesce((
    select sum(coalesce(f.quote_amount,0))
    from public.trader_fills f
    where f.trade_id = t.id and upper(coalesce(f.side,'')) = 'BUY'
  ),0)
);

create or replace function public.trader_refresh_total_invested_from_fills()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade_id uuid;
begin
  v_trade_id := coalesce(new.trade_id, old.trade_id);
  if v_trade_id is not null then
    update public.trader_trades t
    set total_invested = coalesce((
      select sum(coalesce(f.quote_amount,0))
      from public.trader_fills f
      where f.trade_id = v_trade_id and upper(coalesce(f.side,'')) = 'BUY'
    ),0)
    where t.id = v_trade_id;
  end if;

  if tg_op = 'UPDATE' and old.trade_id is distinct from new.trade_id and old.trade_id is not null then
    update public.trader_trades t
    set total_invested = coalesce((
      select sum(coalesce(f.quote_amount,0))
      from public.trader_fills f
      where f.trade_id = old.trade_id and upper(coalesce(f.side,'')) = 'BUY'
    ),0)
    where t.id = old.trade_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trader_fills_refresh_total_invested on public.trader_fills;
create trigger trader_fills_refresh_total_invested
after insert or update or delete on public.trader_fills
for each row execute function public.trader_refresh_total_invested_from_fills();
