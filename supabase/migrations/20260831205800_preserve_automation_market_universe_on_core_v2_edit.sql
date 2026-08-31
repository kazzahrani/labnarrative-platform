do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='trader_v2_apply_automation_command'
  limit 1;
  if v_oid is null then raise exception 'trader_v2_apply_automation_command_not_found'; end if;
  select pg_get_functiondef(v_oid) into v_def;

  v_def := replace(
    v_def,
$find$'provider',v_provider,'coreV2Command',true
      );
      update public.trader_bots set
        name=v_name,pair=v_pair,pairs=array[v_pair],all_pairs=false,base_order=v_base_order,safety_order=v_safety_order,$find$,
$replace$'provider',v_provider,'coreV2Command',true
      );
      v_state := v_state || jsonb_build_object(
        'pairs',to_jsonb(coalesce(v_bot.pairs,array[v_pair])),
        'allPairs',coalesce(v_bot.all_pairs,false),
        'startCondition',coalesce(v_bot.client_state->>'startCondition','Immediately')
      );
      update public.trader_bots set
        name=v_name,pair=v_pair,pairs=case when coalesce(v_bot.all_pairs,false) then v_bot.pairs else array[v_pair] end,all_pairs=coalesce(v_bot.all_pairs,false),base_order=v_base_order,safety_order=v_safety_order,$replace$
  );

  if v_def not like '%allPairs'',coalesce(v_bot.all_pairs,false)%' then
    raise exception 'automation_function_patch_not_applied';
  end if;
  execute v_def;
end $$;
