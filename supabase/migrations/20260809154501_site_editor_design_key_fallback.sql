create or replace function public.site_editor_validate_content(p_site_id uuid, p_content jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, labnarrative_engine_v3
as $$
declare
  v_slug text;
  v_site_design_key text;
  v_is_v3 boolean := false;
  v_issues text[] := array[]::text[];
  v_key text;
  v_required text[] := array['slug','piName','labName','title','institution','eyebrow','headline','introduction','focusAreas','projects','team','members','publications','research','pages','theme','design'];
  v_arrays text[] := array['focusAreas','projects','team','members','publications','research'];
  v_theme text[] := array['background','surface','foreground','muted','accent'];
begin
  select s.slug,s.design_key into v_slug,v_site_design_key from public.sites s where s.id=p_site_id;
  if v_slug is null then return jsonb_build_object('ok',false,'issues',jsonb_build_array('Site not found')); end if;
  select exists(select 1 from labnarrative_engine_v3.runs r where r.site_id=p_site_id and r.state<>'cancelled') into v_is_v3;
  if p_content is null or jsonb_typeof(p_content)<>'object' then return jsonb_build_object('ok',false,'issues',jsonb_build_array('Website content must be a JSON object')); end if;

  foreach v_key in array v_required loop
    if not (p_content ? v_key) or p_content->v_key is null or p_content->v_key='null'::jsonb then v_issues:=array_append(v_issues,'Missing '||v_key); end if;
  end loop;
  foreach v_key in array v_arrays loop
    if jsonb_typeof(p_content->v_key) is distinct from 'array' then v_issues:=array_append(v_issues,v_key||' must be an array'); end if;
  end loop;
  if jsonb_typeof(p_content->'pages') is distinct from 'object' then v_issues:=array_append(v_issues,'pages must be an object'); end if;
  if jsonb_typeof(p_content->'theme') is distinct from 'object' then v_issues:=array_append(v_issues,'theme must be an object'); end if;
  if jsonb_typeof(p_content->'design') is distinct from 'object' then v_issues:=array_append(v_issues,'design must be an object'); end if;
  if coalesce(trim(p_content->>'slug'),'')<>v_slug then v_issues:=array_append(v_issues,'Slug must remain '||v_slug); end if;
  foreach v_key in array v_theme loop
    if coalesce(trim(p_content->'theme'->>v_key),'')='' then v_issues:=array_append(v_issues,'Theme '||v_key||' is required'); end if;
  end loop;
  if coalesce(trim(p_content->'design'->>'key'),trim(v_site_design_key),'')='' then v_issues:=array_append(v_issues,'Design key is required'); end if;
  if coalesce(trim(p_content->>'piName'),'')='' then v_issues:=array_append(v_issues,'Principal investigator name is required'); end if;
  if coalesce(trim(p_content->>'labName'),'')='' then v_issues:=array_append(v_issues,'Laboratory name is required'); end if;
  if coalesce(trim(p_content->>'headline'),'')='' then v_issues:=array_append(v_issues,'Headline is required'); end if;
  if coalesce(trim(p_content->>'introduction'),'')='' then v_issues:=array_append(v_issues,'Introduction is required'); end if;
  if jsonb_typeof(p_content->'research')='array' and jsonb_array_length(p_content->'research')=0 then v_issues:=array_append(v_issues,'At least one research programme is required'); end if;
  if jsonb_typeof(p_content->'publications')='array' and jsonb_array_length(p_content->'publications')=0 then v_issues:=array_append(v_issues,'At least one publication is required'); end if;
  if v_is_v3 and coalesce(trim(p_content->'pages'->'home'->>'piImage'),trim(p_content->'pages'->'contact'->>'piImage'),'')='' then v_issues:=array_append(v_issues,'Engine v3 requires a PI portrait'); end if;
  return jsonb_build_object('ok',cardinality(v_issues)=0,'issues',to_jsonb(v_issues),'engineV3',v_is_v3);
end;
$$;
