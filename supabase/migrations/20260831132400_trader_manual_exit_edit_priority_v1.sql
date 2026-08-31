create or replace function public.trader_begin_exit_command(p_account_id uuid, p_lock_id uuid, p_lease_seconds integer default 20)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ok boolean := false;
  v_attempt integer;
  v_key bigint := hashtextextended('trader_exit:' || p_account_id::text, 0);
begin
  if coalesce(p_lease_seconds,20)=31 then
    perform pg_advisory_xact_lock(v_key);
    for v_attempt in 1..60 loop
      update public.trader_accounts
      set exit_worker_lock_id=p_lock_id,
          exit_worker_locked_until=now()+make_interval(secs=>31)
      where id=p_account_id
        and (exit_worker_locked_until is null or exit_worker_locked_until<now())
      returning true into v_ok;
      if coalesce(v_ok,false) then return true; end if;
      perform pg_sleep(0.10);
    end loop;
    return false;
  end if;

  if not pg_try_advisory_xact_lock(v_key) then return false; end if;

  if coalesce(p_lease_seconds,20)=30 and exists(
    select 1 from public.trader_accounts
    where id=p_account_id
      and worker_lock_id is not null
      and worker_lock_id=exit_worker_lock_id
      and worker_locked_until>now()
      and exit_worker_locked_until>now()
  ) then return true; end if;

  update public.trader_accounts
  set exit_worker_lock_id=p_lock_id,
      exit_worker_locked_until=now()+make_interval(secs=>greatest(5,least(60,p_lease_seconds)))
  where id=p_account_id
    and (exit_worker_locked_until is null or exit_worker_locked_until<now())
  returning true into v_ok;
  return coalesce(v_ok,false);
end;
$function$;
