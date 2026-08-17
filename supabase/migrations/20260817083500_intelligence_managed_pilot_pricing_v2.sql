create or replace function public.enforce_intelligence_launch_package_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.package_key = 'starter' then
    raise exception 'Starter is now a recurring subscription and is not sold through the one-time Managed Commercial Pilot checkout.';
  end if;

  if new.package_key = 'portfolio' then
    new.package_name := '10-Product Managed Commercial Pilot';
    new.product_count := 10;
    new.amount := 489;
    new.currency := 'USD';
  elsif new.package_key = 'portfolio_plus' then
    new.package_name := '20-Product Managed Commercial Pilot';
    new.product_count := 20;
    new.amount := 789;
    new.currency := 'USD';
  else
    raise exception 'Unknown Intelligence managed pilot package.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_intelligence_launch_package_pricing() from public, anon, authenticated;
grant execute on function public.enforce_intelligence_launch_package_pricing() to service_role;

drop trigger if exists intelligence_package_purchases_pricing_floor on public.intelligence_package_purchases;
create trigger intelligence_package_purchases_pricing_floor
before insert on public.intelligence_package_purchases
for each row
execute function public.enforce_intelligence_launch_package_pricing();
