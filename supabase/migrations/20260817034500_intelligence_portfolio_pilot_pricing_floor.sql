create or replace function public.enforce_intelligence_launch_package_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.package_key = 'starter' then
    raise exception 'The Starter package has been retired. The paid Intelligence offering now begins with the Portfolio Pilot.';
  end if;

  if new.package_key = 'portfolio' then
    new.package_name := 'Portfolio Pilot';
    new.product_count := 10;
    new.amount := 689;
    new.currency := 'USD';
  elsif new.package_key = 'portfolio_plus' then
    new.package_name := 'Portfolio Plus';
    new.product_count := 20;
    new.amount := 1189;
    new.currency := 'USD';
  else
    raise exception 'Unknown Intelligence package.';
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
