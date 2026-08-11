create table if not exists labnarrative_engine_v4.operator_staging (
  command_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0 and chunk_index < 128),
  expected_chunks integer not null check (expected_chunks > 0 and expected_chunks <= 128),
  target_action text not null,
  chunk_text text not null check (length(chunk_text) <= 12000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  primary key (command_id, chunk_index)
);

alter table labnarrative_engine_v4.operator_staging enable row level security;
revoke all on table labnarrative_engine_v4.operator_staging from public, anon, authenticated;
grant all on table labnarrative_engine_v4.operator_staging to postgres, service_role;
create index if not exists operator_staging_expires_idx on labnarrative_engine_v4.operator_staging (expires_at);

create or replace function public.engine_v4_operator_dispatch(
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, labnarrative_engine_v4
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_result jsonb;
  v_run labnarrative_engine_v4.runs%rowtype;
  v_execution labnarrative_engine_v4.executions%rowtype;
  v_site public.sites%rowtype;
  v_run_id uuid;
  v_execution_id uuid;
  v_command_id uuid;
  v_chunk_index integer;
  v_expected_chunks integer;
  v_target_action text;
  v_chunk text;
  v_content jsonb;
  v_slug text;
  v_design_key text;
  v_design_version integer;
  v_design_settings jsonb;
  v_schema_version integer;
  v_i integer;
  v_received integer;
  v_distinct_expected integer;
  v_distinct_action integer;
  v_encoded text;
begin
  if v_action = 'get_execution_state' then
    if nullif(v_payload->>'executionId', '') is not null then
      v_execution_id := (v_payload->>'executionId')::uuid;
      select * into v_execution
      from labnarrative_engine_v4.executions
      where id = v_execution_id;
    else
      select * into v_execution
      from labnarrative_engine_v4.executions
      where state = 'running'
      order by started_at asc
      limit 1;
    end if;

    if v_execution.id is null then
      return jsonb_build_object('execution', null);
    end if;
    return jsonb_build_object('execution', to_jsonb(v_execution));
  end if;

  if v_action = 'get_run_context' then
    v_run_id := (v_payload->>'runId')::uuid;
    select * into v_run from labnarrative_engine_v4.runs where id = v_run_id;
    if v_run.id is null then
      raise exception 'Engine v4 run not found';
    end if;

    select * into v_execution from labnarrative_engine_v4.executions where id = v_run.execution_id;
    if v_run.site_id is not null then
      select * into v_site from public.sites where id = v_run.site_id;
    end if;

    return jsonb_build_object(
      'run', to_jsonb(v_run),
      'execution', case when v_execution.id is null then null else to_jsonb(v_execution) end,
      'evidence', coalesce((
        select jsonb_object_agg(
          e.evidence_type,
          jsonb_build_object(
            'status', e.status,
            'sourceUrl', e.source_url,
            'sourceKind', e.source_kind,
            'value', e.value,
            'updatedAt', e.updated_at
          )
        )
        from labnarrative_engine_v4.evidence e
        where e.run_id = v_run_id
      ), '{}'::jsonb),
      'portrait', (
        select jsonb_build_object(
          'status', a.status,
          'assetUrl', a.asset_url,
          'sourceUrl', a.source_url,
          'sourceKind', a.source_kind,
          'metadata', a.metadata,
          'updatedAt', a.updated_at
        )
        from labnarrative_engine_v4.assets a
        where a.run_id = v_run_id and a.asset_role = 'portrait'
        order by a.updated_at desc
        limit 1
      ),
      'site', case when v_site.id is null then null else jsonb_build_object(
        'id', v_site.id,
        'slug', v_site.slug,
        'status', v_site.status,
        'content', v_site.content,
        'contentSchemaVersion', v_site.content_schema_version,
        'designKey', v_site.design_key,
        'designVersion', v_site.design_version,
        'designSettings', v_site.design_settings,
        'domainStatus', v_site.domain_status,
        'outreachStatus', v_site.outreach_status,
        'updatedAt', v_site.updated_at
      ) end,
      'rendererCheck', (
        select jsonb_build_object(
          'status', c.status,
          'previewUrl', c.preview_url,
          'portraitUrl', c.portrait_url,
          'portraitWidth', c.portrait_width,
          'portraitHeight', c.portrait_height,
          'details', c.details,
          'createdAt', c.created_at
        )
        from labnarrative_engine_v4.renderer_checks c
        where c.run_id = v_run_id
        order by c.created_at desc
        limit 1
      ),
      'review', (
        select jsonb_build_object(
          'decision', r.decision,
          'note', r.note,
          'decidedAt', r.decided_at,
          'updatedAt', r.updated_at
        )
        from labnarrative_engine_v4.review r
        where r.run_id = v_run_id
        limit 1
      )
    );
  end if;

  if v_action = 'open_execution' then
    return labnarrative_engine_v4.open_execution(v_payload->>'executionKey');
  end if;

  if v_action = 'claim_next_action' then
    v_execution_id := (v_payload->>'executionId')::uuid;
    select to_jsonb(x) into v_result
    from labnarrative_engine_v4.claim_next_action(v_execution_id, v_payload->>'workerKey') x
    limit 1;
    return coalesce(v_result, 'null'::jsonb);
  end if;

  if v_action = 'record_stage_attempt' then
    return labnarrative_engine_v4.record_stage_attempt(
      (v_payload->>'runId')::uuid,
      v_payload->>'stage',
      v_payload->>'outcome',
      coalesce(v_payload->'payload', '{}'::jsonb),
      nullif(v_payload->>'error', '')
    );
  end if;

  if v_action = 'upsert_evidence' then
    return labnarrative_engine_v4.upsert_evidence(
      (v_payload->>'runId')::uuid,
      v_payload->>'evidenceType',
      v_payload->>'status',
      nullif(v_payload->>'sourceUrl', ''),
      nullif(v_payload->>'sourceKind', ''),
      coalesce(v_payload->'value', '{}'::jsonb)
    );
  end if;

  if v_action = 'save_private_site' then
    v_run_id := (v_payload->>'runId')::uuid;
    select * into v_run from labnarrative_engine_v4.runs where id = v_run_id for update;
    if v_run.id is null then
      raise exception 'Engine v4 run not found';
    end if;
    if v_run.state <> 'active' or v_run.current_stage not in ('site', 'portrait', 'renderer') then
      raise exception 'Private site may only be saved for an active site/portrait/renderer stage run';
    end if;

    v_content := v_payload->'content';
    if v_content is null or jsonb_typeof(v_content) <> 'object' then
      raise exception 'Complete site content object is required';
    end if;

    if not (
      v_content ? 'piName' and v_content ? 'labName' and v_content ? 'title' and
      v_content ? 'institution' and v_content ? 'eyebrow' and v_content ? 'headline' and
      v_content ? 'introduction' and v_content ? 'focusAreas' and v_content ? 'projects' and
      v_content ? 'team' and v_content ? 'members' and v_content ? 'publications' and
      v_content ? 'research' and v_content ? 'pages' and v_content ? 'theme' and v_content ? 'design'
    ) then
      raise exception 'Site content is missing required Narita top-level fields';
    end if;

    if lower(btrim(coalesce(v_content->>'piName', ''))) <> lower(btrim(v_run.pi_name)) then
      raise exception 'Site PI identity does not match the Engine v4 run';
    end if;
    if jsonb_typeof(v_content->'projects') <> 'array' or jsonb_array_length(v_content->'projects') <> 4 then
      raise exception 'Site requires exactly four projects';
    end if;
    if jsonb_typeof(v_content->'research') <> 'array' or jsonb_array_length(v_content->'research') <> 4 then
      raise exception 'Site requires exactly four research entries';
    end if;
    if jsonb_typeof(v_content->'publications') <> 'array' or jsonb_array_length(v_content->'publications') < 4 then
      raise exception 'Site requires at least four publications';
    end if;

    for v_i in 0..3 loop
      if coalesce(v_content->'projects'->v_i->>'description', '') <> coalesce(v_content->'research'->v_i->>'summary', '') then
        raise exception 'Each project description must exactly mirror its research summary';
      end if;
    end loop;

    v_slug := coalesce(nullif(v_content->>'slug', ''), v_run.slug);
    if v_slug <> v_run.slug then
      raise exception 'Site slug must match the Engine v4 run slug';
    end if;

    v_schema_version := coalesce(nullif(v_payload->>'contentSchemaVersion', '')::integer, 1);
    v_design_key := coalesce(nullif(v_payload->>'designKey', ''), nullif(v_content#>>'{design,key}', ''), 'bourdon-full');
    v_design_version := coalesce(nullif(v_payload->>'designVersion', '')::integer, nullif(v_content#>>'{design,version}', '')::integer, 3);
    v_design_settings := coalesce(v_payload->'designSettings', v_content#>'{design,settings}', jsonb_build_object('engine','v4','variant','ciribilli-narita-v1','templatePolicy','engine_v4_narita'));

    if coalesce(v_design_settings->>'variant', v_content#>>'{design,variant}', '') <> 'ciribilli-narita-v1' then
      raise exception 'Engine v4 site must use ciribilli-narita-v1';
    end if;

    if v_run.site_id is not null then
      select * into v_site from public.sites where id = v_run.site_id for update;
      if v_site.id is null then
        raise exception 'Attached site record not found';
      end if;
      if v_site.status <> 'draft' then
        raise exception 'Production may only modify a private draft site';
      end if;
      if v_site.slug <> v_slug then
        raise exception 'Attached site slug does not match the Engine v4 run';
      end if;

      update public.sites
      set content = v_content,
          content_schema_version = v_schema_version,
          design_key = v_design_key,
          design_version = v_design_version,
          design_settings = v_design_settings,
          status = 'draft',
          updated_at = now()
      where id = v_site.id
      returning * into v_site;
    else
      if exists (select 1 from public.sites s where s.slug = v_slug) then
        raise exception 'A site with this slug already exists and is not attached to this run';
      end if;

      insert into public.sites (
        slug, status, content, content_schema_version, design_key, design_version, design_settings
      ) values (
        v_slug, 'draft', v_content, v_schema_version, v_design_key, v_design_version, v_design_settings
      ) returning * into v_site;
    end if;

    return jsonb_build_object(
      'ok', true,
      'siteId', v_site.id,
      'slug', v_site.slug,
      'status', v_site.status,
      'designKey', v_site.design_key,
      'designVersion', v_site.design_version,
      'designSettings', v_site.design_settings
    );
  end if;

  if v_action = 'attach_site' then
    return labnarrative_engine_v4.attach_site(
      (v_payload->>'runId')::uuid,
      (v_payload->>'siteId')::uuid
    );
  end if;

  if v_action = 'complete_stage' then
    return labnarrative_engine_v4.complete_stage(
      (v_payload->>'runId')::uuid,
      v_payload->>'stage',
      coalesce(v_payload->'payload', '{}'::jsonb)
    );
  end if;

  if v_action = 'upsert_portrait' then
    return labnarrative_engine_v4.upsert_portrait(
      (v_payload->>'runId')::uuid,
      v_payload->>'status',
      v_payload->>'assetUrl',
      v_payload->>'sourceUrl',
      v_payload->>'sourceKind',
      coalesce(v_payload->'metadata', '{}'::jsonb)
    );
  end if;

  if v_action = 'issue_render_token' then
    return labnarrative_engine_v4.issue_render_token((v_payload->>'runId')::uuid);
  end if;

  if v_action = 'record_renderer_check' then
    return labnarrative_engine_v4.record_renderer_check(
      (v_payload->>'runId')::uuid,
      v_payload->>'status',
      v_payload->>'previewUrl',
      v_payload->>'portraitUrl',
      (v_payload->>'width')::integer,
      (v_payload->>'height')::integer,
      coalesce(v_payload->'details', '{}'::jsonb)
    );
  end if;

  if v_action = 'finalize_for_review' then
    return labnarrative_engine_v4.finalize_for_review((v_payload->>'runId')::uuid);
  end if;

  if v_action = 'block_run' then
    return labnarrative_engine_v4.block_run(
      (v_payload->>'runId')::uuid,
      v_payload->>'reason',
      coalesce(v_payload->'payload', '{}'::jsonb)
    );
  end if;

  if v_action = 'stage_chunk' then
    v_command_id := (v_payload->>'commandId')::uuid;
    v_chunk_index := (v_payload->>'chunkIndex')::integer;
    v_expected_chunks := (v_payload->>'expectedChunks')::integer;
    v_target_action := lower(btrim(v_payload->>'targetAction'));
    v_chunk := v_payload->>'chunk';

    if v_target_action not in (
      'record_stage_attempt', 'upsert_evidence', 'save_private_site', 'complete_stage',
      'upsert_portrait', 'record_renderer_check', 'block_run'
    ) then
      raise exception 'Target action is not eligible for staged transport';
    end if;
    if v_chunk is null or length(v_chunk) = 0 then
      raise exception 'Chunk is required';
    end if;

    delete from labnarrative_engine_v4.operator_staging where expires_at < now();

    if exists (
      select 1 from labnarrative_engine_v4.operator_staging s
      where s.command_id = v_command_id
        and (s.expected_chunks <> v_expected_chunks or s.target_action <> v_target_action)
    ) then
      raise exception 'Staged command metadata does not match existing chunks';
    end if;

    insert into labnarrative_engine_v4.operator_staging (
      command_id, chunk_index, expected_chunks, target_action, chunk_text, expires_at
    ) values (
      v_command_id, v_chunk_index, v_expected_chunks, v_target_action, v_chunk, now() + interval '30 minutes'
    )
    on conflict (command_id, chunk_index) do update
      set chunk_text = excluded.chunk_text,
          expires_at = excluded.expires_at;

    select count(*) into v_received
    from labnarrative_engine_v4.operator_staging s
    where s.command_id = v_command_id and s.expires_at >= now();

    return jsonb_build_object(
      'ok', true,
      'commandId', v_command_id,
      'targetAction', v_target_action,
      'receivedChunks', v_received,
      'expectedChunks', v_expected_chunks,
      'complete', v_received = v_expected_chunks
    );
  end if;

  if v_action = 'get_staged' then
    v_command_id := (v_payload->>'commandId')::uuid;
    delete from labnarrative_engine_v4.operator_staging where expires_at < now();

    select count(*), count(distinct expected_chunks), count(distinct target_action),
           min(expected_chunks), min(target_action), string_agg(chunk_text, '' order by chunk_index)
      into v_received, v_distinct_expected, v_distinct_action,
           v_expected_chunks, v_target_action, v_encoded
    from labnarrative_engine_v4.operator_staging
    where command_id = v_command_id and expires_at >= now();

    if v_received = 0 then
      raise exception 'Staged command not found or expired';
    end if;
    if v_distinct_expected <> 1 or v_distinct_action <> 1 or v_received <> v_expected_chunks then
      raise exception 'Staged command is incomplete or inconsistent';
    end if;

    return jsonb_build_object(
      'commandId', v_command_id,
      'targetAction', v_target_action,
      'expectedChunks', v_expected_chunks,
      'receivedChunks', v_received,
      'encodedPayload', v_encoded
    );
  end if;

  if v_action = 'delete_staged' then
    v_command_id := (v_payload->>'commandId')::uuid;
    delete from labnarrative_engine_v4.operator_staging where command_id = v_command_id;
    return jsonb_build_object('ok', true, 'commandId', v_command_id);
  end if;

  raise exception 'Unsupported Engine v4 operator action';
end;
$$;

revoke all on function public.engine_v4_operator_dispatch(text, jsonb) from public;
revoke all on function public.engine_v4_operator_dispatch(text, jsonb) from anon;
revoke all on function public.engine_v4_operator_dispatch(text, jsonb) from authenticated;
grant execute on function public.engine_v4_operator_dispatch(text, jsonb) to postgres, service_role;

comment on function public.engine_v4_operator_dispatch(text, jsonb) is
'Service-role-only Engine v4 operator bridge. Intentionally excludes publish, approval, public-site, domain and outreach actions.';
