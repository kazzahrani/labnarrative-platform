alter table public.trader_subscription_plans
  add column if not exists max_single_pair_bots integer not null default 0,
  add column if not exists max_multi_pair_bots integer not null default 0,
  add column if not exists max_active_exchanges integer;

alter table public.trader_subscription_plans
  drop constraint if exists trader_subscription_plans_max_single_pair_bots_check,
  add constraint trader_subscription_plans_max_single_pair_bots_check check (max_single_pair_bots >= 0),
  drop constraint if exists trader_subscription_plans_max_multi_pair_bots_check,
  add constraint trader_subscription_plans_max_multi_pair_bots_check check (max_multi_pair_bots >= 0),
  drop constraint if exists trader_subscription_plans_max_active_exchanges_check,
  add constraint trader_subscription_plans_max_active_exchanges_check check (max_active_exchanges is null or max_active_exchanges > 0);

update public.trader_subscription_plans
set
  monthly_price_cents = case slug when 'starter' then 2900 when 'growth' then 4900 when 'pro' then 8900 else monthly_price_cents end,
  annual_price_cents = case slug when 'starter' then 27900 when 'growth' then 34900 when 'pro' then 52900 else annual_price_cents end,
  max_single_pair_bots = case slug when 'starter' then 10 when 'growth' then 25 when 'pro' then 1000 else max_single_pair_bots end,
  max_multi_pair_bots = case slug when 'starter' then 0 when 'growth' then 1 when 'pro' then 100 else max_multi_pair_bots end,
  max_active_exchanges = case slug when 'starter' then 1 when 'growth' then 5 when 'pro' then null else max_active_exchanges end,
  description = case slug
    when 'starter' then 'Single-pair automation for individual traders: 10 single-pair bots and 1 active exchange.'
    when 'growth' then 'Serious multi-market automation: 25 single-pair bots, 1 multi-pair bot and up to 5 active exchanges.'
    when 'pro' then 'High-scale automation: 1,000 single-pair bots, 100 multi-pair bots and all supported exchanges.'
    else description end,
  is_active = case when slug in ('starter','growth','pro') then true else is_active end,
  updated_at = now()
where slug in ('starter','growth','pro');

-- Prices and plans are now defined, but checkout remains deliberately disabled until
-- entitlements/limits are enforced and the production pricing UI is verified.
update public.trader_billing_config
set checkout_enabled = false, updated_at = now()
where id = 1;
