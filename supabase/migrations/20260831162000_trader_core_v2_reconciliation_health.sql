-- Core V2 portfolio reconciliation health read model.
-- Read-only observability used to prove shadow accounting before portfolio cutover.

create or replace view public.trader_v2_reconciliation_health_latest
with (security_invoker = true)
as
with snapshot_stats as (
  select
    account_id,
    count(*)::bigint as snapshot_count,
    min(bucket_at) as first_snapshot_at,
    max(bucket_at) as last_snapshot_at
  from public.trader_v2_portfolio_snapshots
  group by account_id
), transfer_group_check as (
  select
    t.account_id,
    t.id as transfer_id,
    count(l.id)::integer as ledger_row_count,
    abs(
      coalesce(sum(l.quantity_delta), 0::numeric)
      + greatest(coalesce(t.fee_quantity, 0::numeric), 0::numeric)
    ) as invariant_error
  from public.trader_v2_internal_transfers t
  left join public.trader_v2_ledger_entries l
    on l.transfer_group_id = t.id
  where t.status = 'matched'
  group by t.account_id, t.id, t.fee_quantity
), transfer_stats as (
  select
    account_id,
    count(*)::bigint as matched_transfer_count,
    count(*) filter (
      where ledger_row_count <> 2
         or invariant_error > 0.00000001::numeric
    )::bigint as transfer_invariant_error_count,
    coalesce(max(invariant_error), 0::numeric) as max_transfer_invariant_error
  from transfer_group_check
  group by account_id
), sync_hour as (
  select
    account_id,
    provider,
    sync_kind,
    count(*) filter (where status = 'succeeded')::integer as succeeded_1h,
    count(*) filter (where status = 'failed')::integer as failed_1h,
    max(completed_at) filter (where status = 'succeeded') as last_success_at,
    max(started_at) filter (where status = 'failed') as last_failure_at
  from public.trader_v2_sync_runs
  where started_at >= now() - interval '1 hour'
  group by account_id, provider, sync_kind
), sync_health as (
  select
    account_id,
    jsonb_agg(
      jsonb_build_object(
        'provider', provider,
        'syncKind', sync_kind,
        'succeeded1h', succeeded_1h,
        'failed1h', failed_1h,
        'lastSuccessAt', last_success_at,
        'lastFailureAt', last_failure_at
      )
      order by provider, sync_kind
    ) as sync_health
  from sync_hour
  group by account_id
)
select
  p.account_id,
  p.captured_at,
  p.exchange_total_usd,
  p.in_transit_usd,
  p.accounting_total_usd,
  p.cash_usd,
  p.holdings_usd,
  p.connected_provider_count,
  p.fresh_provider_count,
  p.stale_provider_count,
  p.unsupported_provider_count,
  p.unpriced_asset_count,
  p.provider_totals,
  p.asset_totals,
  p.in_transit_items,
  p.sync_state,
  coalesce(s.snapshot_count, 0::bigint) as snapshot_count,
  s.first_snapshot_at,
  s.last_snapshot_at,
  coalesce(t.matched_transfer_count, 0::bigint) as matched_transfer_count,
  coalesce(t.transfer_invariant_error_count, 0::bigint) as transfer_invariant_error_count,
  coalesce(t.max_transfer_invariant_error, 0::numeric) as max_transfer_invariant_error,
  coalesce(x.last_status, 'never'::text) as transfer_sync_status,
  x.last_started_at as transfer_sync_started_at,
  x.last_completed_at as transfer_sync_completed_at,
  x.last_imported_count as transfer_sync_imported_count,
  x.last_matched_count as transfer_sync_matched_count,
  x.last_error as transfer_sync_last_error,
  coalesce(h.sync_health, '[]'::jsonb) as sync_health,
  p.updated_at
from public.trader_v2_portfolio_accounting_latest p
left join snapshot_stats s on s.account_id = p.account_id
left join transfer_stats t on t.account_id = p.account_id
left join public.trader_v2_transfer_sync_state x on x.account_id = p.account_id
left join sync_health h on h.account_id = p.account_id;

revoke all on public.trader_v2_reconciliation_health_latest from public;
revoke all on public.trader_v2_reconciliation_health_latest from anon;
revoke all on public.trader_v2_reconciliation_health_latest from authenticated;
grant select on public.trader_v2_reconciliation_health_latest to service_role;

comment on view public.trader_v2_reconciliation_health_latest is
  'Core V2 shadow reconciliation health. Service-role only; no trading mutation path.';
