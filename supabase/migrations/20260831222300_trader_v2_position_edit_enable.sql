update public.trader_v2_command_gates
set enabled=true,
    note='V1-style Core V2 full position editor enabled after verified production deployment 7309834bd62f48cbceb354b5330621747e0f5a45',
    updated_at=now()
where command_type='position.update_trade'
  and account_id in (
    select id from public.trader_accounts where account_kind='real' and status='active'
  );
