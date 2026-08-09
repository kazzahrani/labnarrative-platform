create unique index if not exists production_runs_engine_v3_run_uidx
on public.production_runs ((source_pack->>'engine_v3_run_id'))
where source_pack ? 'engine_v3_run_id';

create or replace function public.engine_v3_ensure_outreach_draft(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','labnarrative_engine_v3'
as $$
declare
  v_uid uuid := auth.uid();
  v_run labnarrative_engine_v3.runs%rowtype;
  v_prospect public.prospects%rowtype;
  v_site public.sites%rowtype;
  v_compat public.production_runs%rowtype;
  v_message public.outreach_messages%rowtype;
  v_recipient text := '';
  v_family text := '';
  v_point text := '';
  v_url text := '';
  v_subject text := '';
  v_body text := '';
  v_html text := '';
  v_esc_family text := '';
  v_esc_point text := '';
  v_esc_url text := '';
begin
  if v_uid is null or not public.is_labnarrative_admin() then raise exception 'admin_access_required'; end if;
  select * into v_run from labnarrative_engine_v3.runs where id=p_run_id;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.site_id is null then raise exception 'site_missing'; end if;
  if v_run.state not in ('published','completed') then raise exception 'outreach_requires_published_run:%',v_run.state; end if;
  select * into v_prospect from public.prospects where id=v_run.prospect_id;
  if not found then raise exception 'prospect_missing'; end if;
  select * into v_site from public.sites where id=v_run.site_id;
  if not found then raise exception 'site_missing'; end if;

  select * into v_compat from public.production_runs where source_pack->>'engine_v3_run_id'=p_run_id::text limit 1;
  if not found then
    insert into public.production_runs(prospect_id,site_id,status,current_step,source_pack,generated_content,qa_results,cost_summary,started_at,review_ready_at,created_at,updated_at)
    values(v_run.prospect_id,v_run.site_id,'awaiting_final_review','email_draft',jsonb_build_object('engine','v3','engine_v3_run_id',p_run_id::text,'chatgpt_native',true),coalesce(v_site.content,'{}'::jsonb),jsonb_build_object('engine_v3_final_review',true,'renderer_contract_verified',true),jsonb_build_object('apiCostUsd',0,'generationSource','ChatGPT scheduled task'),coalesce(v_run.started_at,now()),now(),now(),now())
    returning * into v_compat;
  else
    update public.production_runs set site_id=v_run.site_id,status=case when status in ('completed','approved_to_send') then status else 'awaiting_final_review' end,current_step=case when status in ('completed','approved_to_send') then current_step else 'email_draft' end,generated_content=coalesce(v_site.content,'{}'::jsonb),updated_at=now()
    where id=v_compat.id returning * into v_compat;
  end if;

  select * into v_message from public.outreach_messages where production_run_id=v_compat.id;
  if found then
    return jsonb_build_object('runId',p_run_id,'productionRunId',v_compat.id,'messageId',v_message.id,'recipientEmail',v_message.recipient_email,'senderEmail',v_message.sender_email,'subject',v_message.subject,'bodyText',v_message.body_text,'status',v_message.status,'publicUrl',coalesce(nullif(v_site.domain_url,''),'https://'||v_site.slug||'.labnarrative.com'));
  end if;

  v_recipient := lower(trim(coalesce(v_prospect.email,'')));
  if not public.is_valid_contact_email(v_recipient) then v_recipient := lower(trim(coalesce(nullif(v_site.content->>'email',''),nullif(v_site.content#>>'{pages,contact,email}',''),''))); end if;
  if not public.is_valid_contact_email(v_recipient) then v_recipient := ''; end if;
  v_family := public.labnarrative_family_name(v_prospect.pi_name);
  if trim(coalesce(v_family,''))='' then v_family := regexp_replace(trim(v_prospect.pi_name),'^.*\s+',''); end if;
  v_point := trim(coalesce(nullif(v_site.content#>>'{focusAreas,0}',''),nullif(v_site.content#>>'{research,0,title}',''),nullif(v_site.content#>>'{projects,0,title}',''),'your laboratory research'));
  v_point := regexp_replace(v_point,'(?i)^the\s+','','');
  v_point := regexp_replace(v_point,'[.?!]+$','','g');
  v_url := coalesce(nullif(v_site.domain_url,''),'https://'||v_site.slug||'.labnarrative.com');
  v_subject := format('Website concept for the %s Laboratory',v_family);
  v_body := format($fmt$Dear Professor %1$s,

My name is Dr Khaled Azzahrani. I am a molecular oncology researcher, and I completed my doctoral work in Professor Kurt Engeland’s group, where I studied p53, RB/E2F signalling, and cell-cycle transcription.

I have followed your research on the %2$s for years, although unfortunately we have never had the opportunity to connect. Given the significance and breadth of your work, I felt that it could benefit from a dedicated website presenting the laboratory’s research, publications, and scientific direction in one place.

I am currently developing LabNarrative, a specialized service that creates professional, scientifically accurate websites for research laboratories. I prepared a personalized website concept for your group using publicly available information about your research and publications:

View the %1$s Laboratory concept:
%3$s

The concept includes dedicated pages for your research programmes, publications, laboratory members, opportunities, and contact information. Every aspect—including the text, images, projects, publications, and team profiles—can be revised or expanded.

This is an independently prepared concept and does not imply any affiliation. If you find the direction useful, I would be pleased to customize it with your current team members, photographs, ongoing projects, and preferred content, and then prepare the completed website for publication on a domain of your choice.

Would you be open to a brief conversation about it?

Kind regards,
Dr Khaled Azzahrani
Founder, LabNarrative
https://labnarrative.com$fmt$,v_family,v_point,v_url);
  v_esc_family := replace(replace(replace(v_family,'&','&amp;'),'<','&lt;'),'>','&gt;');
  v_esc_point := replace(replace(replace(v_point,'&','&amp;'),'<','&lt;'),'>','&gt;');
  v_esc_url := replace(replace(replace(replace(v_url,'&','&amp;'),'"','&quot;'),'<','&lt;'),'>','&gt;');
  v_html := format('<p>Dear Professor %1$s,</p><p>My name is Dr Khaled Azzahrani. I am a molecular oncology researcher, and I completed my doctoral work in Professor Kurt Engeland’s group, where I studied p53, RB/E2F signalling, and cell-cycle transcription.</p><p>I have followed your research on the %2$s for years, although unfortunately we have never had the opportunity to connect. Given the significance and breadth of your work, I felt that it could benefit from a dedicated website presenting the laboratory’s research, publications, and scientific direction in one place.</p><p>I am currently developing LabNarrative, a specialized service that creates professional, scientifically accurate websites for research laboratories. I prepared a personalized website concept for your group using publicly available information about your research and publications:</p><p><strong><a href="%3$s">View the %1$s Laboratory concept</a></strong></p><p>The concept includes dedicated pages for your research programmes, publications, laboratory members, opportunities, and contact information. Every aspect—including the text, images, projects, publications, and team profiles—can be revised or expanded.</p><p>This is an independently prepared concept and does not imply any affiliation. If you find the direction useful, I would be pleased to customize it with your current team members, photographs, ongoing projects, and preferred content, and then prepare the completed website for publication on a domain of your choice.</p><p>Would you be open to a brief conversation about it?</p><p>Kind regards,<br>Dr Khaled Azzahrani<br>Founder, LabNarrative<br><a href="https://labnarrative.com">https://labnarrative.com</a></p>',v_esc_family,v_esc_point,v_esc_url);
  insert into public.outreach_messages(prospect_id,production_run_id,site_id,recipient_email,sender_email,subject,body_text,body_html,status,message_kind,is_test,delivery_status,reply_to_email,delivery_details)
  values(v_run.prospect_id,v_compat.id,v_run.site_id,v_recipient,'LabNarrative <khaled@labnarrative.com>',v_subject,v_body,v_html,'draft','initial',false,'pending','khaled@labnarrative.com',jsonb_build_object('engine','v3','engine_v3_run_id',p_run_id::text,'draft_source','human_approved_publish')) returning * into v_message;
  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload) values(p_run_id,'outreach_draft_prepared','Editable outreach draft prepared after human-approved publication. No email was sent.',jsonb_build_object('productionRunId',v_compat.id,'messageId',v_message.id,'recipientMissing',v_recipient=''));
  return jsonb_build_object('runId',p_run_id,'productionRunId',v_compat.id,'messageId',v_message.id,'recipientEmail',v_message.recipient_email,'senderEmail',v_message.sender_email,'subject',v_message.subject,'bodyText',v_message.body_text,'status',v_message.status,'publicUrl',v_url);
end;
$$;

create or replace function public.engine_v3_admin_approve_publish(p_run_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','labnarrative_engine_v3' as $$
declare v_uid uuid:=auth.uid(); v_run labnarrative_engine_v3.runs%rowtype; v_site public.sites%rowtype; v_url text; v_outreach jsonb;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select * into v_run from labnarrative_engine_v3.runs where id=p_run_id for update; if not found then raise exception 'run_not_found'; end if;
  if v_run.state<>'final_review' then raise exception 'run_not_in_final_review:%',v_run.state; end if; if v_run.site_id is null then raise exception 'site_missing'; end if;
  select * into v_site from public.sites where id=v_run.site_id for update; if not found then raise exception 'site_missing'; end if; if v_site.status not in ('draft','concept') then raise exception 'site_not_publishable:%',v_site.status; end if;
  v_url := 'https://' || v_site.slug || '.labnarrative.com';
  insert into labnarrative_engine_v3.review(run_id,decision,note,actor_user_id,decided_at,updated_at) values(p_run_id,'approved',p_note,v_uid,now(),now()) on conflict(run_id) do update set decision='approved',note=excluded.note,actor_user_id=v_uid,decided_at=now(),updated_at=now();
  update public.sites set status='concept',domain_status='live',domain_url=v_url,domain_error=null,domain_connected_at=coalesce(domain_connected_at,now()),domain_checked_at=now(),updated_at=now() where id=v_run.site_id;
  update labnarrative_engine_v3.runs set state='published',finished_at=now(),updated_at=now(),summary=summary||jsonb_build_object('publishedAt',now(),'publicUrl',v_url) where id=p_run_id;
  update public.prospects set status='approved_to_send',site_id=v_run.site_id,updated_at=now() where id=v_run.prospect_id;
  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload) values(p_run_id,'published','Human-approved Engine v3 concept published. Outreach was not sent.',jsonb_build_object('siteId',v_run.site_id,'publicUrl',v_url,'actorUserId',v_uid));
  v_outreach := public.engine_v3_ensure_outreach_draft(p_run_id);
  return jsonb_build_object('ok',true,'runId',p_run_id,'state','published','siteId',v_run.site_id,'publicUrl',v_url,'outreachSent',false,'outreachDraft',v_outreach);
end; $$;

create or replace function public.engine_v3_admin_block(p_run_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','labnarrative_engine_v3' as $$
declare v_uid uuid:=auth.uid(); v_run labnarrative_engine_v3.runs%rowtype; v_reason text:=trim(coalesce(p_reason,''));
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if; if v_reason='' then raise exception 'block_reason_required'; end if;
  select * into v_run from labnarrative_engine_v3.runs where id=p_run_id for update; if not found then raise exception 'run_not_found'; end if; if v_run.state<>'final_review' then raise exception 'run_not_in_final_review:%',v_run.state; end if;
  insert into labnarrative_engine_v3.review(run_id,decision,note,actor_user_id,decided_at,updated_at) values(p_run_id,'rejected',v_reason,v_uid,now(),now()) on conflict(run_id) do update set decision='rejected',note=v_reason,actor_user_id=v_uid,decided_at=now(),updated_at=now();
  update labnarrative_engine_v3.runs set state='blocked',blocked_reason=v_reason,finished_at=now(),updated_at=now() where id=p_run_id;
  update public.prospects set status='held',updated_at=now() where id=v_run.prospect_id;
  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload) values(p_run_id,'blocked_by_review','Concept blocked during human Final Review.',jsonb_build_object('reason',v_reason,'actorUserId',v_uid));
  return jsonb_build_object('ok',true,'runId',p_run_id,'state','blocked','reason',v_reason);
end; $$;

create or replace function public.engine_v3_admin_outreach_get(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','labnarrative_engine_v3' as $$ begin return public.engine_v3_ensure_outreach_draft(p_run_id); end; $$;

create or replace function public.engine_v3_admin_outreach_save(p_run_id uuid, p_recipient_email text, p_subject text, p_body_text text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','labnarrative_engine_v3' as $$
declare v_uid uuid:=auth.uid(); v_data jsonb; v_prod uuid; v_message public.outreach_messages%rowtype; v_email text:=lower(trim(coalesce(p_recipient_email,'')));
begin
  if v_uid is null or not public.is_labnarrative_admin() then raise exception 'admin_access_required'; end if; if trim(coalesce(p_subject,''))='' then raise exception 'subject_required'; end if; if trim(coalesce(p_body_text,''))='' then raise exception 'body_required'; end if; if v_email<>'' and not public.is_valid_contact_email(v_email) then raise exception 'valid_recipient_email_required'; end if;
  v_data:=public.engine_v3_ensure_outreach_draft(p_run_id); v_prod:=(v_data->>'productionRunId')::uuid;
  select * into v_message from public.outreach_messages where production_run_id=v_prod for update; if not found then raise exception 'outreach_draft_missing'; end if; if v_message.status<>'draft' then raise exception 'outreach_not_editable:%',v_message.status; end if;
  update public.outreach_messages set recipient_email=v_email,subject=trim(p_subject),body_text=p_body_text,body_html='',sender_email='LabNarrative <khaled@labnarrative.com>',reply_to_email='khaled@labnarrative.com',error_message='',updated_at=now() where id=v_message.id returning * into v_message;
  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload) values(p_run_id,'outreach_draft_saved','Outreach draft edited and saved by the administrator. No email was sent.',jsonb_build_object('messageId',v_message.id,'recipientMissing',v_email=''));
  return jsonb_build_object('ok',true,'runId',p_run_id,'productionRunId',v_prod,'messageId',v_message.id,'recipientEmail',v_message.recipient_email,'senderEmail',v_message.sender_email,'subject',v_message.subject,'bodyText',v_message.body_text,'status',v_message.status);
end; $$;

grant execute on function public.engine_v3_ensure_outreach_draft(uuid) to authenticated;
grant execute on function public.engine_v3_admin_approve_publish(uuid,text) to authenticated;
grant execute on function public.engine_v3_admin_block(uuid,text) to authenticated;
grant execute on function public.engine_v3_admin_outreach_get(uuid) to authenticated;
grant execute on function public.engine_v3_admin_outreach_save(uuid,text,text,text) to authenticated;
