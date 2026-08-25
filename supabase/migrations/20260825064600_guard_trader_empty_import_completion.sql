create or replace function public.guard_trader_import_completion()
returns trigger
language plpgsql
as $$
begin
  if old.imported_at is null and new.imported_at is not null then
    if not exists (select 1 from public.trader_bots where account_id = new.id)
       and not exists (select 1 from public.trader_trades where account_id = new.id) then
      raise exception 'Cannot finalize trader import with no durable bots or trades';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trader_accounts_guard_import_completion on public.trader_accounts;
create trigger trader_accounts_guard_import_completion
before update of imported_at on public.trader_accounts
for each row
execute function public.guard_trader_import_completion();
