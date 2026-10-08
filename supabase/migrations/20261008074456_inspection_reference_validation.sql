-- Validate the complete URL authority before accepting versioned references.
create or replace function public.pvos_link_inspection_evidence(p_item_id uuid,p_revision integer,p_kind text,p_reference_id uuid default null,p_title text default null,p_url text default null,p_version text default null) returns uuid language plpgsql security definer set search_path='' as $fn$
declare i public.pvos_inspection_checklist_items%rowtype; link_id uuid; sources jsonb; v_title text;
begin
 i:=public.pvos_inspection_edit_access(p_item_id,p_revision);
 v_title:=nullif(trim(p_title),'');
 if v_title is null or length(v_title)>1000 then raise exception 'Provide an evidence title'; end if;
 if p_kind='external' and (p_url is null or p_url !~ '^https://[^/@:?#[:space:]]+(:[0-9]+)?([/?#][^[:space:]]*)?$' or length(p_url)>4000 or nullif(trim(p_version),'') is null or length(p_version)>500) then raise exception 'Use an HTTPS reference without credentials and record its document version'; end if;
 insert into public.pvos_inspection_checklist_links(organization_id,company_id,item_id,kind,reference_id,title,external_url,version,created_by)
 values(i.organization_id,i.company_id,i.id,p_kind,p_reference_id,v_title,case when p_kind='external' then p_url end,nullif(trim(p_version),''),auth.uid()) returning id into link_id;
 sources:=public.pvos_inspection_sources(i.id);
 if exists(select 1 from jsonb_array_elements(sources) s where s->'link'->>'id'=link_id::text and s->'source'='null'::jsonb) then raise exception 'Evidence is unavailable or belongs to another company'; end if;
 update public.pvos_inspection_checklist_items set revision=revision+1,status=case when exists(select 1 from jsonb_array_elements(sources) s where (s->>'supporting')::boolean) then 'awaiting_review' else 'missing_evidence' end,updated_at=now() where id=i.id;
 return link_id;
end $fn$;

