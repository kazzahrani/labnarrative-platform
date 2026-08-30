create index if not exists trader_subscriptions_account_id_idx
  on public.trader_subscriptions(account_id);

create index if not exists trader_subscriptions_plan_id_idx
  on public.trader_subscriptions(plan_id);

create index if not exists trader_subscriptions_pending_plan_id_idx
  on public.trader_subscriptions(pending_plan_id)
  where pending_plan_id is not null;

create index if not exists trader_subscription_payments_subscription_id_idx
  on public.trader_subscription_payments(subscription_id);

create index if not exists trader_entitlement_overrides_plan_id_idx
  on public.trader_entitlement_overrides(plan_id);
