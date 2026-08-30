alter table public.trader_billing_provider_state
  add column if not exists preflight_status text not null default 'not_started',
  add column if not exists preflight_details jsonb not null default '{}'::jsonb,
  add column if not exists preflight_completed_at timestamptz,
  add column if not exists launch_ready boolean not null default false;

alter table public.trader_billing_provider_state
  drop constraint if exists trader_billing_provider_state_preflight_status_check,
  add constraint trader_billing_provider_state_preflight_status_check
    check (preflight_status in ('not_started','running','ready','failed'));

update public.trader_billing_provider_state
set preflight_status = case
      when paypal_product_id is not null and paypal_webhook_id is not null then 'not_started'
      else coalesce(nullif(preflight_status, ''), 'not_started')
    end,
    launch_ready = false,
    updated_at = now()
where id = 1;

-- Launch is deliberately gated independently from provider provisioning.
update public.trader_billing_config
set checkout_enabled = false,
    entitlements_enforced = false,
    updated_at = now()
where id = 1;
