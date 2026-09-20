create table if not exists private.performance_settlements (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null unique references private.performance_periods(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(20,2) not null check (amount_usd > 0 and amount_usd <= 99),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'due' check (status in ('due','pending','paid','failed','void')),
  paid_provider text check (paid_provider is null or paid_provider in ('paypal','nowpayments')),
  paid_external_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists performance_settlements_user_status_idx on private.performance_settlements(user_id,status,created_at desc);

create table if not exists private.performance_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references private.performance_settlements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('paypal','nowpayments')),
  status text not null default 'created' check (status in ('created','pending','paid','failed','cancelled','expired')),
  amount_usd numeric(20,2) not null check (amount_usd > 0 and amount_usd <= 99),
  currency text not null default 'USD' check (currency = 'USD'),
  external_id text,
  checkout_url text,
  provider_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists performance_payment_attempts_provider_external_uidx on private.performance_payment_attempts(provider,external_id) where external_id is not null;
create index if not exists performance_payment_attempts_settlement_idx on private.performance_payment_attempts(settlement_id,created_at desc);
create index if not exists performance_payment_attempts_user_idx on private.performance_payment_attempts(user_id,created_at desc);

grant select,insert,update,delete on private.performance_settlements to service_role;
grant select,insert,update,delete on private.performance_payment_attempts to service_role;

create or replace function public.performance_prepare_settlement_internal(p_period_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public, private
as $$
declare v_period private.performance_periods%rowtype; v_settlement private.performance_settlements%rowtype;
begin
  select * into v_period from private.performance_periods where id=p_period_id for update;
  if not found then raise exception 'performance_period_not_found'; end if;
  if v_period.charge_usd is null then raise exception 'performance_period_not_finalized'; end if;
  if v_period.charge_usd <= 0 then
    update private.performance_periods set status='paid',paid_at=coalesce(paid_at,now()),updated_at=now() where id=p_period_id returning * into v_period;
    return jsonb_build_object('ok',true,'noCharge',true,'periodId',v_period.id,'amountUsd',0,'status',v_period.status);
  end if;
  insert into private.performance_settlements(period_id,user_id,amount_usd,currency,status)
  values(v_period.id,v_period.user_id,round(v_period.charge_usd,2),'USD','due')
  on conflict(period_id) do update set updated_at=now() returning * into v_settlement;
  update private.performance_periods set status='payment_due',payment_due_at=coalesce(payment_due_at,now()),updated_at=now() where id=v_period.id;
  update public.user_subscriptions set status='paused',updated_at=now()
  where user_id=v_period.user_id and plan_key='performance' and status in ('active','trialing','past_due');
  return jsonb_build_object('ok',true,'noCharge',false,'settlementId',v_settlement.id,'periodId',v_period.id,'amountUsd',v_settlement.amount_usd,'currency',v_settlement.currency,'status',v_settlement.status);
end;
$$;

create or replace function public.performance_mark_settlement_paid_internal(p_settlement_id uuid,p_provider text,p_external_id text,p_provider_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public, private
as $$
declare v_settlement private.performance_settlements%rowtype; v_period private.performance_periods%rowtype; v_now timestamptz:=now();
begin
  if p_provider not in ('paypal','nowpayments') then raise exception 'performance_provider_invalid'; end if;
  if coalesce(trim(p_external_id),'')='' then raise exception 'performance_external_payment_id_required'; end if;
  select * into v_settlement from private.performance_settlements where id=p_settlement_id for update;
  if not found then raise exception 'performance_settlement_not_found'; end if;
  if v_settlement.status='paid' then
    return jsonb_build_object('ok',true,'alreadyPaid',true,'settlementId',v_settlement.id,'periodId',v_settlement.period_id,'userId',v_settlement.user_id,'amountUsd',v_settlement.amount_usd,'paidProvider',v_settlement.paid_provider,'paidAt',v_settlement.paid_at);
  end if;
  if v_settlement.status='void' then raise exception 'performance_settlement_void'; end if;
  update private.performance_settlements set status='paid',paid_provider=p_provider,paid_external_id=p_external_id,paid_at=v_now,updated_at=v_now where id=v_settlement.id returning * into v_settlement;
  update private.performance_payment_attempts
  set status=case when provider=p_provider and external_id=p_external_id then 'paid' when status in ('created','pending') then 'cancelled' else status end,
      provider_payload=case when provider=p_provider and external_id=p_external_id then coalesce(provider_payload,'{}'::jsonb)||coalesce(p_provider_payload,'{}'::jsonb) else provider_payload end,
      updated_at=v_now
  where settlement_id=v_settlement.id;
  update private.performance_periods set status='paid',paid_at=v_now,updated_at=v_now where id=v_settlement.period_id returning * into v_period;
  return jsonb_build_object('ok',true,'alreadyPaid',false,'settlementId',v_settlement.id,'periodId',v_settlement.period_id,'userId',v_settlement.user_id,'amountUsd',v_settlement.amount_usd,'paidProvider',p_provider,'paidAt',v_now,'previousPeriodEnd',v_period.period_end);
end;
$$;

create or replace function public.performance_settlement_status_internal(p_user_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = pg_catalog, public, private
as $$
declare v_period private.performance_periods%rowtype; v_settlement private.performance_settlements%rowtype; v_attempts jsonb;
begin
  select * into v_period from private.performance_periods where user_id=p_user_id order by period_start desc limit 1;
  if not found then return jsonb_build_object('period',null,'settlement',null,'attempts','[]'::jsonb); end if;
  select * into v_settlement from private.performance_settlements where period_id=v_period.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'provider',a.provider,'status',a.status,'externalId',a.external_id,'checkoutUrl',a.checkout_url,'createdAt',a.created_at,'updatedAt',a.updated_at) order by a.created_at desc),'[]'::jsonb)
  into v_attempts from private.performance_payment_attempts a where v_settlement.id is not null and a.settlement_id=v_settlement.id;
  return jsonb_build_object(
    'period',jsonb_build_object('id',v_period.id,'periodStart',v_period.period_start,'periodEnd',v_period.period_end,'status',v_period.status,'netPnlQuote',v_period.net_pnl_quote,'chargeUsd',v_period.charge_usd,'paidAt',v_period.paid_at),
    'settlement',case when v_settlement.id is null then null else jsonb_build_object('id',v_settlement.id,'amountUsd',v_settlement.amount_usd,'currency',v_settlement.currency,'status',v_settlement.status,'paidProvider',v_settlement.paid_provider,'paidAt',v_settlement.paid_at) end,
    'attempts',v_attempts
  );
end;
$$;

revoke all on function public.performance_prepare_settlement_internal(uuid) from public,anon,authenticated;
revoke all on function public.performance_mark_settlement_paid_internal(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.performance_settlement_status_internal(uuid) from public,anon,authenticated;
grant execute on function public.performance_prepare_settlement_internal(uuid) to service_role;
grant execute on function public.performance_mark_settlement_paid_internal(uuid,text,text,jsonb) to service_role;
grant execute on function public.performance_settlement_status_internal(uuid) to service_role;