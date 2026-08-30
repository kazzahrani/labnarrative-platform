create table if not exists public.trader_referral_program_config (
  id smallint primary key default 1 check (id = 1),
  active boolean not null default true,
  currency text not null default 'USD',
  monthly_l1_bps integer not null default 2500 check (monthly_l1_bps between 0 and 10000),
  monthly_l2_bps integer not null default 1500 check (monthly_l2_bps between 0 and 10000),
  monthly_l3_bps integer not null default 1000 check (monthly_l3_bps between 0 and 10000),
  annual_l1_bps integer not null default 3000 check (annual_l1_bps between 0 and 10000),
  annual_l2_bps integer not null default 1000 check (annual_l2_bps between 0 and 10000),
  annual_l3_bps integer not null default 500 check (annual_l3_bps between 0 and 10000),
  customer_discount_bps integer not null default 1000 check (customer_discount_bps between 0 and 10000),
  commission_hold_days integer not null default 30 check (commission_hold_days between 0 and 180),
  payout_minimum_cents integer not null default 2500 check (payout_minimum_cents >= 0),
  updated_at timestamptz not null default now()
);

insert into public.trader_referral_program_config (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.trader_referral_profiles (
  account_id uuid primary key references public.trader_accounts(id) on delete cascade,
  referral_code text not null unique,
  status text not null default 'active' check (status in ('active', 'paused', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referral_code ~ '^[A-Z0-9_-]{4,32}$')
);

create table if not exists public.trader_referral_attributions (
  referred_account_id uuid primary key references public.trader_accounts(id) on delete cascade,
  referrer_account_id uuid not null references public.trader_accounts(id) on delete restrict,
  referral_code text not null,
  source text not null default 'link' check (source in ('link', 'code', 'strategy', 'bot', 'admin')),
  attributed_at timestamptz not null default now(),
  locked_at timestamptz,
  check (referred_account_id <> referrer_account_id)
);

create index if not exists trader_referral_attributions_referrer_idx
  on public.trader_referral_attributions (referrer_account_id, attributed_at desc);

create table if not exists public.trader_referral_commissions (
  id uuid primary key default gen_random_uuid(),
  beneficiary_account_id uuid not null references public.trader_accounts(id) on delete restrict,
  referred_account_id uuid not null references public.trader_accounts(id) on delete restrict,
  provider text not null default 'billing',
  external_payment_id text not null,
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  referral_level smallint not null check (referral_level between 1 and 3),
  gross_amount_cents bigint not null check (gross_amount_cents >= 0),
  rate_bps integer not null check (rate_bps between 0 and 10000),
  commission_amount_cents bigint not null check (commission_amount_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'available', 'paid', 'reversed', 'cancelled')),
  hold_until timestamptz not null,
  available_at timestamptz,
  paid_at timestamptz,
  reversed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, external_payment_id, beneficiary_account_id, referral_level)
);

create index if not exists trader_referral_commissions_beneficiary_status_idx
  on public.trader_referral_commissions (beneficiary_account_id, status, hold_until);
create index if not exists trader_referral_commissions_referred_idx
  on public.trader_referral_commissions (referred_account_id, created_at desc);

create table if not exists public.trader_referral_payouts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed', 'cancelled')),
  payout_method text,
  external_payout_id text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists trader_referral_payouts_account_status_idx
  on public.trader_referral_payouts (account_id, status, created_at desc);

alter table public.trader_referral_program_config enable row level security;
alter table public.trader_referral_profiles enable row level security;
alter table public.trader_referral_attributions enable row level security;
alter table public.trader_referral_commissions enable row level security;
alter table public.trader_referral_payouts enable row level security;

revoke all on table public.trader_referral_program_config from anon, authenticated;
revoke all on table public.trader_referral_profiles from anon, authenticated;
revoke all on table public.trader_referral_attributions from anon, authenticated;
revoke all on table public.trader_referral_commissions from anon, authenticated;
revoke all on table public.trader_referral_payouts from anon, authenticated;
