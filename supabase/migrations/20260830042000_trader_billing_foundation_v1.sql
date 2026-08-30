create table if not exists public.trader_billing_config (
  id smallint primary key default 1 check (id = 1),
  checkout_enabled boolean not null default false,
  provider text not null default 'paypal',
  currency text not null default 'USD',
  referral_discount_bps integer not null default 1000 check (referral_discount_bps between 0 and 10000),
  updated_at timestamptz not null default now()
);

insert into public.trader_billing_config (id, checkout_enabled, provider, currency, referral_discount_bps)
values (1, false, 'paypal', 'USD', 1000)
on conflict (id) do nothing;

create table if not exists public.trader_subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  monthly_price_cents integer check (monthly_price_cents is null or monthly_price_cents > 0),
  annual_price_cents integer check (annual_price_cents is null or annual_price_cents > 0),
  currency text not null default 'USD',
  is_active boolean not null default false,
  paypal_monthly_plan_id text,
  paypal_monthly_referral_plan_id text,
  paypal_annual_plan_id text,
  paypal_annual_referral_plan_id text,
  provider_status text not null default 'draft',
  provider_error text,
  provider_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.trader_subscription_plans (slug, name, description, sort_order, is_active)
values
  ('starter', 'Starter', 'Core LabNarrative Trading automation plan.', 10, false),
  ('growth', 'Growth', 'Expanded automation and analytics plan.', 20, false),
  ('pro', 'Pro', 'Full LabNarrative Trading automation plan.', 30, false)
on conflict (slug) do nothing;

create table if not exists public.trader_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  account_id uuid references public.trader_accounts(id) on delete set null,
  plan_id uuid not null references public.trader_subscription_plans(id),
  billing_interval text not null check (billing_interval in ('monthly','annual')),
  provider text not null default 'paypal',
  provider_subscription_id text unique,
  status text not null default 'approval_pending' check (status in ('approval_pending','active','suspended','cancelled','expired','payment_failed')),
  referral_discount_applied boolean not null default false,
  referral_code text,
  list_price_cents integer not null check (list_price_cents > 0),
  subscription_price_cents integer not null check (subscription_price_cents > 0),
  currency text not null default 'USD',
  started_at timestamptz,
  next_billing_at timestamptz,
  cancelled_at timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trader_subscriptions_owner_idx on public.trader_subscriptions(owner_user_id, status);

create table if not exists public.trader_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.trader_subscriptions(id) on delete cascade,
  owner_user_id uuid not null,
  provider text not null default 'paypal',
  provider_payment_id text not null,
  billing_interval text not null check (billing_interval in ('monthly','annual')),
  gross_amount_cents integer not null check (gross_amount_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'paid' check (status in ('paid','refunded','reversed')),
  paid_at timestamptz,
  reversed_at timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create index if not exists trader_subscription_payments_owner_idx on public.trader_subscription_payments(owner_user_id, paid_at desc);

create table if not exists public.trader_billing_provider_state (
  id smallint primary key default 1 check (id = 1),
  provider text not null default 'paypal',
  paypal_product_id text,
  paypal_webhook_id text,
  environment text,
  webhook_status text not null default 'unconfigured',
  last_verified_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.trader_billing_provider_state (id, provider)
values (1, 'paypal')
on conflict (id) do nothing;

alter table public.trader_billing_config enable row level security;
alter table public.trader_subscription_plans enable row level security;
alter table public.trader_subscriptions enable row level security;
alter table public.trader_subscription_payments enable row level security;
alter table public.trader_billing_provider_state enable row level security;

revoke all on public.trader_billing_config from anon, authenticated;
revoke all on public.trader_subscription_plans from anon, authenticated;
revoke all on public.trader_subscriptions from anon, authenticated;
revoke all on public.trader_subscription_payments from anon, authenticated;
revoke all on public.trader_billing_provider_state from anon, authenticated;
