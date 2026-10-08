-- Require an explicit revision for preparation and review.
create or replace function public.pvos_inspection_edit_access(p_item_id uuid,p_revision integer) returns public.pvos_inspection_checklist_items language plpgsql security definer set search_path='' as $fn$
declare i public.pvos_inspection_checklist_items%rowtype; v_role text;
begin
 select * into i from public.pvos_inspection_checklist_items where id=p_item_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(i.organization_id) then raise exception 'Checkpoint not accessible'; end if;
 select role into v_role from public.pvos_memberships where organization_id=i.organization_id and user_id=auth.uid();
 if i.owner_user_id is distinct from auth.uid() and v_role not in ('admin','qppv','deputy_qppv') then raise exception 'Only the checkpoint owner or QPPV administrator can prepare evidence'; end if;
 if p_revision is null or i.revision<>p_revision then raise exception 'Checkpoint changed. Refresh before saving'; end if;
 return i;
end $fn$;

create or replace function public.pvos_review_inspection_checkpoint(p_item_id uuid,p_revision integer,p_decision text,p_conclusion text) returns uuid language plpgsql security definer set search_path='' as $fn$
declare i public.pvos_inspection_checklist_items%rowtype; v_role text; v_email text; sources jsonb; review_id uuid;
begin
 select * into i from public.pvos_inspection_checklist_items where id=p_item_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(i.organization_id) then raise exception 'Checkpoint not accessible'; end if;
 select role into v_role from public.pvos_memberships where organization_id=i.organization_id and user_id=auth.uid();
 if v_role not in ('admin','qppv','deputy_qppv') then raise exception 'A QPPV reviewer must record the conclusion'; end if;
 if p_revision is null or i.revision<>p_revision then raise exception 'Checkpoint changed. Refresh before reviewing'; end if;
 if p_decision not in ('reviewed','missing_evidence','not_applicable') or p_decision is null or nullif(trim(p_conclusion),'') is null or length(p_conclusion)>10000 then raise exception 'Choose a review decision and record its conclusion or justification'; end if;
 sources:=public.pvos_inspection_sources(i.id);
 if p_decision='reviewed' and not exists(select 1 from jsonb_array_elements(sources) s where (s->>'supporting')::boolean) then raise exception 'Link supporting evidence before recording Reviewed; task status alone is insufficient'; end if;
 select email into v_email from auth.users where id=auth.uid();
 insert into public.pvos_inspection_checklist_reviews(organization_id,company_id,item_id,item_revision,decision,conclusion,reviewed_by,reviewer_email,reviewer_role,snapshot)
 values(i.organization_id,i.company_id,i.id,i.revision+1,p_decision,trim(p_conclusion),auth.uid(),v_email,v_role,jsonb_build_object('template_source','Dalal-supplied inspection overview; applicability requires human assessment','checkpoint',to_jsonb(i),'sources',sources)) returning id into review_id;
 -- Advance revision on review too: a second stale browser cannot overwrite the latest decision.
 update public.pvos_inspection_checklist_items set status=p_decision,current_review_id=review_id,revision=revision+1,updated_at=now() where id=i.id;
 return review_id;
end $fn$;

