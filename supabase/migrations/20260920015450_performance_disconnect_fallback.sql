create or replace function private.crystallize_performance_on_connection_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update private.performance_trade_marks m
  set closing_cumulative_pnl_quote =
        coalesce(t.realized_pnl,0)
        + case when t.status='active'
            then coalesce(t.quantity,0) * (coalesce(nullif(t.last_price,0),t.average_price)-coalesce(t.average_price,coalesce(nullif(t.last_price,0),t.average_price)))
            else 0 end,
      closing_mark_price = coalesce(nullif(t.last_price,0),nullif(t.average_price,0)),
      closing_marked_at = now(),
      closing_reason = 'exchange_disconnect',
      closing_mark_source = 'last_verifiable',
      updated_at = now()
  from public.trading_trades t
  join private.performance_periods p on p.id=m.period_id
  where m.trade_id=t.id
    and t.connection_id=old.id
    and m.closing_marked_at is null
    and p.status='open'
    and coalesce(nullif(t.last_price,0),nullif(t.average_price,0)) > 0;
  return old;
end;
$$;

revoke all on function private.crystallize_performance_on_connection_delete() from public,anon,authenticated;
grant execute on function private.crystallize_performance_on_connection_delete() to service_role;

drop trigger if exists trg_performance_connection_delete on public.exchange_connections;
create trigger trg_performance_connection_delete
before delete on public.exchange_connections
for each row execute function private.crystallize_performance_on_connection_delete();

create or replace function private.crystallize_performance_on_connection_disconnect()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.status='connected' and new.status='disconnected' then
    update private.performance_trade_marks m
    set closing_cumulative_pnl_quote =
          coalesce(t.realized_pnl,0)
          + case when t.status='active'
              then coalesce(t.quantity,0) * (coalesce(nullif(t.last_price,0),t.average_price)-coalesce(t.average_price,coalesce(nullif(t.last_price,0),t.average_price)))
              else 0 end,
        closing_mark_price = coalesce(nullif(t.last_price,0),nullif(t.average_price,0)),
        closing_marked_at = now(),
        closing_reason = 'exchange_disconnect',
        closing_mark_source = 'last_verifiable',
        updated_at = now()
    from public.trading_trades t
    join private.performance_periods p on p.id=m.period_id
    where m.trade_id=t.id
      and t.connection_id=old.id
      and m.closing_marked_at is null
      and p.status='open'
      and coalesce(nullif(t.last_price,0),nullif(t.average_price,0)) > 0;
  end if;
  return new;
end;
$$;

revoke all on function private.crystallize_performance_on_connection_disconnect() from public,anon,authenticated;
grant execute on function private.crystallize_performance_on_connection_disconnect() to service_role;

drop trigger if exists trg_performance_connection_disconnect on public.exchange_connections;
create trigger trg_performance_connection_disconnect
before update of status on public.exchange_connections
for each row execute function private.crystallize_performance_on_connection_disconnect();
