alter table public.trader_billing_provider_state
  drop constraint if exists trader_billing_provider_state_preflight_status_check;

alter table public.trader_billing_provider_state
  add constraint trader_billing_provider_state_preflight_status_check
  check (preflight_status in (
    'not_started',
    'armed',
    'authorized',
    'running',
    'ready',
    'failed'
  ));
