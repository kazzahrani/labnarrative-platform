create or replace function public.admin_change_site_design(p_site_id uuid, p_design_variant text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  s public.sites%rowtype;
  requested text := nullif(trim(coalesce(p_design_variant, '')), '');
  next_settings jsonb;
  next_content jsonb;
  display_name text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'
  ) then
    raise exception 'Administrator permission required.' using errcode = '42501';
  end if;

  select * into s from public.sites where id = p_site_id for update;
  if not found then
    raise exception 'Website not found.' using errcode = 'P0002';
  end if;

  if s.status not in ('draft', 'concept') then
    raise exception 'Only Draft and Concept websites can change design from Website monitor.' using errcode = '23514';
  end if;

  if requested not in (
    'Karpen_1',
    'Kops_1',
    'Lens_1',
    'ciribilli-narita-v1',
    'bourdon-full',
    'dobbelstein-editorial-v1',
    'editorial-image-v1'
  ) then
    raise exception 'Unsupported LabNarrative design.' using errcode = '23514';
  end if;

  next_settings := coalesce(s.design_settings, '{}'::jsonb);
  if requested = 'bourdon-full' then
    next_settings := next_settings - 'variant';
    display_name := 'bourdon-full';
  else
    next_settings := jsonb_set(next_settings, '{variant}', to_jsonb(requested), true);
    display_name := case requested
      when 'Karpen_1' then 'Karpen_1'
      when 'Kops_1' then 'Kops_1'
      when 'Lens_1' then 'Lens_1'
      when 'ciribilli-narita-v1' then 'Narita'
      when 'dobbelstein-editorial-v1' then 'Dobbelstein Editorial'
      when 'editorial-image-v1' then 'Editorial Image'
      else requested
    end;
  end if;

  next_content := coalesce(s.content, '{}'::jsonb);
  next_content := jsonb_set(
    next_content,
    '{design}',
    jsonb_build_object(
      'key', 'bourdon-full',
      'version', coalesce(s.design_version, 1),
      'settings', next_settings
    ),
    true
  );
  next_content := jsonb_set(next_content, '{template}', to_jsonb('bourdon-full'::text), true);

  update public.sites
  set design_key = 'bourdon-full',
      design_settings = next_settings,
      content = next_content,
      updated_at = now()
  where id = s.id;

  return jsonb_build_object(
    'ok', true,
    'siteId', s.id,
    'slug', s.slug,
    'status', s.status,
    'designVariant', requested,
    'designName', display_name
  );
end;
$function$;
