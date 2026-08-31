insert into public.trader_v2_command_gates(command_type,account_id,enabled,note,updated_at)
select 'position.update_trade',a.id,false,'Core V2 V1-style full position editor staged; keep disabled until endpoint and production UI are verified',now()
from public.trader_accounts a
where a.account_kind='real' and a.status='active'
on conflict (command_type,account_id) do update
set enabled=false,note=excluded.note,updated_at=now();
