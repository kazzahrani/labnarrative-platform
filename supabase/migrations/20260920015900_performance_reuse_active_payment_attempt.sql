create or replace function public.performance_create_payment_attempt_internal(
  p_user_id uuid,
  p_provider text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_settlement private.performance_settlements%rowtype;
  v_attempt private.performance_payment_attempts%rowtype;
begin
  if p_provider not in ('paypal','nowpayments') then raise exception 'performance_provider_invalid'; end if;

  select * into v_settlement
  from private.performance_settlements
  where user_id=p_user_id and status in ('due','pending')
  order by created_at desc
  limit 1
  for update;

  if not found then raise exception 'performance_settlement_due_not_found'; end if;

  select * into v_attempt
  from private.performance_payment_attempts
  where settlement_id=v_settlement.id
    and status in ('created','pending')
  order by created_at desc
  limit 1;

  if found then
    if v_attempt.provider <> p_provider then
      raise exception 'performance_payment_attempt_pending:%',v_attempt.provider;
    end if;
    return jsonb_build_object(
      'attemptId',v_attempt.id,'settlementId',v_settlement.id,'periodId',v_settlement.period_id,
      'provider',v_attempt.provider,'amountUsd',v_attempt.amount_usd,'currency',v_attempt.currency,
      'status',v_attempt.status,'existing',true,'externalId',v_attempt.external_id,'checkoutUrl',v_attempt.checkout_url
    );
  end if;

  insert into private.performance_payment_attempts(
    settlement_id,user_id,provider,status,amount_usd,currency
  )
  values(v_settlement.id,p_user_id,p_provider,'created',v_settlement.amount_usd,v_settlement.currency)
  returning * into v_attempt;

  update private.performance_settlements
  set status='pending',updated_at=now()
  where id=v_settlement.id and status='due';

  return jsonb_build_object(
    'attemptId',v_attempt.id,'settlementId',v_settlement.id,'periodId',v_settlement.period_id,
    'provider',v_attempt.provider,'amountUsd',v_attempt.amount_usd,'currency',v_attempt.currency,
    'status',v_attempt.status,'existing',false,'externalId',v_attempt.external_id,'checkoutUrl',v_attempt.checkout_url
  );
end;
$$;

revoke all on function public.performance_create_payment_attempt_internal(uuid,text) from public,anon,authenticated;
grant execute on function public.performance_create_payment_attempt_internal(uuid,text) to service_role;
