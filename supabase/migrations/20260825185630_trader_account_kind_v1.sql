alter table public.trader_accounts
  add column if not exists account_kind text;

update public.trader_accounts
set account_kind = case when mode = 'paper' then 'paper' else 'real' end
where account_kind is null;

alter table public.trader_accounts
  alter column account_kind set not null;

alter table public.trader_accounts
  drop constraint if exists trader_accounts_account_kind_check;

alter table public.trader_accounts
  add constraint trader_accounts_account_kind_check
  check (account_kind in ('paper','real'));

create unique index if not exists trader_accounts_one_active_kind_per_owner_idx
  on public.trader_accounts(owner_user_id, account_kind)
  where owner_user_id is not null and status = 'active';

comment on column public.trader_accounts.account_kind is
  'Stable Trader account type (paper or real). Separate from mode, which represents execution state such as paper, shadow, or live.';
