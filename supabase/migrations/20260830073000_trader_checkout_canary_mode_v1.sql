alter table public.trader_billing_config
  add column if not exists checkout_mode text not null default 'disabled';

alter table public.trader_billing_config
  drop constraint if exists trader_billing_config_checkout_mode_check;

alter table public.trader_billing_config
  add constraint trader_billing_config_checkout_mode_check
  check (checkout_mode in ('disabled','founder_canary','public'));

update public.trader_billing_config
set checkout_mode = case when checkout_enabled then 'public' else 'disabled' end,
    updated_at = now()
where id = 1;
