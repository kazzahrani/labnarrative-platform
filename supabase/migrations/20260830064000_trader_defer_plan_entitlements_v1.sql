create or replace function public.trader_defer_pending_plan_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.pending_plan_id is not null
     and old.pending_provider_plan_id is not null
     and old.next_billing_at is not null
     and old.next_billing_at > now()
     and new.plan_id = old.pending_plan_id then
    new.plan_id := old.plan_id;
    new.billing_interval := old.billing_interval;
    new.list_price_cents := old.list_price_cents;
    new.subscription_price_cents := old.subscription_price_cents;
    new.referral_discount_applied := old.referral_discount_applied;
    new.pending_plan_id := old.pending_plan_id;
    new.pending_billing_interval := old.pending_billing_interval;
    new.pending_provider_plan_id := old.pending_provider_plan_id;
    new.plan_change_requested_at := old.plan_change_requested_at;
    new.plan_change_effective_at := old.next_billing_at;
  end if;
  return new;
end;
$$;

revoke all on function public.trader_defer_pending_plan_change() from public, anon, authenticated;

drop trigger if exists trader_subscriptions_defer_pending_plan_change on public.trader_subscriptions;
create trigger trader_subscriptions_defer_pending_plan_change
before update on public.trader_subscriptions
for each row
execute function public.trader_defer_pending_plan_change();
