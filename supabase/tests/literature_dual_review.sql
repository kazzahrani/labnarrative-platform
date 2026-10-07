begin;
create temporary table pvos_review_test_context as select gen_random_uuid() as org,gen_random_uuid() as run,gen_random_uuid() as item,gen_random_uuid() as irrelevant,
  review_users.ids[1] as first_user,review_users.ids[2] as second_user,review_users.ids[3] as outsider,
  (select email from auth.users where id=review_users.ids[2]) as second_email
  from (select array_agg(id order by id) as ids from (select id from auth.users order by id limit 3) existing_users) review_users;
insert into public.pvos_organizations(id,name) select org,'PVOS rollback-only dual-review test' from pvos_review_test_context;
insert into public.pvos_memberships(organization_id,user_id,role) select org,first_user,'admin' from pvos_review_test_context;
grant select on pvos_review_test_context to authenticated;
set local role authenticated;
do $$
declare t record; sr jsonb; evidence jsonb; err text;
begin
  select * into t from pvos_review_test_context;
  perform set_config('request.jwt.claim.sub',t.first_user::text,true);
  assert t.outsider is not null,'Test requires three existing auth users';
  perform public.pvos_invite_workspace_member(t.org,t.second_email,'deputy_qppv');
  assert (select role='deputy_qppv' from public.pvos_memberships where organization_id=t.org and user_id=t.second_user),'Reviewer invitation role rejected';
  insert into public.pvos_literature_runs(id,organization_id,period_start,period_end,status) values(t.run,t.org,current_date,current_date,'review');
  insert into public.pvos_literature_items(id,organization_id,run_id,title,review_status) values(t.item,t.org,t.run,'Test needs review','needs_review'),(t.irrelevant,t.org,t.run,'Test routine exclusion','not_relevant');
  assert (select reviewer_user_id=t.first_user and reviewed_at is not null from public.pvos_literature_items where id=t.item),'First identity/time not stamped';
  begin
    perform public.pvos_assign_literature_second_review(t.run,t.first_user);
    raise exception 'TEST FAIL: self review allowed';
  exception when others then if sqlerrm not like '%independent%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',t.second_user::text,true);
  begin
    perform public.pvos_invite_workspace_member(t.org,'uninvited@example.invalid','admin');
    raise exception 'TEST FAIL: non-manager invited member';
  exception when others then if sqlerrm not like '%Not authorized%' then raise; end if; end;
  begin
    perform public.pvos_assign_literature_second_review(t.run,t.first_user);
    raise exception 'TEST FAIL: first reviewer selected by other sender';
  exception when others then if sqlerrm not like '%independent%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',t.first_user::text,true);
  perform public.pvos_assign_literature_second_review(t.run,t.second_user);
  select to_jsonb(r) into sr from public.pvos_literature_second_reviews r where run_id=t.run;
  assert (sr->'metadata'->>'scope_version')='v3','Wrong scope version';
  assert jsonb_array_length(sr->'metadata'->'scope_snapshot')=1,'Routine exclusions entered second-review scope';
  assert (sr->'metadata'->'summary'->>'needs_review')::integer=1,'Needs review not included';
  begin
    update public.pvos_literature_items set review_status='relevant' where id=t.item;
    raise exception 'TEST FAIL: pending decision changed';
  exception when others then if sqlerrm not like '%locked%' then raise; end if; end;
  begin
    perform public.pvos_mark_literature_relevant(t.run,array[t.irrelevant]);
    raise exception 'TEST FAIL: bulk RPC bypassed lock';
  exception when others then if sqlerrm not like '%locked%' then raise; end if; end;
  begin
    update public.pvos_literature_runs set status='complete' where id=t.run;
    raise exception 'TEST FAIL: direct completion bypassed approval';
  exception when others then if sqlerrm not like '%dual-review%' then raise; end if; end;
  begin
    perform public.pvos_complete_literature_screening(t.run);
    raise exception 'TEST FAIL: pending run completed';
  exception when others then if sqlerrm not like '%must be approved%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',t.outsider::text,true);
  begin
    perform public.pvos_decide_literature_second_review(t.run,'approved',null);
    raise exception 'TEST FAIL: outsider approved';
  exception when others then if sqlerrm not like '%Not authorized%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',t.second_user::text,true);
  begin
    perform public.pvos_decide_literature_second_review(t.run,'approved',null);
    raise exception 'TEST FAIL: unresolved needs review approved';
  exception when others then if sqlerrm not like '%still open%' then raise; end if; end;
  begin
    perform public.pvos_decide_literature_second_review(t.run,'returned',' ');
    raise exception 'TEST FAIL: return without reason';
  exception when others then if sqlerrm not like '%return note is required%' then raise; end if; end;
  perform public.pvos_decide_literature_second_review(t.run,'returned','Resolve product-linked evidence');
  perform set_config('request.jwt.claim.sub',t.first_user::text,true);
  update public.pvos_literature_items set review_status='relevant',decision_note='Confirmed for PSUR' where id=t.item;
  insert into public.pvos_literature_followups(organization_id,literature_item_id,destination,created_by) values(t.org,t.item,'psur_evidence',t.first_user);
  perform public.pvos_assign_literature_second_review(t.run,t.second_user);
  begin
    insert into public.pvos_literature_followups(organization_id,literature_item_id,destination,created_by) values(t.org,t.item,'signal_review',t.first_user);
    raise exception 'TEST FAIL: downstream selection changed after assignment';
  exception when others then if sqlerrm not like '%locked%' then raise; end if; end;
  update public.pvos_literature_items set full_text='Full text enrichment after assignment' where id=t.item;
  perform set_config('request.jwt.claim.sub',t.second_user::text,true);
  perform public.pvos_decide_literature_second_review(t.run,'approved','Verified focused decisions and PSUR selection');
  perform public.pvos_complete_literature_screening(t.run);
  select to_jsonb(e) into evidence from public.pvos_literature_screening_records e where run_id=t.run;
  assert (evidence->'metadata'->'second_review'->>'reviewed_by')=t.second_user::text,'Second identity missing';
  assert (evidence->'metadata'->'second_review'->>'reviewed_at') is not null,'Second time missing';
  assert jsonb_array_length(evidence->'decision_snapshot')=2,'Incomplete first-review evidence';
  assert (evidence->'metadata'->'second_review'->'metadata'->'history'->0->>'status')='returned','Return history missing';
  assert (evidence->'metadata'->'second_review'->'metadata'->'history'->0->'metadata'->'scope_snapshot'->0->>'review_status')='needs_review','Original first decision lost';
  assert (select status='complete' from public.pvos_literature_runs where id=t.run),'Atomic completion failed';
  begin
    update public.pvos_literature_screening_records set metrics='{}'::jsonb where run_id=t.run;
    raise exception 'TEST FAIL: completed evidence overwritten';
  exception when others then if sqlerrm not like '%immutable%' then raise; end if; end;
  begin
    update public.pvos_literature_items set review_status='not_relevant' where id=t.item;
    raise exception 'TEST FAIL: approved decision changed';
  exception when others then if sqlerrm not like '%locked%' then raise; end if; end;
end; $$;
select 'PASS: independent assignment, focused Needs review scope, server locks, return reason, correction/resubmission history, text enrichment, approval, atomic completion, immutable evidence' as verification;
rollback;
