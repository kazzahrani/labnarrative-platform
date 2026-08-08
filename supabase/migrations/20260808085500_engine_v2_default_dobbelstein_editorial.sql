do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'engine_v2_ingest_build'
    and pg_get_function_identity_arguments(p.oid) = 'p_run_id uuid, p_draft jsonb';

  if v_oid is null then
    raise exception 'engine_v2_ingest_build_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('''variant'',''dobbelstein-editorial-v1'',''homeHeroLayout'',''text-only''' in v_def) > 0 then
    return;
  end if;

  if position('''homeHeroLayout'',''image-right''' in v_def) = 0 then
    raise exception 'expected_old_engine_v2_design_default_not_found';
  end if;

  v_def := replace(
    v_def,
    '''homeHeroLayout'',''image-right''',
    '''variant'',''dobbelstein-editorial-v1'',''homeHeroLayout'',''text-only'''
  );

  execute v_def;
end
$$;
