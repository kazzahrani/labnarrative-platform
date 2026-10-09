-- Simulated PSUR acceptance testing. Never represents a confirmed regulatory obligation.
-- Simulation is limited to seeded demo companies and reference-only TEST ONLY cycles.
alter table public.pvos_psur_cycles add column if not exists is_simulated boolean not null default false;
alter table public.pvos_psur_cycles drop constraint if exists pvos_psur_cycles_status_check;
alter table public.pvos_psur_cycles add constraint pvos_psur_cycles_status_check
  check(status in ('draft','confirmed','superseded','simulated'));
alter table public.pvos_psur_cycles add constraint pvos_psur_simulated_scope_check
  check(
   (not is_simulated or (jurisdiction='reference_only' and source_revision ilike 'TEST ONLY%'))
   and (status<>'simulated' or (is_simulated and confirmed_by is null and confirmed_at is null))
   and (status<>'confirmed' or not is_simulated)
  );

comment on column public.pvos_psur_cycles.is_simulated is
 'Test-only cycle confined to a seeded demo company. Never evidence of confirmed local regulatory applicability.';

create or replace function public.pvos_psur_test_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.is_simulated and not new.is_simulated then
   raise exception 'A TEST ONLY PSUR cannot be converted into a regulatory obligation. Create a separately verified cycle.';
 end if;
 if new.is_simulated and not exists(
   select 1 from public.pvos_companies c
   where c.id=new.company_id and c.organization_id=new.organization_id and c.seed_key like 'demo-%'
 ) then
   raise exception 'PSUR simulations are available only in seeded demo companies';
 end if;
 if new.is_simulated and (new.jurisdiction<>'reference_only' or new.source_revision not ilike 'TEST ONLY%') then
   raise exception 'Simulated PSUR must remain reference-only and clearly marked TEST ONLY';
 end if;
 return new;
end $$;
drop trigger if exists pvos_psur_test_guard on public.pvos_psur_cycles;
create trigger pvos_psur_test_guard before insert or update on public.pvos_psur_cycles
 for each row execute function public.pvos_psur_test_guard();

create or replace function public.pvos_start_psur_simulation(p_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pvos_psur_cycles%rowtype;v_company public.pvos_companies%rowtype;
 v_product public.pvos_products%rowtype;v_task uuid;v_role text;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into v from public.pvos_psur_cycles where id=p_cycle_id for update;
 if not found or not public.pvos_is_member(v.organization_id) then raise exception 'PSUR cycle unavailable';end if;
 select m.role into v_role from public.pvos_memberships m
  where m.organization_id=v.organization_id and m.user_id=auth.uid();
 if v_role not in ('admin','qppv','deputy_qppv','manager') then
   raise exception 'A PV lead is required to start a PSUR simulation';end if;
 if v.status='simulated' and v.is_simulated then
   return jsonb_build_object('already_started',true,'task_id',v.task_id,'simulated',true);
 end if;
 if v.status<>'draft' or not v.is_simulated or v.jurisdiction<>'reference_only'
    or v.source_revision not ilike 'TEST ONLY%'
    or coalesce(v.authority_basis,'') not ilike 'TEST ONLY%' then
   raise exception 'Create an explicitly marked TEST ONLY reference-only draft before starting a simulation';
 end if;
 select * into v_company from public.pvos_companies c
  where c.id=v.company_id and c.organization_id=v.organization_id and c.seed_key like 'demo-%';
 select * into v_product from public.pvos_products p where p.id=v.product_id and p.company_id=v.company_id;
 if v_company.id is null or v_product.id is null then
   raise exception 'Simulation is restricted to valid seeded demo company products';end if;
 -- No real deadline, no regulated source, no recurring projection.
 insert into public.pvos_tasks(
  organization_id,company_id,product_id,title,activity_type,source,status,priority,
  owner_user_id,reviewer_user_id,due_at,notes,metadata
 ) values (
  v.organization_id,v.company_id,v.product_id,
  'TEST ONLY · PSUR/PBRER · '||v_product.brand_name||' · DLP '||v.data_lock_point::text,
  'PSUR/PBRER','manual','not_started','low',
  coalesce(v_company.qppv_user_id,auth.uid()),v_company.deputy_user_id,null,
  'SIMULATION ONLY. No verified SFDA/EU obligation or actual submission deadline. Never use as compliance evidence.',
  jsonb_build_object('psur_cycle_id',v.id,'simulated',true,'test_only',true,
    'reference_dlp',v.data_lock_point,'reference_due',v.submission_due_date,'source_revision',v.source_revision)
 ) returning id into v_task;
 update public.pvos_psur_cycles
  set status='simulated',task_id=v_task,updated_at=clock_timestamp()
  where id=v.id;
 insert into public.pvos_psur_records(
  cycle_id,organization_id,company_id,product_id,task_id,owner_user_id,reviewer_user_id)
 values(v.id,v.organization_id,v.company_id,v.product_id,v_task,
  coalesce(v_company.qppv_user_id,auth.uid()),v_company.deputy_user_id)
 on conflict(cycle_id) do nothing;
 insert into public.pvos_audit_events(
  organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,after_data)
 values(v.organization_id,v.company_id,auth.uid(),'psur_cycle',v.id,'simulation_started',
  jsonb_build_object('task_id',v_task,'test_only',true,'regulatory_deadline_created',false));
 return jsonb_build_object('already_started',false,'task_id',v_task,'simulated',true);
end $$;
revoke all on function public.pvos_start_psur_simulation(uuid) from public,anon;
grant execute on function public.pvos_start_psur_simulation(uuid) to authenticated;
