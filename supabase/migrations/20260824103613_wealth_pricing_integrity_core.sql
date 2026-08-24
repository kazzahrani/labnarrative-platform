create or replace function public.wealth_apply_quote_to_manual_holding()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_market text;
  v_symbol text;
  v_quote record;
  v_qty numeric;
  v_status text;
  v_symbol_changed boolean := false;
begin
  if new.connection_id is not null then return new; end if;
  if coalesce((new.metadata->>'market_price_managed')::boolean,false) is not true then return new; end if;
  if new.symbol is null then return new; end if;
  if new.asset_type not in ('saudi_stock','reit','global_stock','etf') then return new; end if;

  if tg_op='UPDATE' then
    v_symbol_changed := public.wealth_normalize_market_symbol(coalesce(old.symbol,'')) is distinct from public.wealth_normalize_market_symbol(coalesce(new.symbol,''));
  end if;

  v_market := case
    when new.asset_type in ('global_stock','etf') or upper(coalesce(new.metadata->>'original_currency',''))='USD' then 'US'
    else 'SA'
  end;
  v_symbol := public.wealth_normalize_market_symbol(new.symbol);
  v_qty := coalesce(new.quantity,0);

  select * into v_quote
  from public.wealth_market_quotes
  where market=v_market and symbol=v_symbol
  limit 1;

  if found and v_quote.price_sar is not null and v_quote.price_sar>0 then
    v_status := case when v_quote.stale_after < now() then 'stale' when v_quote.is_delayed then 'delayed' else 'fresh' end;
    new.unit_price := v_quote.price_sar;
    new.market_value := case when new.quantity is null then new.market_value else v_qty*v_quote.price_sar end;
    new.as_of_date := (v_quote.observed_at at time zone 'Asia/Riyadh')::date;
    new.metadata := coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'market',v_market,
      'market_price_managed',true,
      'original_currency',v_quote.native_currency,
      'original_market_price',v_quote.price,
      'original_market_value',case when new.quantity is null then null else v_qty*v_quote.price end,
      'fx_to_sar',v_quote.fx_to_sar,
      'price_source',v_quote.source,
      'price_delayed',v_quote.is_delayed,
      'price_status',v_status,
      'price_is_stale',(v_status='stale'),
      'price_observed_at',v_quote.observed_at,
      'price_stale_after',v_quote.stale_after,
      'price_last_attempt_at',now(),
      'price_last_success_at',now(),
      'price_refresh_error',null,
      'quote_cache_applied_at',now()
    );
  else
    if tg_op='INSERT' or v_symbol_changed or new.unit_price is null or new.market_value is null then
      new.unit_price := null;
      new.market_value := null;
      v_status := 'unavailable';
    else
      v_status := 'stale';
    end if;
    new.metadata := coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'market',v_market,
      'market_price_managed',true,
      'price_status',v_status,
      'price_is_stale',true,
      'price_last_attempt_at',now(),
      'price_refresh_error','quote_unavailable'
    );
  end if;
  return new;
end;
$$;

create or replace function public.wealth_connected_price_integrity()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_observed timestamptz;
  v_stale_after timestamptz;
  v_status text;
begin
  if new.connection_id is null then return new; end if;
  if coalesce(new.metadata->>'source','') <> 'binance_api' then return new; end if;
  if new.unit_price is null or new.market_value is null then
    new.metadata := coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'market','CRYPTO','market_price_managed',true,'price_source','Binance account sync',
      'price_status','unavailable','price_is_stale',true,'price_refresh_error','price_unavailable'
    );
    return new;
  end if;
  begin
    v_observed := coalesce(nullif(new.metadata->>'synced_at','')::timestamptz, now());
  exception when others then
    v_observed := now();
  end;
  v_stale_after := v_observed + interval '30 minutes';
  v_status := case when v_stale_after < now() then 'stale' else 'fresh' end;
  new.metadata := coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
    'market','CRYPTO','market_price_managed',true,'price_source','Binance account sync',
    'price_delayed',false,'price_status',v_status,'price_is_stale',(v_status='stale'),
    'price_observed_at',v_observed,'price_stale_after',v_stale_after,
    'price_last_success_at',v_observed,'price_refresh_error',null
  );
  return new;
end;
$$;

drop trigger if exists wealth_connected_price_integrity_trg on public.wealth_holdings;
create trigger wealth_connected_price_integrity_trg
before insert or update of connection_id,unit_price,market_value,metadata
on public.wealth_holdings
for each row execute function public.wealth_connected_price_integrity();

update public.wealth_holdings
set metadata = coalesce(metadata,'{}'::jsonb)
where connection_id is not null and coalesce(metadata->>'source','')='binance_api';
