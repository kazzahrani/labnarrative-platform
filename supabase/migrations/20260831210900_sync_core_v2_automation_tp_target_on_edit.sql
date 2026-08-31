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
$find$            'trailingPct',greatest(0,coalesce((v_payload->>'trailingPct')::numeric,0)),
            'stopLossTimeoutSeconds',greatest(0,coalesce((v_payload->>'stopLossTimeoutSeconds')::integer,0))$find$,
$replace$            'takeProfitTargets',jsonb_build_array(jsonb_build_object('profitPct',v_take_profit,'allocationPct',100)),
            'trailingPct',greatest(0,coalesce((v_payload->>'trailingPct')::numeric,0)),
            'stopLossTimeoutSeconds',greatest(0,coalesce((v_payload->>'stopLossTimeoutSeconds')::integer,0))$replace$
  );
  if v_def not like '%takeProfitTargets%' then raise exception 'tp_target_sync_patch_not_applied'; end if;
  execute v_def;
end $$;
