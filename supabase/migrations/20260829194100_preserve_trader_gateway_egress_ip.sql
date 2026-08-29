create or replace function public.trader_preserve_gateway_egress_ip()
returns trigger
language plpgsql
as $$
begin
  if new.name = 'binance' and nullif(btrim(coalesce(new.egress_ip, '')), '') is null then
    new.egress_ip := old.egress_ip;
  end if;
  return new;
end;
$$;

drop trigger if exists trader_preserve_gateway_egress_ip on public.trader_gateway_config;
create trigger trader_preserve_gateway_egress_ip
before update on public.trader_gateway_config
for each row
execute function public.trader_preserve_gateway_egress_ip();

update public.trader_gateway_config
set egress_ip = '84.13.156.194'
where name = 'binance'
  and nullif(btrim(coalesce(egress_ip, '')), '') is null;
