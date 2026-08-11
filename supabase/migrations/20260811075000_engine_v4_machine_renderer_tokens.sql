create table if not exists labnarrative_engine_v4.render_tokens (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references labnarrative_engine_v4.runs(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists engine_v4_render_tokens_run_id_idx
  on labnarrative_engine_v4.render_tokens(run_id, expires_at desc);

revoke all on labnarrative_engine_v4.render_tokens from public, anon, authenticated;

create or replace function labnarrative_engine_v4.issue_render_token(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run labnarrative_engine_v4.runs%rowtype;
  v_token uuid;
  v_expires_at timestamptz;
begin
  select * into v_run
  from labnarrative_engine_v4.runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'Engine v4 run not found';
  end if;

  if v_run.state <> 'active' or v_run.current_stage <> 'renderer' or v_run.site_id is null then
    raise exception 'Render token may only be issued for an active renderer-stage run with an attached site';
  end if;

  delete from labnarrative_engine_v4.render_tokens
  where run_id = p_run_id and expires_at <= now();

  insert into labnarrative_engine_v4.render_tokens(run_id)
  values (p_run_id)
  returning token, expires_at into v_token, v_expires_at;

  insert into labnarrative_engine_v4.events(execution_id, run_id, event_type, message, payload)
  values (
    v_run.execution_id,
    v_run.id,
    'render_token_issued',
    'Short-lived machine renderer capability issued.',
    jsonb_build_object('expiresAt', v_expires_at)
  );

  return jsonb_build_object(
    'runId', p_run_id,
    'token', v_token,
    'expiresAt', v_expires_at,
    'path', '/engine-v4/render/' || p_run_id::text || '?token=' || v_token::text
  );
end;
$$;

revoke all on function labnarrative_engine_v4.issue_render_token(uuid) from public, anon, authenticated;

create or replace function public.engine_v4_render_payload(p_run_id uuid, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'runId', r.id,
    'executionId', r.execution_id,
    'siteId', s.id,
    'slug', s.slug,
    'siteStatus', s.status,
    'content', s.content,
    'contentSchemaVersion', s.content_schema_version,
    'designKey', s.design_key,
    'designVersion', s.design_version,
    'designSettings', s.design_settings,
    'portraitAssetUrl', a.asset_url,
    'portraitSourceUrl', a.source_url,
    'tokenExpiresAt', t.expires_at
  ) into v_result
  from labnarrative_engine_v4.render_tokens t
  join labnarrative_engine_v4.runs r on r.id = t.run_id
  join public.sites s on s.id = r.site_id
  join labnarrative_engine_v4.assets a
    on a.run_id = r.id
   and a.asset_role = 'portrait'
   and a.status = 'verified'
  where t.run_id = p_run_id
    and t.token = p_token
    and t.expires_at > now()
    and r.state = 'active'
    and r.current_stage = 'renderer'
    and s.status = 'draft'
  order by a.updated_at desc
  limit 1;

  if v_result is null then
    return jsonb_build_object('error', 'invalid_or_expired_render_capability');
  end if;

  return v_result;
end;
$$;

revoke all on function public.engine_v4_render_payload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.engine_v4_render_payload(uuid, uuid) to anon;
