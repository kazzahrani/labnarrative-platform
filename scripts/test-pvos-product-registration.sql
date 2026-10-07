-- All fixtures and decisions are rolled back; no production registrations change.
begin;
select set_config('test.org',gen_random_uuid()::text,true),set_config('test.company',gen_random_uuid()::text,true),set_config('test.product',gen_random_uuid()::text,true),set_config('test.other_org',gen_random_uuid()::text,true),set_config('test.other_company',gen_random_uuid()::text,true);
insert into public.pvos_organizations(id,name) values(current_setting('test.org')::uuid,'Registration fixture'),(current_setting('test.other_org')::uuid,'Registration other tenant fixture');
insert into public.pvos_memberships(organization_id,user_id,role) values(current_setting('test.org')::uuid,'621bdbb0-972a-4c70-83a3-a6e0df372d00','admin');
insert into public.pvos_companies(id,organization_id,name) values(current_setting('test.company')::uuid,current_setting('test.org')::uuid,'Registration fixture company'),(current_setting('test.other_company')::uuid,current_setting('test.other_org')::uuid,'Other tenant');
insert into public.pvos_products(company_id,brand_name,registration_status) values(current_setting('test.other_company')::uuid,'Hidden registration product','Registered');
set local role authenticated;
select set_config('request.jwt.claim.sub','621bdbb0-972a-4c70-83a3-a6e0df372d00',true);
insert into public.pvos_products(id,company_id,brand_name,seed_key) values(current_setting('test.product')::uuid,current_setting('test.company')::uuid,'Fixture product','registration-fixture');
-- No invented default registration. Import/free-text legacy statuses remain supported.
do $$begin
  if (select registration_status from public.pvos_products where id=current_setting('test.product')::uuid) is not null then raise exception 'TEST FAILURE: fabricated default registration'; end if;
  begin
    update public.pvos_products set registration_status='Registered' where id=current_setting('test.product')::uuid;
    raise exception 'TEST FAILURE: registration change without reason accepted';
  exception when others then if sqlerrm<>'A reason is required for a registration change' then raise; end if; end;
end$$;
select set_config('test.original',updated_at::text,true) from public.pvos_products where id=current_setting('test.product')::uuid;
update public.pvos_products set registration_status='Registered',sfda_registration_number='TEST-ONLY-001',registration_reference='Fixture approval document',registration_change_reason='Verified fixture document for workflow test'
where id=current_setting('test.product')::uuid and updated_at=current_setting('test.original')::timestamptz;
do $$begin
  if (select count(*) from public.pvos_audit_events where entity_id=current_setting('test.product')::uuid and entity_type='product_registration')<>2 then raise exception 'TEST FAILURE: missing insert or change audit'; end if;
  if not exists(select 1 from public.pvos_audit_events where entity_id=current_setting('test.product')::uuid and event_type='update'
    and actor_user_id='621bdbb0-972a-4c70-83a3-a6e0df372d00'
    and metadata->>'actor_email'='oxyginmusic@gmail.com'
    and metadata->>'reason'='Verified fixture document for workflow test'
    and before_data->>'registration_status' is null
    and after_data->>'registration_status'='Registered'
    and created_at=now()) then raise exception 'TEST FAILURE: attribution or before/after snapshot incorrect'; end if;
  -- Unrelated RMP writes must continue working without producing registration events.
  update public.pvos_products set rmp_status='Active',metadata=jsonb_build_object('rmp',jsonb_build_object('status','Active')) where id=current_setting('test.product')::uuid;
  if (select count(*) from public.pvos_audit_events where entity_id=current_setting('test.product')::uuid and entity_type='product_registration')<>2 then raise exception 'TEST FAILURE: unrelated RMP change polluted history'; end if;
  -- Duplicate seed insert used on returning sign-in remains a no-op.
  insert into public.pvos_products(company_id,brand_name,seed_key,registration_status) values(current_setting('test.company')::uuid,'Fixture product','registration-fixture','Registered') on conflict(company_id,seed_key) do nothing;
  if (select count(*) from public.pvos_audit_events where entity_id=current_setting('test.product')::uuid and entity_type='product_registration')<>2 then raise exception 'TEST FAILURE: returning seed changed history'; end if;
  if exists(select 1 from public.pvos_products where company_id=current_setting('test.other_company')::uuid) then raise exception 'TEST FAILURE: other tenant visible'; end if;
  update public.pvos_products set registration_status='Suspended',registration_change_reason='Unauthorized' where company_id=current_setting('test.other_company')::uuid;
  if found then raise exception 'TEST FAILURE: other tenant writable'; end if;
  begin
    delete from public.pvos_audit_events where entity_id=current_setting('test.product')::uuid;
    if found then raise exception 'TEST FAILURE: audit events deletable'; end if;
  exception when insufficient_privilege then null; end;
end$$;
reset role;
do $$begin
 if (select registration_status from public.pvos_products where company_id=current_setting('test.other_company')::uuid)<>'Registered' then raise exception 'TEST FAILURE: cross-tenant change'; end if;
 if has_function_privilege('authenticated','public.pvos_audit_product_registration()','EXECUTE') or has_function_privilege('anon','public.pvos_audit_product_registration()','EXECUTE') then raise exception 'TEST FAILURE: audit trigger function exposed'; end if;
end$$;
select 'PASS: initial status unknown; reason enforced; actor, timestamp and before/after retained; RMP and sign-in seed unaffected; tenant isolation and audit protection passed' as result;
rollback;
