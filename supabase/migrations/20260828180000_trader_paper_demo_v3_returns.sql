create or replace function public.trader_boost_starter_paper_demo_v3(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with factors(suffix,scale) as (values
    ('01',2.2::numeric),('02',2.6),('03',3.0),('04',2.4),('05',2.7),
    ('06',1.8),('07',2.5),('08',3.2),('09',2.8),('10',2.5)
  ), targets as (
    select t.id, t.average_price, coalesce(t.total_invested,t.invested) capital,
           t.realized_pnl*f.scale as new_pnl,
           case when coalesce(t.total_invested,t.invested)>0 then
             t.average_price*(1+(t.realized_pnl*f.scale/coalesce(t.total_invested,t.invested)))
           else t.exit_price end as new_exit,
           case when coalesce(t.total_invested,t.invested)>0 then
             100*(t.realized_pnl*f.scale/coalesce(t.total_invested,t.invested)) else 0 end as new_roi
    from public.trader_trades t
    join public.trader_bots b on b.id=t.bot_id
    join factors f on b.client_id='starter-demo-v1-'||f.suffix
    where b.account_id=p_account_id and b.client_state->>'starterDemo'='true'
      and t.client_state->>'starterDemo'='true' and t.client_state->>'historySource'='simulated_demo'
  )
  update public.trader_trades t
  set realized_pnl=x.new_pnl,
      exit_price=x.new_exit,
      last_price=x.new_exit,
      client_state=jsonb_set(jsonb_set(coalesce(t.client_state,'{}'::jsonb),'{simulatedRoiPct}',to_jsonb(x.new_roi),true),'{starterVersion}','3'::jsonb,true),
      updated_at=now()
  from targets x where t.id=x.id;

  update public.trader_bots b
  set client_state=jsonb_set(coalesce(b.client_state,'{}'::jsonb),'{starterVersion}','3'::jsonb,true),updated_at=now()
  where b.account_id=p_account_id and b.client_id like 'starter-demo-v1-%' and b.client_state->>'starterDemo'='true';

  update public.trader_tradingview_events e
  set payload=jsonb_set(jsonb_set(jsonb_set(coalesce(e.payload,'{}'::jsonb),'{result,price}',to_jsonb(t.exit_price),true),'{result,quote}',to_jsonb(coalesce(t.total_invested,t.invested)+t.realized_pnl),true),'{starterVersion}','3'::jsonb,true)
  from public.trader_trades t, public.trader_bots b
  where e.bot_id=b.id and t.bot_id=b.id and b.account_id=p_account_id
    and b.client_id like 'starter-demo-v1-%' and b.client_state->>'starterDemo'='true'
    and t.client_state->>'starterDemo'='true' and e.payload->>'starterDemo'='true'
    and e.dedupe_key=t.client_id||'-close';
end;
$$;

revoke all on function public.trader_boost_starter_paper_demo_v3(uuid) from public, anon, authenticated;
grant execute on function public.trader_boost_starter_paper_demo_v3(uuid) to service_role;

create or replace function public.trader_seed_starter_paper_account_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_version integer;
begin
  if new.owner_user_id is not null and new.status='active' and (new.mode='paper' or new.account_kind='paper') then
    select version into v_version from public.trader_starter_seed_state where account_id=new.id;
    if coalesce(v_version,0)<1 then
      perform public.trader_seed_starter_paper_account(new.id);
      insert into public.trader_starter_seed_state(account_id,version) values(new.id,1)
      on conflict(account_id) do update set version=greatest(public.trader_starter_seed_state.version,excluded.version);
      v_version:=1;
    end if;
    if coalesce(v_version,0)<2 then
      perform public.trader_seed_paper_core_holdings(new.id);
      perform public.trader_upgrade_starter_paper_demo_v2(new.id);
      update public.trader_starter_seed_state set version=2 where account_id=new.id;
      v_version:=2;
    end if;
    if coalesce(v_version,0)<3 then
      perform public.trader_boost_starter_paper_demo_v3(new.id);
      update public.trader_starter_seed_state set version=3 where account_id=new.id;
    end if;
  end if;
  return new;
end;
$$;

do $$ declare r record; begin
  for r in select a.id from public.trader_accounts a join public.trader_starter_seed_state s on s.account_id=a.id where s.version<3 and a.owner_user_id is not null and a.status='active' and (a.mode='paper' or a.account_kind='paper') loop
    if (select version from public.trader_starter_seed_state where account_id=r.id)<2 then
      perform public.trader_seed_paper_core_holdings(r.id);
      perform public.trader_upgrade_starter_paper_demo_v2(r.id);
      update public.trader_starter_seed_state set version=2 where account_id=r.id;
    end if;
    perform public.trader_boost_starter_paper_demo_v3(r.id);
    update public.trader_starter_seed_state set version=3 where account_id=r.id;
  end loop;
end $$;
