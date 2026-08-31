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
$find$        next_scan_at=null,updated_at=v_now
      where id=v_bot.id returning * into v_bot;
    elsif v_command.command_type='automation.set_status' then$find$,
$replace$        next_scan_at=null,updated_at=v_now
      where id=v_bot.id returning * into v_bot;

      if jsonb_typeof(v_payload->'conditions')='array' then
        update public.trader_bots set
          all_pairs=coalesce((v_payload->>'allPairs')::boolean,false),
          pairs=case
            when coalesce((v_payload->>'allPairs')::boolean,false) then array[]::text[]
            else array(select jsonb_array_elements_text(coalesce(v_payload->'pairs','[]'::jsonb)))
          end,
          conditions=v_payload->'conditions',
          trailing_pct=greatest(0,coalesce((v_payload->>'trailingPct')::numeric,0)),
          client_state=coalesce(client_state,'{}'::jsonb) || jsonb_build_object(
            'allPairs',coalesce((v_payload->>'allPairs')::boolean,false),
            'pairs',coalesce(v_payload->'pairs','[]'::jsonb),
            'conditions',v_payload->'conditions',
            'startCondition',case
              when jsonb_array_length(v_payload->'conditions')=0 then 'Immediately'
              else (select string_agg(coalesce(rule->>'kind','Rule'),' + ') from jsonb_array_elements(v_payload->'conditions') rule)
            end,
            'trailingPct',greatest(0,coalesce((v_payload->>'trailingPct')::numeric,0)),
            'stopLossTimeoutSeconds',greatest(0,coalesce((v_payload->>'stopLossTimeoutSeconds')::integer,0))
          ),
          next_scan_at=null,
          updated_at=v_now
        where id=v_bot.id
        returning * into v_bot;
      end if;
    elsif v_command.command_type='automation.set_status' then$replace$
  );

  if v_def not like '%stopLossTimeoutSeconds%' then
    raise exception 'automation_full_edit_patch_not_applied';
  end if;
  execute v_def;
end $$;
