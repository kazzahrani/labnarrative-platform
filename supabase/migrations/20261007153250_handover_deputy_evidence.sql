-- Existing V0 handovers stay historical; verified evidence starts with workflow v2.
alter table public.pvos_handovers add column workflow_version integer not null default 1;
alter table public.pvos_handovers add column participants jsonb not null default '{}'::jsonb;
alter table public.pvos_handover_companies add column deputy_acknowledged_by uuid references auth.users(id);
alter table public.pvos_handover_companies add column qppv_handback_acknowledged_by uuid references auth.users(id);

create table public.pvos_handover_evidence (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null unique references public.pvos_handovers(id),
  organization_id uuid not null references public.pvos_organizations(id),
  snapshot jsonb not null,
  snapshot_sha256 text not null,
  template_version text not null default 'handover-v1',
  created_at timestamptz not null default now()
);
alter table public.pvos_handover_evidence enable row level security;
create policy "handover evidence member read" on public.pvos_handover_evidence
  for select to authenticated using (public.pvos_is_member(organization_id));
revoke all on public.pvos_handover_evidence from public,anon,authenticated;
grant select on public.pvos_handover_evidence to authenticated;

-- Invoker trigger: client writes cannot impersonate an acknowledgement or edit a frozen snapshot.
-- Only the privileged, identity-checking RPCs below write these tables.
create function public.pvos_guard_handover_write() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user not in ('postgres','supabase_admin','service_role') then
    raise exception 'Use the authorized handover workflow';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger pvos_guard_handover_write before insert or update or delete on public.pvos_handovers
  for each row execute function public.pvos_guard_handover_write();
create trigger pvos_guard_handover_company_write before insert or update or delete on public.pvos_handover_companies
  for each row execute function public.pvos_guard_handover_write();
create function public.pvos_guard_handover_evidence() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Handover evidence is immutable'; end $$;
create trigger pvos_guard_handover_evidence before update or delete on public.pvos_handover_evidence
  for each row execute function public.pvos_guard_handover_evidence();

create function public.pvos_create_handover(p_organization_id uuid,p_deputy_user_id uuid,p_leave_start date,p_leave_end date)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_now timestamptz:=now(); v_participants jsonb; v_count integer;
begin
  if auth.uid() is null or not exists(select 1 from public.pvos_memberships where organization_id=p_organization_id and user_id=auth.uid() and role in ('admin','qppv')) then
    raise exception 'Only the workspace QPPV or administrator can create a handover';
  end if;
  if p_deputy_user_id is null or p_deputy_user_id=auth.uid() or not exists(select 1 from public.pvos_memberships where organization_id=p_organization_id and user_id=p_deputy_user_id and role in ('deputy_qppv','qppv')) then
    raise exception 'Choose a different workspace member with a QPPV or Deputy QPPV role';
  end if;
  if p_leave_start is null or p_leave_end is null or p_leave_end<p_leave_start then raise exception 'Invalid leave dates'; end if;
  select jsonb_build_object('qppv',jsonb_build_object('user_id',q.id,'email',q.email),
    'deputy',jsonb_build_object('user_id',d.id,'email',d.email),
    'organization_name',o.name) into v_participants
    from auth.users q cross join auth.users d cross join public.pvos_organizations o
    where q.id=auth.uid() and d.id=p_deputy_user_id and o.id=p_organization_id;
  insert into public.pvos_handovers(organization_id,qppv_user_id,deputy_user_id,leave_start,leave_end,status,workflow_version,participants)
    values(p_organization_id,auth.uid(),p_deputy_user_id,p_leave_start,p_leave_end,'sent',2,v_participants) returning id into v_id;
  -- A single database statement freezes every open task; no API row limit or client-supplied evidence.
  insert into public.pvos_handover_companies(handover_id,company_id,snapshot)
  select v_id,c.id,jsonb_build_object('company_name',c.name,'contract_scope',c.contract_scope,
    'open_tasks',count(t.id),'due_during_leave',count(t.id) filter(where (t.due_at at time zone 'Asia/Riyadh')::date between p_leave_start and p_leave_end),
    'risk',case when bool_or(t.due_at<v_now or (t.priority in ('high','critical') and (t.due_at at time zone 'Asia/Riyadh')::date between p_leave_start and p_leave_end)) then 'High'
      when count(t.id)>2 or count(t.id) filter(where (t.due_at at time zone 'Asia/Riyadh')::date between p_leave_start and p_leave_end)>0 then 'Medium' else 'Low' end,
    'tasks',jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'activity_type',t.activity_type,'status',t.status,'priority',t.priority,'due_at',t.due_at) order by t.due_at nulls last,t.id),
    'created_at',v_now,'created_from','PVOS handover v2','deadline_timezone','Asia/Riyadh')
  from public.pvos_companies c join public.pvos_tasks t on t.company_id=c.id and t.organization_id=p_organization_id and t.status not in ('complete','cancelled')
  where c.organization_id=p_organization_id group by c.id;
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'No open company workload to hand over'; end if;
  return v_id;
end $$;

create function public.pvos_acknowledge_handover_company(p_handover_id uuid,p_company_record_id uuid,p_handback boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.pvos_handovers%rowtype; v_now timestamptz:=now(); v_snapshot jsonb; v_evidence_id uuid;
begin
  select * into h from public.pvos_handovers where id=p_handover_id for update;
  if not found or auth.uid() is null or not public.pvos_is_member(h.organization_id) then raise exception 'Handover not accessible'; end if;
  if h.workflow_version<>2 then raise exception 'Legacy handover: identity-verified acknowledgements are unavailable'; end if;
  if not exists(select 1 from public.pvos_handover_companies where id=p_company_record_id and handover_id=h.id) then raise exception 'Company record not found'; end if;
  if p_handback then
    if auth.uid()<>h.qppv_user_id or h.status<>'handback_pending' then raise exception 'Only the originating QPPV can acknowledge a pending handback'; end if;
    update public.pvos_handover_companies set qppv_handback_acknowledged_at=v_now,qppv_handback_acknowledged_by=auth.uid()
      where id=p_company_record_id and qppv_handback_acknowledged_at is null;
  else
    if auth.uid()<>h.deputy_user_id or auth.uid()=h.qppv_user_id then raise exception 'Only the assigned Deputy can acknowledge this handover'; end if;
    if h.status not in ('sent','accepted') then raise exception 'Handover is not awaiting Deputy acknowledgement'; end if;
    update public.pvos_handover_companies set deputy_acknowledged_at=v_now,deputy_acknowledged_by=auth.uid()
      where id=p_company_record_id and deputy_acknowledged_at is null;
    if h.status='sent' and not exists(select 1 from public.pvos_handover_companies where handover_id=h.id and deputy_acknowledged_at is null) then
      update public.pvos_handovers set status='accepted',accepted_at=v_now where id=h.id;
      select jsonb_build_object('handover_id',h.id,'organization_id',h.organization_id,'participants',h.participants,
        'leave_start',h.leave_start,'leave_end',h.leave_end,'sent_at',h.created_at,'accepted_at',v_now,
        'companies',jsonb_agg(jsonb_build_object('record_id',r.id,'company_id',r.company_id,'snapshot',r.snapshot,
          'deputy_acknowledged_by',r.deputy_acknowledged_by,'deputy_acknowledged_at',r.deputy_acknowledged_at) order by r.company_id))
        into v_snapshot from public.pvos_handover_companies r where r.handover_id=h.id;
      insert into public.pvos_handover_evidence(handover_id,organization_id,snapshot,snapshot_sha256)
        values(h.id,h.organization_id,v_snapshot,encode(extensions.digest(v_snapshot::text,'sha256'),'hex')) returning id into v_evidence_id;
      insert into public.pvos_audit_events(organization_id,actor_user_id,entity_type,entity_id,event_type,after_data,metadata)
        values(h.organization_id,auth.uid(),'handover_evidence',v_evidence_id,'snapshot_frozen',v_snapshot,jsonb_build_object('handover_id',h.id,'template_version','handover-v1'));
    end if;
  end if;
  select id into v_evidence_id from public.pvos_handover_evidence where handover_id=h.id;
  return jsonb_build_object('evidence_id',v_evidence_id,'accepted',v_evidence_id is not null);
end $$;

create function public.pvos_advance_handover(p_handover_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare h public.pvos_handovers%rowtype; v_next text;
begin
  select * into h from public.pvos_handovers where id=p_handover_id for update;
  if not found or auth.uid() is null or not public.pvos_is_member(h.organization_id) or auth.uid()<>h.qppv_user_id then raise exception 'Only the originating QPPV can advance this handover'; end if;
  if h.workflow_version<>2 then raise exception 'Legacy handover is read-only'; end if;
  if h.status='accepted' and exists(select 1 from public.pvos_handover_evidence where handover_id=h.id) then v_next:='active';
  elsif h.status='active' then v_next:='handback_pending';
  elsif h.status='handback_pending' and not exists(select 1 from public.pvos_handover_companies where handover_id=h.id and qppv_handback_acknowledged_at is null) then v_next:='closed';
  else raise exception 'Required acknowledgements are incomplete or transition is invalid'; end if;
  update public.pvos_handovers set status=v_next,handback_at=case when v_next='closed' then now() else handback_at end where id=h.id;
  return v_next;
end $$;

revoke all on function public.pvos_guard_handover_write(),public.pvos_guard_handover_evidence(),public.pvos_create_handover(uuid,uuid,date,date),public.pvos_acknowledge_handover_company(uuid,uuid,boolean),public.pvos_advance_handover(uuid) from public,anon,authenticated;
grant execute on function public.pvos_create_handover(uuid,uuid,date,date),public.pvos_acknowledge_handover_company(uuid,uuid,boolean),public.pvos_advance_handover(uuid) to authenticated;
