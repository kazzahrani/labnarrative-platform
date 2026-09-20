create or replace function public.performance_start_period_api_internal(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_spot_balance_usd numeric,
  p_eligibility_snapshot jsonb,
  p_marks jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_row private.performance_periods%rowtype;
begin
  v_row := public.performance_open_period_with_marks_internal(
    p_user_id,p_period_start,p_period_end,p_spot_balance_usd,p_eligibility_snapshot,p_marks
  );
  return jsonb_build_object(
    'id',v_row.id,'status',v_row.status,'periodStart',v_row.period_start,'periodEnd',v_row.period_end,
    'eligibilitySpotBalanceUsd',v_row.eligibility_spot_balance_usd,
    'minimumSpotBalanceUsd',v_row.minimum_spot_balance_usd,
    'monthlyChargeCapUsd',v_row.monthly_charge_cap_usd,
    'settlementQuoteAsset',v_row.settlement_quote_asset
  );
end;
$$;

create or replace function public.performance_finalize_period_api_internal(
  p_period_id uuid,
  p_marks jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_row private.performance_periods%rowtype;
begin
  v_row := public.performance_finalize_period_with_marks_internal(p_period_id,p_marks);
  return jsonb_build_object(
    'id',v_row.id,'status',v_row.status,'periodStart',v_row.period_start,'periodEnd',v_row.period_end,
    'netPnlQuote',v_row.net_pnl_quote,'chargeUsd',v_row.charge_usd,'finalizedAt',v_row.finalized_at
  );
end;
$$;

revoke all on function public.performance_start_period_api_internal(uuid,timestamptz,timestamptz,numeric,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.performance_finalize_period_api_internal(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.performance_start_period_api_internal(uuid,timestamptz,timestamptz,numeric,jsonb,jsonb) to service_role;
grant execute on function public.performance_finalize_period_api_internal(uuid,jsonb) to service_role;
