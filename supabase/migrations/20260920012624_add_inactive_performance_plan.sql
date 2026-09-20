alter table public.billing_plans
  drop constraint if exists billing_plans_plan_key_check;
alter table public.billing_plans
  add constraint billing_plans_plan_key_check
  check (plan_key in ('free','trader','pro','max','performance'));

insert into public.billing_plans(
  plan_key,name,monthly_amount_cents,annual_amount_cents,
  max_connections,max_dca_bots,max_strategy_executions,
  sort_order,is_active,updated_at
)
values(
  'performance','Performance',9900,118800,
  5,100,100,
  50,false,now()
)
on conflict (plan_key) do update set
  name=excluded.name,
  monthly_amount_cents=excluded.monthly_amount_cents,
  annual_amount_cents=excluded.annual_amount_cents,
  max_connections=greatest(public.billing_plans.max_connections,excluded.max_connections),
  max_dca_bots=greatest(public.billing_plans.max_dca_bots,excluded.max_dca_bots),
  max_strategy_executions=greatest(public.billing_plans.max_strategy_executions,excluded.max_strategy_executions),
  sort_order=excluded.sort_order,
  is_active=false,
  updated_at=now();
