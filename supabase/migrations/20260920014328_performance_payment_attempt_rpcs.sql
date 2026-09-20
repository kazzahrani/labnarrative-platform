create or replace function public.performance_create_payment_attempt_internal(p_user_id uuid,p_provider text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private
as $$
declare v_settlement private.performance_settlements%rowtype; v_attempt private.performance_payment_attempts%rowtype;
begin
  if p_provider not in ('paypal','nowpayments') then raise exception 'performance_provider_invalid'; end if;
  select * into v_settlement from private.performance_settlements where user_id=p_user_id and status in ('due','pending') order by created_at desc limit 1 for update;
  if not found then raise exception 'performance_settlement_due_not_found'; end if;
  insert into private.performance_payment_attempts(settlement_id,user_id,provider,status,amount_usd,currency)
  values(v_settlement.id,p_user_id,p_provider,'created',v_settlement.amount_usd,v_settlement.currency) returning * into v_attempt;
  update private.performance_settlements set status='pending',updated_at=now() where id=v_settlement.id and status='due';
  return jsonb_build_object('attemptId',v_attempt.id,'settlementId',v_settlement.id,'periodId',v_settlement.period_id,'provider',v_attempt.provider,'amountUsd',v_attempt.amount_usd,'currency',v_attempt.currency,'status',v_attempt.status);
end;
$$;

create or replace function public.performance_update_payment_attempt_internal(p_user_id uuid,p_attempt_id uuid,p_status text,p_external_id text default null,p_checkout_url text default null,p_provider_payload jsonb default '{}'::jsonb,p_error_message text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private
as $$
declare v_attempt private.performance_payment_attempts%rowtype;
begin
  if p_status not in ('created','pending','paid','failed','cancelled','expired') then raise exception 'performance_attempt_status_invalid'; end if;
  update private.performance_payment_attempts
  set status=p_status,external_id=coalesce(nullif(p_external_id,''),external_id),checkout_url=coalesce(nullif(p_checkout_url,''),checkout_url),
      provider_payload=coalesce(provider_payload,'{}'::jsonb)||coalesce(p_provider_payload,'{}'::jsonb),error_message=p_error_message,updated_at=now()
  where id=p_attempt_id and user_id=p_user_id returning * into v_attempt;
  if not found then raise exception 'performance_payment_attempt_not_found'; end if;
  return jsonb_build_object('attemptId',v_attempt.id,'settlementId',v_attempt.settlement_id,'provider',v_attempt.provider,'status',v_attempt.status,'amountUsd',v_attempt.amount_usd,'currency',v_attempt.currency,'externalId',v_attempt.external_id,'checkoutUrl',v_attempt.checkout_url);
end;
$$;

create or replace function public.performance_payment_attempt_internal(p_user_id uuid,p_attempt_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public,private
as $$
declare v_attempt private.performance_payment_attempts%rowtype; v_settlement private.performance_settlements%rowtype;
begin
  select * into v_attempt from private.performance_payment_attempts where id=p_attempt_id and user_id=p_user_id;
  if not found then raise exception 'performance_payment_attempt_not_found'; end if;
  select * into v_settlement from private.performance_settlements where id=v_attempt.settlement_id;
  if not found then raise exception 'performance_settlement_not_found'; end if;
  return jsonb_build_object('attemptId',v_attempt.id,'settlementId',v_settlement.id,'periodId',v_settlement.period_id,'provider',v_attempt.provider,'attemptStatus',v_attempt.status,'settlementStatus',v_settlement.status,'amountUsd',v_settlement.amount_usd,'currency',v_settlement.currency,'externalId',v_attempt.external_id,'checkoutUrl',v_attempt.checkout_url);
end;
$$;

create or replace function public.performance_nowpayments_attempt_internal(p_attempt_id uuid,p_settlement_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public,private
as $$
declare v_attempt private.performance_payment_attempts%rowtype; v_settlement private.performance_settlements%rowtype;
begin
  select * into v_attempt from private.performance_payment_attempts where id=p_attempt_id and settlement_id=p_settlement_id and provider='nowpayments';
  if not found then raise exception 'performance_nowpayments_attempt_not_found'; end if;
  select * into v_settlement from private.performance_settlements where id=v_attempt.settlement_id;
  return jsonb_build_object('attemptId',v_attempt.id,'settlementId',v_settlement.id,'userId',v_attempt.user_id,'status',v_attempt.status,'settlementStatus',v_settlement.status,'amountUsd',v_settlement.amount_usd,'currency',v_settlement.currency,'externalId',v_attempt.external_id);
end;
$$;

revoke all on function public.performance_create_payment_attempt_internal(uuid,text) from public,anon,authenticated;
revoke all on function public.performance_update_payment_attempt_internal(uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.performance_payment_attempt_internal(uuid,uuid) from public,anon,authenticated;
revoke all on function public.performance_nowpayments_attempt_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.performance_create_payment_attempt_internal(uuid,text) to service_role;
grant execute on function public.performance_update_payment_attempt_internal(uuid,uuid,text,text,text,jsonb,text) to service_role;
grant execute on function public.performance_payment_attempt_internal(uuid,uuid) to service_role;
grant execute on function public.performance_nowpayments_attempt_internal(uuid,uuid) to service_role;