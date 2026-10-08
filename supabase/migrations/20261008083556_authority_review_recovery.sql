create or replace function public.pvos_authority_owner_access(p_period_id uuid,p_revision integer) returns public.pvos_authority_periods language plpgsql security definer set search_path='' as $fn$
declare p public.pvos_authority_periods%rowtype;v_role text;
begin
 select * into p from public.pvos_authority_periods where id=p_period_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(p.organization_id) then raise exception 'Monitoring period not accessible';end if;
 if auth.uid()=p.reviewer_user_id then raise exception 'The assigned independent reviewer cannot prepare source checks';end if;
 select role into v_role from public.pvos_memberships where organization_id=p.organization_id and user_id=auth.uid();
 if p.owner_user_id is distinct from auth.uid() and v_role not in ('admin','qppv','deputy_qppv') then raise exception 'Only the monitoring owner or QPPV administrator can prepare this period';end if;
 if p.status not in ('draft','returned') then raise exception 'Submitted or approved monitoring records are locked';end if;
 if p_revision is null or p.revision<>p_revision then raise exception 'Period changed. Refresh before saving';end if;
 return p;
end $fn$;

create or replace function public.pvos_submit_authority_period(p_period_id uuid,p_revision integer,p_note text) returns uuid language plpgsql security definer set search_path='' as $fn$
declare p public.pvos_authority_periods%rowtype;rid uuid;v_email text;assigned_email text;snap jsonb;v_cycle integer;
begin
 p:=public.pvos_authority_owner_access(p_period_id,p_revision);
 if now()<p.due_at then raise exception 'The monitoring period is still open. Prepare now and submit after the period ends';end if;
 if auth.uid()=p.reviewer_user_id then raise exception 'The assigned reviewer cannot submit their own monitoring record';end if;
 if not exists(select 1 from public.pvos_memberships where organization_id=p.organization_id and user_id=p.reviewer_user_id and role in ('admin','qppv','deputy_qppv')) then raise exception 'The assigned QPPV reviewer is no longer eligible';end if;
 if nullif(trim(p_note),'') is null or length(p_note)>10000 then raise exception 'Record the monitoring conclusion before sending';end if;
 if not exists(select 1 from public.pvos_authority_checks where period_id=p.id) or exists(select 1 from public.pvos_authority_checks c where c.period_id=p.id and (c.outcome in ('not_checked','unavailable') or public.pvos_authority_new_notices(p.id,c.checked_at,c.source_id))) then raise exception 'Complete every source check, resolve unavailable sources and review newly collected notices before sending';end if;
 if exists(select 1 from public.pvos_authority_checks c join public.pvos_products pr on pr.company_id=p.company_id where c.period_id=p.id and pr.updated_at>c.checked_at) then raise exception 'The product catalogue changed after a source check. Review every source against the current products';end if;
 if exists(select 1 from public.pvos_authority_findings where period_id=p.id and assessment='needs_review') then raise exception 'Resolve findings that still need review';end if;
 select email into v_email from auth.users where id=auth.uid();select email into assigned_email from auth.users where id=p.reviewer_user_id;
 select jsonb_build_object('period',to_jsonb(p),'checks',coalesce((select jsonb_agg(to_jsonb(c) order by id) from public.pvos_authority_checks c where period_id=p.id),'[]'),'findings',coalesce((select jsonb_agg(to_jsonb(f)||jsonb_build_object('signal_review_id',(select id from public.pvos_signal_reviews where authority_finding_id=f.id)) order by id) from public.pvos_authority_findings f where period_id=p.id),'[]'),
 'collection_history',coalesce((select jsonb_agg(to_jsonb(r) order by started_at) from public.pvos_authority_collection_runs r where source_id in (select source_id from public.pvos_authority_checks where period_id=p.id) and started_at>=p.period_start::timestamp at time zone 'Asia/Riyadh' and started_at<=now()),'[]'),'products_at_submission',coalesce((select jsonb_agg(jsonb_build_object('id',id,'brand_name',brand_name,'active_ingredient',active_ingredient) order by id) from public.pvos_products where company_id=p.company_id),'[]'),'conclusion',trim(p_note),'evidence_scope','Publisher feed/manual reference snapshots; document bytes are not included') into snap;
 select coalesce(max(cycle),0)+1 into v_cycle from public.pvos_authority_reviews where period_id=p.id;
 insert into public.pvos_authority_reviews(organization_id,company_id,period_id,cycle,sent_by,sent_email,submission_note,assigned_to,assigned_email,snapshot)
 values(p.organization_id,p.company_id,p.id,v_cycle,auth.uid(),v_email,trim(p_note),p.reviewer_user_id,assigned_email,snap) returning id into rid;
 update public.pvos_authority_periods set status='pending_review',revision=revision+1,updated_at=now() where id=p.id;
 update public.pvos_tasks set status='awaiting_review',reviewer_user_id=p.reviewer_user_id where id=p.task_id;
 return rid;
end $fn$;


alter table public.pvos_authority_reviews drop constraint pvos_authority_reviews_status_check;
alter table public.pvos_authority_reviews add constraint pvos_authority_reviews_status_check check(status in ('pending','approved','returned','withdrawn'));
create function public.pvos_withdraw_authority_submission(p_period_id uuid,p_revision integer,p_reason text) returns void language plpgsql security definer set search_path='' as $fn$
declare p public.pvos_authority_periods%rowtype;v_role text;email text;
begin
 select * into p from public.pvos_authority_periods where id=p_period_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(p.organization_id) then raise exception 'Monitoring period not accessible';end if;
 select role into v_role from public.pvos_memberships where organization_id=p.organization_id and user_id=auth.uid();
 if p.owner_user_id is distinct from auth.uid() and v_role not in ('admin','qppv','deputy_qppv') then raise exception 'Only the monitoring owner or QPPV administrator can withdraw';end if;
 if p.reviewer_user_id=auth.uid() then raise exception 'The assigned reviewer must use Return';end if;
 if p.status<>'pending_review' or p_revision is null or p.revision<>p_revision then raise exception 'Refresh the pending period before withdrawing';end if;
 if nullif(trim(p_reason),'') is null or length(p_reason)>10000 then raise exception 'Record why the submission is being withdrawn';end if;
 select auth.users.email into email from auth.users where id=auth.uid();
 update public.pvos_authority_reviews set status='withdrawn',decided_by=auth.uid(),decided_email=email,decided_role=v_role,decided_at=now(),decision_note=trim(p_reason) where period_id=p.id and status='pending';
 update public.pvos_authority_periods set status='returned',revision=revision+1,updated_at=now() where id=p.id;
 update public.pvos_tasks set status='in_progress' where id=p.task_id;
end $fn$;
create function public.pvos_change_authority_reviewer(p_period_id uuid,p_revision integer,p_reviewer_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $fn$
declare p public.pvos_authority_periods%rowtype;email text;
begin
 p:=public.pvos_authority_owner_access(p_period_id,p_revision);
 if p_reviewer_id is null or p_reviewer_id=p.owner_user_id or not exists(select 1 from public.pvos_memberships where organization_id=p.organization_id and user_id=p_reviewer_id and role in ('admin','qppv','deputy_qppv')) then raise exception 'Choose a different eligible QPPV reviewer';end if;
 if nullif(trim(p_reason),'') is null or length(p_reason)>10000 then raise exception 'Record the reviewer change reason';end if;
 select auth.users.email into email from auth.users where id=p_reviewer_id;
 update public.pvos_authority_periods set reviewer_user_id=p_reviewer_id,settings_snapshot=settings_snapshot||jsonb_build_object('reviewer_user_id',p_reviewer_id,'reviewer_email',email,'reviewer_change_reason',trim(p_reason),'reviewer_changed_by',auth.uid(),'reviewer_changed_at',now()),revision=revision+1,updated_at=now() where id=p.id;
end $fn$;
revoke all on function public.pvos_withdraw_authority_submission(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.pvos_withdraw_authority_submission(uuid,integer,text) to authenticated;
revoke all on function public.pvos_change_authority_reviewer(uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.pvos_change_authority_reviewer(uuid,integer,uuid,text) to authenticated;
