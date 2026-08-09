-- Present automated LabNarrative outreach as a personal scientist-to-scientist email.
-- The mailbox address remains khaled@labnarrative.com; only the display name changes.

create or replace function public.prepare_labnarrative_outreach_draft()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  c jsonb;
  pi_name text;
  clean_name text;
  family_name text;
  research_title text;
  focus_area text;
  observation text;
  live_url text;
  link_label text;
  esc_family text;
  esc_observation text;
  esc_url text;
begin
  if new.status is distinct from 'draft' then return new; end if;

  select s.content,
         coalesce(nullif(s.domain_url, ''), 'https://' || s.slug || '.labnarrative.com')
    into c, live_url
  from public.sites s
  where s.id = new.site_id;

  if c is null then return new; end if;

  pi_name := coalesce(nullif(c->>'piName', ''), '');
  clean_name := regexp_replace(pi_name,'(?i)(\s*,?\s*(ph\.?d\.?|dphil|m\.?d\.?|md|dds|dvm|mph|m\.?sc\.?|msc|ms|mba|frs))+$','','g');
  clean_name := regexp_replace(clean_name, '(?i)^\s*(professor|prof\.?|doctor|dr\.?)\s+', '', 'g');
  clean_name := trim(regexp_replace(clean_name, '[,.;]+$', '', 'g'));
  family_name := regexp_replace(clean_name, '^.*\s+', '');
  family_name := trim(regexp_replace(family_name, '[,.;]+$', '', 'g'));
  if family_name = '' then family_name := 'Professor'; end if;

  research_title := nullif(c #>> '{research,0,title}', '');
  focus_area := nullif(c #>> '{focusAreas,0}', '');
  observation := coalesce(research_title, focus_area, 'your laboratory’s research programme');
  observation := trim(regexp_replace(observation, '[.?!]+$', '', 'g'));
  if length(observation) > 1 and left(observation, 2) <> upper(left(observation, 2)) then
    observation := lower(left(observation, 1)) || substr(observation, 2);
  end if;

  link_label := format('View the %s Laboratory concept', family_name);
  new.sender_email := 'Khaled Azzahrani <khaled@labnarrative.com>';
  new.subject := format('Website concept for the %s Laboratory', family_name);
  new.body_text := format($fmt$Dear Professor %1$s,

My name is Dr Khaled Azzahrani. I am a molecular oncology researcher, and I completed my doctoral work in Professor Kurt Engeland’s group, where I studied p53, RB/E2F signalling, and cell-cycle transcription.

I have followed your research on the %2$s for years, although unfortunately we have never had the opportunity to connect. Given the significance and breadth of your work, I felt that it could benefit from a dedicated website presenting the laboratory’s research, publications, and scientific direction in one place.

I am currently developing LabNarrative, a specialized service that creates professional, scientifically accurate websites for research laboratories. I prepared a personalized website concept for your group using publicly available information about your research and publications:

%3$s:
%4$s

The concept includes dedicated pages for your research programmes, publications, laboratory members, opportunities, and contact information. Every aspect—including the text, images, projects, publications, and team profiles—can be revised or expanded.

This is an independently prepared concept and does not imply any affiliation. If you find the direction useful, I would be pleased to customize it with your current team members, photographs, ongoing projects, and preferred content, and then prepare the completed website for publication on a domain of your choice.

Would you be open to a brief conversation about it?

Kind regards,
Dr Khaled Azzahrani
Founder, LabNarrative
https://labnarrative.com$fmt$,family_name,observation,link_label,live_url);

  esc_family := replace(replace(replace(family_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  esc_observation := replace(replace(replace(observation, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  esc_url := replace(replace(replace(replace(live_url, '&', '&amp;'), '"', '&quot;'), '<', '&lt;'), '>', '&gt;');

  new.body_html := format('<p>Dear Professor %1$s,</p><p>My name is Dr Khaled Azzahrani. I am a molecular oncology researcher, and I completed my doctoral work in Professor Kurt Engeland’s group, where I studied p53, RB/E2F signalling, and cell-cycle transcription.</p><p>I have followed your research on the %2$s for years, although unfortunately we have never had the opportunity to connect. Given the significance and breadth of your work, I felt that it could benefit from a dedicated website presenting the laboratory’s research, publications, and scientific direction in one place.</p><p>I am currently developing LabNarrative, a specialized service that creates professional, scientifically accurate websites for research laboratories. I prepared a personalized website concept for your group using publicly available information about your research and publications:</p><p><strong><a href="%3$s">View the %1$s Laboratory concept</a></strong></p><p>The concept includes dedicated pages for your research programmes, publications, laboratory members, opportunities, and contact information. Every aspect—including the text, images, projects, publications, and team profiles—can be revised or expanded.</p><p>This is an independently prepared concept and does not imply any affiliation. If you find the direction useful, I would be pleased to customize it with your current team members, photographs, ongoing projects, and preferred content, and then prepare the completed website for publication on a domain of your choice.</p><p>Would you be open to a brief conversation about it?</p><p>Kind regards,<br>Dr Khaled Azzahrani<br>Founder, LabNarrative<br><a href="https://labnarrative.com">https://labnarrative.com</a></p>',esc_family,esc_observation,esc_url);

  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.claim_due_outreach_followup()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  parent record;
  next_kind text;
  next_sequence integer;
  new_run_id uuid;
  new_message_id uuid;
  rendered jsonb;
  reply_address text;
  sender_address text := 'Khaled Azzahrani <khaled@labnarrative.com>';
begin
  select om.id,om.prospect_id,om.production_run_id,om.site_id,om.recipient_email,om.sender_email,om.message_kind,om.subject,
         om.provider_message_id,om.internet_message_id,om.reply_to_email,
         pr.media_pack,pr.generated_content,pr.qa_results,pr.cost_summary
    into parent
  from public.outreach_messages om
  join public.production_runs pr on pr.id=om.production_run_id
  join public.prospects p on p.id=om.prospect_id
  where om.status='sent' and om.is_test=false and om.message_kind in ('initial','followup_1')
    and om.follow_up_at is not null and om.follow_up_at<=now()
    and coalesce(om.delivery_status,'') not in ('bounced','complained','failed','suppressed')
    and p.status not in ('replied','interested','rejected','paused')
    and not exists (
      select 1 from public.outreach_messages later
      where later.prospect_id=om.prospect_id
        and later.message_kind=case when om.message_kind='initial' then 'followup_1' else 'followup_2' end
    )
  order by om.follow_up_at asc limit 1 for update of om skip locked;

  if not found then return null; end if;

  next_kind := case when parent.message_kind='initial' then 'followup_1' else 'followup_2' end;
  next_sequence := case when next_kind='followup_1' then 2 else 3 end;
  reply_address := coalesce(nullif(parent.reply_to_email,''), public.labnarrative_reply_address(parent.prospect_id));

  insert into public.production_runs(
    prospect_id,site_id,status,current_step,source_pack,media_pack,generated_content,qa_results,cost_summary,
    started_at,last_heartbeat_at,operator_send_locked
  ) values (
    parent.prospect_id,parent.site_id,'running','send',
    jsonb_build_object('message_kind',next_kind,'followup_sequence',next_sequence,'parent_message_id',parent.id,'auto_sequence',true,'approval_required',false,'automatic_send',true,'scheduled_at',now()),
    coalesce(parent.media_pack,'{}'::jsonb),coalesce(parent.generated_content,'{}'::jsonb),coalesce(parent.qa_results,'{}'::jsonb),coalesce(parent.cost_summary,'{}'::jsonb),
    null,now(),false
  ) returning id into new_run_id;

  rendered := public.render_outreach_sequence_message(new_run_id,next_kind);

  insert into public.outreach_messages(
    prospect_id,production_run_id,site_id,recipient_email,sender_email,subject,body_text,body_html,status,message_kind,is_test,delivery_status,delivery_details,
    reply_to_email,in_reply_to,references_header
  ) values (
    parent.prospect_id,new_run_id,parent.site_id,parent.recipient_email,sender_address,
    rendered->>'subject',rendered->>'bodyText',rendered->>'bodyHtml','sending',next_kind,false,'pending',
    jsonb_build_object('auto_sequence',true,'approval_required',false,'automatic_send',true,'sequence_template_version',rendered->>'templateVersion','parent_message_id',parent.id,'personalization_x',rendered->>'topicX','personalization_y',rendered->>'contextY','concept_url',rendered->>'conceptUrl'),
    reply_address,coalesce(parent.internet_message_id,''),coalesce(parent.internet_message_id,'')
  ) returning id into new_message_id;

  insert into public.pipeline_events(prospect_id,production_run_id,event_type,step,message,payload)
  values(parent.prospect_id,new_run_id,
    case when next_kind='followup_1' then 'followup_1_automatic_send_started' else 'followup_2_automatic_send_started' end,
    'send',
    case when next_kind='followup_1' then 'Follow-up 1 became due and automatic sending started.' else 'The final follow-up email became due and automatic sending started.' end,
    jsonb_build_object('messageKind',next_kind,'approvalRequired',false,'automaticSend',true,'scheduledAt',now()));

  return jsonb_build_object(
    'runId',new_run_id,'messageId',new_message_id,'prospectId',parent.prospect_id,'siteId',parent.site_id,
    'messageKind',next_kind,'sequence',next_sequence,'recipientEmail',parent.recipient_email,'senderEmail',sender_address,
    'subject',rendered->>'subject','bodyText',rendered->>'bodyText','bodyHtml',rendered->>'bodyHtml',
    'conceptUrl',rendered->>'conceptUrl','replyToEmail',reply_address,
    'parentProviderMessageId',coalesce(parent.provider_message_id,''),'parentInternetMessageId',coalesce(parent.internet_message_id,''),
    'approvalRequired',false,'automaticSend',true
  );
end;
$function$;

create or replace function public.claim_due_outreach_followup_for_prospect(p_prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  parent record;
  next_kind text;
  next_sequence integer;
  new_run_id uuid;
  new_message_id uuid;
  rendered jsonb;
  reply_address text;
  sender_address text := 'Khaled Azzahrani <khaled@labnarrative.com>';
begin
  select om.id,om.prospect_id,om.production_run_id,om.site_id,om.recipient_email,om.sender_email,om.message_kind,om.subject,
         om.provider_message_id,om.internet_message_id,om.reply_to_email,
         pr.media_pack,pr.generated_content,pr.qa_results,pr.cost_summary
    into parent
  from public.outreach_messages om
  join public.production_runs pr on pr.id=om.production_run_id
  join public.prospects p on p.id=om.prospect_id
  where om.prospect_id=p_prospect_id and om.status='sent' and om.is_test=false
    and om.message_kind in ('initial','followup_1') and om.follow_up_at is not null and om.follow_up_at<=now()
    and coalesce(om.delivery_status,'') not in ('bounced','complained','failed','suppressed')
    and p.status not in ('replied','interested','rejected','paused')
    and not exists (
      select 1 from public.outreach_messages later
      where later.prospect_id=om.prospect_id
        and later.message_kind=case when om.message_kind='initial' then 'followup_1' else 'followup_2' end
    )
  order by om.follow_up_at asc limit 1 for update of om skip locked;

  if not found then return null; end if;

  next_kind := case when parent.message_kind='initial' then 'followup_1' else 'followup_2' end;
  next_sequence := case when next_kind='followup_1' then 2 else 3 end;
  reply_address := coalesce(nullif(parent.reply_to_email,''), public.labnarrative_reply_address(parent.prospect_id));

  insert into public.production_runs(
    prospect_id,site_id,status,current_step,source_pack,media_pack,generated_content,qa_results,cost_summary,
    started_at,last_heartbeat_at,operator_send_locked
  ) values (
    parent.prospect_id,parent.site_id,'running','send',
    jsonb_build_object('message_kind',next_kind,'followup_sequence',next_sequence,'parent_message_id',parent.id,'auto_sequence',true,'approval_required',false,'automatic_send',true,'scheduled_at',now()),
    coalesce(parent.media_pack,'{}'::jsonb),coalesce(parent.generated_content,'{}'::jsonb),coalesce(parent.qa_results,'{}'::jsonb),coalesce(parent.cost_summary,'{}'::jsonb),
    null,now(),false
  ) returning id into new_run_id;

  rendered := public.render_outreach_sequence_message(new_run_id,next_kind);

  insert into public.outreach_messages(
    prospect_id,production_run_id,site_id,recipient_email,sender_email,subject,body_text,body_html,status,message_kind,is_test,delivery_status,delivery_details,
    reply_to_email,in_reply_to,references_header
  ) values (
    parent.prospect_id,new_run_id,parent.site_id,parent.recipient_email,sender_address,
    rendered->>'subject',rendered->>'bodyText',rendered->>'bodyHtml','sending',next_kind,false,'pending',
    jsonb_build_object('auto_sequence',true,'approval_required',false,'automatic_send',true,'sequence_template_version',rendered->>'templateVersion','parent_message_id',parent.id,'personalization_x',rendered->>'topicX','personalization_y',rendered->>'contextY','concept_url',rendered->>'conceptUrl'),
    reply_address,coalesce(parent.internet_message_id,''),coalesce(parent.internet_message_id,'')
  ) returning id into new_message_id;

  insert into public.pipeline_events(prospect_id,production_run_id,event_type,step,message,payload)
  values(parent.prospect_id,new_run_id,
    case when next_kind='followup_1' then 'followup_1_automatic_send_started' else 'followup_2_automatic_send_started' end,
    'send',
    case when next_kind='followup_1' then 'Follow-up 1 became due and automatic sending started.' else 'The final follow-up email became due and automatic sending started.' end,
    jsonb_build_object('messageKind',next_kind,'approvalRequired',false,'automaticSend',true,'scheduledAt',now()));

  return jsonb_build_object(
    'runId',new_run_id,'messageId',new_message_id,'prospectId',parent.prospect_id,'siteId',parent.site_id,
    'messageKind',next_kind,'sequence',next_sequence,'recipientEmail',parent.recipient_email,'senderEmail',sender_address,
    'subject',rendered->>'subject','bodyText',rendered->>'bodyText','bodyHtml',rendered->>'bodyHtml',
    'conceptUrl',rendered->>'conceptUrl','replyToEmail',reply_address,
    'parentProviderMessageId',coalesce(parent.provider_message_id,''),'parentInternetMessageId',coalesce(parent.internet_message_id,''),
    'approvalRequired',false,'automaticSend',true
  );
end;
$function$;

create or replace function labnarrative_engine.ensure_outreach_draft(p_run_id uuid)
returns labnarrative_engine.outreach_drafts
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'labnarrative_engine'
as $function$
declare
  v_run labnarrative_engine.runs%rowtype;
  v_p public.prospects%rowtype;
  v_s public.sites%rowtype;
  v_existing labnarrative_engine.outreach_drafts%rowtype;
  v_site_id uuid;
  v_surname text;
  v_title text;
  v_focus text;
  v_subject text;
  v_body text;
  v_url text;
  v_recipient text;
begin
  select * into v_existing from labnarrative_engine.outreach_drafts d where d.run_id=p_run_id;
  if found then return v_existing; end if;

  select * into v_run from labnarrative_engine.runs r where r.id=p_run_id;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.state <> 'published' then raise exception 'outreach_requires_published_run'; end if;

  select * into v_p from public.prospects p where p.id=v_run.prospect_id;
  if not found then raise exception 'prospect_not_found'; end if;

  begin v_site_id := nullif(v_run.stage_data->>'site_id','')::uuid;
  exception when others then raise exception 'published_run_has_invalid_site_id'; end;
  if v_site_id is null then raise exception 'published_run_has_no_site'; end if;

  select * into v_s from public.sites s where s.id=v_site_id;
  if not found then raise exception 'published_site_not_found'; end if;

  v_surname := public.labnarrative_family_name(v_p.pi_name);
  v_title := public.labnarrative_salutation_title(v_p.pi_name, coalesce(v_s.content,'{}'::jsonb));
  v_focus := public.labnarrative_outreach_topic(coalesce(v_s.content,'{}'::jsonb), '{}'::jsonb, v_p.research_area);
  v_subject := 'Website concept for the ' || v_surname || ' Laboratory';
  v_url := coalesce(nullif(v_s.domain_url,''), 'https://' || v_s.slug || '.labnarrative.com');

  v_recipient := lower(trim(coalesce(
    nullif(v_p.email,''), nullif(v_s.content->>'email',''), nullif(v_s.content#>>'{pages,contact,email}',''), ''
  )));
  if v_recipient <> '' and not public.is_valid_contact_email(v_recipient) then v_recipient := ''; end if;

  v_body := format($fmt$Dear %1$s %2$s,

I came across your work on %3$s.

I thought your research could translate particularly well into a modern lab website, so I put together a private concept for your group:

View the %2$s Laboratory concept:
%4$s

I hope you enjoy seeing it. If the direction interests you, I'd be happy to adapt it properly around your laboratory and research priorities.

Best wishes,
Khaled$fmt$, v_title, v_surname, v_focus, v_url);

  insert into labnarrative_engine.outreach_drafts(
    run_id, prospect_id, site_id, recipient_email, sender_email, subject, body_text
  ) values (
    p_run_id, v_p.id, v_s.id, v_recipient,
    'Khaled Azzahrani <khaled@labnarrative.com>', v_subject, v_body
  ) returning * into v_existing;

  return v_existing;
end;
$function$;

update public.outreach_messages
set sender_email='Khaled Azzahrani <khaled@labnarrative.com>'
where is_test=false and status in ('draft','approved','sending');

update labnarrative_engine.outreach_drafts
set sender_email='Khaled Azzahrani <khaled@labnarrative.com>'
where status not in ('sent','cancelled');
