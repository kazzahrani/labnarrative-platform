create table public.intelligence_package_purchases (
  id uuid primary key default gen_random_uuid(),
  package_key text not null check (package_key in ('starter','portfolio','portfolio_plus')),
  package_name text not null,
  product_count integer not null check (product_count > 0),
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'USD' check (currency = upper(currency) and char_length(currency) = 3),
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','cancelled')),
  provider text not null default 'paypal',
  provider_order_id text unique,
  provider_capture_id text unique,
  payer_name text,
  payer_email text,
  provider_metadata jsonb not null default '{}'::jsonb,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index intelligence_package_purchases_status_created_idx
  on public.intelligence_package_purchases (status, created_at desc);

alter table public.intelligence_package_purchases enable row level security;
revoke all on table public.intelligence_package_purchases from anon, authenticated;

comment on table public.intelligence_package_purchases is
  'Direct LabNarrative Intelligence package purchases captured through the server-side PayPal checkout.';
