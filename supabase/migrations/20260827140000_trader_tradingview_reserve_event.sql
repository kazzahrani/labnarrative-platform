create or replace function public.trader_reserve_tradingview_event(
  p_token text,
  p_action text,
  p_pair text,
  p_nonce text,
  p_amount numeric default null,
  p_payload jsonb default '{}'::jsonb
)
returns table(
  event_id uuid,
  bot_id uuid,
  account_id uuid,
  duplicate boolean,
  event_status text
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_bot public.trader_bots%rowtype;
  v_event public.trader_tradingview_events%rowtype;
begin
  if p_token is null or btrim(p_token)='' then return; end if;
  if p_action not in ('START','CLOSE','ADD_FUNDS') then raise exception 'invalid_action'; end if;
  if p_pair is null or btrim(p_pair)='' then raise exception 'pair_required'; end if;
  if p_nonce is null or btrim(p_nonce)='' then raise exception 'nonce_required'; end if;
  if p_action='ADD_FUNDS' and coalesce(p_amount,0)<=0 then raise exception 'invalid_amount'; end if;

  select b.* into v_bot
  from public.trader_bots b
  where b.tradingview_token=p_token
    and b.tradingview_enabled=true
    and b.is_archived=false
  limit 1;

  if not found then return; end if;

  insert into public.trader_tradingview_events(account_id,bot_id,action,pair,nonce,amount,status,payload)
  values(v_bot.account_id,v_bot.id,p_action,btrim(p_pair),btrim(p_nonce),case when p_action='ADD_FUNDS' then p_amount else null end,'received',coalesce(p_payload,'{}'::jsonb))
  on conflict (bot_id,nonce) do nothing
  returning * into v_event;

  if found then
    return query select v_event.id,v_bot.id,v_bot.account_id,false,v_event.status;
    return;
  end if;

  select e.* into v_event
  from public.trader_tradingview_events e
  where e.bot_id=v_bot.id and e.nonce=btrim(p_nonce)
  limit 1;

  if found then
    return query select v_event.id,v_bot.id,v_bot.account_id,true,v_event.status;
  end if;
end;
$$;

revoke all on function public.trader_reserve_tradingview_event(text,text,text,text,numeric,jsonb) from public;
grant execute on function public.trader_reserve_tradingview_event(text,text,text,text,numeric,jsonb) to service_role;
