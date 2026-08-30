create or replace function public.trader_preserve_payment_failure_grace()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if old.status = 'payment_failed'
     and new.status = 'payment_failed'
     and old.access_ends_at is not null then
    new.access_ends_at := old.access_ends_at;
  end if;
  return new;
end;
$function$;

drop trigger if exists trader_subscriptions_payment_failure_grace_guard on public.trader_subscriptions;
create trigger trader_subscriptions_payment_failure_grace_guard
before update of status, access_ends_at on public.trader_subscriptions
for each row execute function public.trader_preserve_payment_failure_grace();
