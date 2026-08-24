create or replace function public.wealth_effective_price_status(p_unit_price numeric,p_market_value numeric,p_metadata jsonb)
returns text
language plpgsql
stable
set search_path to 'public','pg_temp'
as $$
declare
  v_stale_after timestamptz;
  v_managed boolean;
begin
  v_managed := coalesce((p_metadata->>'market_price_managed')::boolean,false) or coalesce(p_metadata->>'source','')='binance_api';
  if not v_managed then return null; end if;
  if p_unit_price is null or p_market_value is null or coalesce(p_metadata->>'price_status','')='unavailable' then return 'unavailable'; end if;
  begin
    v_stale_after := nullif(p_metadata->>'price_stale_after','')::timestamptz;
  exception when others then
    v_stale_after := null;
  end;
  if v_stale_after is not null and v_stale_after < now() then return 'stale'; end if;
  if coalesce((p_metadata->>'price_delayed')::boolean,false) then return 'delayed'; end if;
  if nullif(p_metadata->>'price_observed_at','') is not null or nullif(p_metadata->>'synced_at','') is not null then return 'fresh'; end if;
  return 'unavailable';
end;
$$;

create or replace view public.wealth_holdings_pricing_status
with (security_invoker=true)
as
select h.*,
       public.wealth_effective_price_status(h.unit_price,h.market_value,h.metadata) as effective_price_status,
       h.metadata->>'price_source' as effective_price_source,
       nullif(h.metadata->>'price_observed_at','')::timestamptz as effective_price_observed_at,
       nullif(h.metadata->>'price_stale_after','')::timestamptz as effective_price_stale_after
from public.wealth_holdings h;

grant select on public.wealth_holdings_pricing_status to authenticated;
revoke all on public.wealth_holdings_pricing_status from anon;
