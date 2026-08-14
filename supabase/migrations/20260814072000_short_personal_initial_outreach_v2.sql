create or replace function public.labnarrative_initial_outreach_message(
  p_family_name text,
  p_topic text,
  p_url text,
  p_current_website text default ''
)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_family text := coalesce(nullif(trim(p_family_name),''),'Professor');
  v_topic text := coalesce(nullif(trim(p_topic),''),'your research');
  v_url text := coalesce(nullif(trim(p_url),''),'https://labnarrative.com');
  v_subject text;
  v_research_line text;
  v_body text;
  v_html text;
  e_family text;
  e_topic text;
  e_url text;
begin
  v_subject := format('A website concept for the %s Laboratory', v_family);

  if nullif(trim(coalesce(p_current_website,'')),'') is not null then
    v_research_line := format(
      'I have been reading your work on %s, and although your laboratory already has an online presence, I thought its science could be presented particularly well through a more focused research website.',
      v_topic
    );
  else
    v_research_line := format(
      'I have been reading your work on %s, and I thought your laboratory’s science could be presented particularly well through a dedicated research website.',
      v_topic
    );
  end if;

  v_body := format($fmt$Dear Professor %1$s,

My name is Dr Khaled Azzahrani. I am a molecular oncology researcher and completed my doctoral work in Professor Kurt Engeland’s group, studying p53, RB/E2F signalling and cell-cycle transcription.

%2$s

I recently founded LabNarrative, and I prepared a website concept for your group using your published research:

%3$s

I thought you might enjoy seeing how I presented the laboratory and its scientific work.

I would genuinely be interested to hear what you think of the direction.

Best wishes,
Dr Khaled Azzahrani
Founder, LabNarrative
labnarrative.com$fmt$, v_family, v_research_line, v_url);

  e_family := replace(replace(replace(v_family,'&','&amp;'),'<','&lt;'),'>','&gt;');
  e_topic := replace(replace(replace(v_topic,'&','&amp;'),'<','&lt;'),'>','&gt;');
  e_url := replace(replace(replace(replace(v_url,'&','&amp;'),'"','&quot;'),'<','&lt;'),'>','&gt;');

  if nullif(trim(coalesce(p_current_website,'')),'') is not null then
    v_research_line := format(
      'I have been reading your work on %s, and although your laboratory already has an online presence, I thought its science could be presented particularly well through a more focused research website.',
      e_topic
    );
  else
    v_research_line := format(
      'I have been reading your work on %s, and I thought your laboratory’s science could be presented particularly well through a dedicated research website.',
      e_topic
    );
  end if;

  v_html := format(
    '<p>Dear Professor %1$s,</p><p>My name is Dr Khaled Azzahrani. I am a molecular oncology researcher and completed my doctoral work in Professor Kurt Engeland’s group, studying p53, RB/E2F signalling and cell-cycle transcription.</p><p>%2$s</p><p>I recently founded LabNarrative, and I prepared a website concept for your group using your published research:</p><p><strong><a href="%3$s">%3$s</a></strong></p><p>I thought you might enjoy seeing how I presented the laboratory and its scientific work.</p><p>I would genuinely be interested to hear what you think of the direction.</p><p>Best wishes,<br>Dr Khaled Azzahrani<br>Founder, LabNarrative<br><a href="https://labnarrative.com">labnarrative.com</a></p>',
    e_family, v_research_line, e_url
  );

  return jsonb_build_object(
    'subject',v_subject,
    'bodyText',v_body,
    'bodyHtml',v_html,
    'templateVersion','short_personal_initial_v2'
  );
end;
$function$;

create or replace function public.render_outreach_sequence_message(p_run_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare
  p public.prospects%rowtype;
  pr public.production_runs%rowtype;
  s public.sites%rowtype;
  family_name text;
  salutation_title text;
  topic_x text;
  context_y text;
  live_url text;
  subject_value text;
  body_text_value text;
  body_html_value text;
  efamily text;
  etitle text;
  ex text;
  eurl text;
  initial_render jsonb;
begin
  select * into pr from public.production_runs where id=p_run_id;
  if not found then raise exception 'The production run was not found.' using errcode='P0002'; end if;
  select * into p from public.prospects where id=pr.prospect_id;
  if not found then raise exception 'The prospect was not found.' using errcode='P0002'; end if;
  if pr.site_id is not null then select * into s from public.sites where id=pr.site_id; end if;

  family_name := public.labnarrative_family_name(p.pi_name);
  salutation_title := public.labnarrative_salutation_title(p.pi_name, coalesce(s.content,'{}'::jsonb));
  topic_x := public.labnarrative_outreach_topic(coalesce(s.content,'{}'::jsonb), coalesce(pr.generated_content,'{}'::jsonb), p.research_area);
  context_y := coalesce(nullif(trim(p.research_area),''), topic_x);

  live_url := coalesce(
    nullif(trim(s.domain_url),''),
    case when nullif(trim(s.slug),'') is not null then 'https://'||trim(s.slug)||'.labnarrative.com' end,
    case when nullif(trim(p.slug),'') is not null then 'https://'||trim(p.slug)||'.labnarrative.com' end,
    case when nullif(trim(pr.generated_content->>'slug'),'') is not null then 'https://'||trim(pr.generated_content->>'slug')||'.labnarrative.com' end,
    'https://labnarrative.com'
  );

  if p_kind='initial' then
    initial_render := public.labnarrative_initial_outreach_message(family_name,topic_x,live_url,p.current_website);
    subject_value := initial_render->>'subject';
    body_text_value := initial_render->>'bodyText';
    body_html_value := initial_render->>'bodyHtml';
  elsif p_kind='followup_1' then
    subject_value := format('Re: Website concept for the %s Laboratory',family_name);
    body_text_value := format($fmt$Dear %1$s %2$s,

I just wanted to follow up on the lab website concept I sent earlier.

I particularly enjoyed translating your work on %3$s into the research section, and I'd be very interested to hear what you think of the direction.

Here's the concept again:
View the %2$s Laboratory concept:
%4$s

Best wishes,
Khaled$fmt$,salutation_title,family_name,topic_x,live_url);
  elsif p_kind='followup_2' then
    subject_value := format('Re: Website concept for the %s Laboratory',family_name);
    body_text_value := format($fmt$Dear %1$s %2$s,

One final note regarding the website concept I created for your laboratory.

If a new website isn't something you're considering at the moment, absolutely no problem. I mainly wanted to make sure the concept reached you.

If you'd ever like to develop it further, I'd be very happy to help.

Best wishes,
Khaled$fmt$,salutation_title,family_name);
  else
    raise exception 'Unsupported outreach sequence message kind: %',p_kind using errcode='23514';
  end if;

  if p_kind<>'initial' then
    efamily := replace(replace(replace(family_name,'&','&amp;'),'<','&lt;'),'>','&gt;');
    etitle := replace(replace(replace(salutation_title,'&','&amp;'),'<','&lt;'),'>','&gt;');
    ex := replace(replace(replace(topic_x,'&','&amp;'),'<','&lt;'),'>','&gt;');
    eurl := replace(replace(replace(replace(live_url,'&','&amp;'),'"','&quot;'),'<','&lt;'),'>','&gt;');
    if p_kind='followup_1' then
      body_html_value := format('<p>Dear %1$s %2$s,</p><p>I just wanted to follow up on the lab website concept I sent earlier.</p><p>I particularly enjoyed translating your work on %3$s into the research section, and I''d be very interested to hear what you think of the direction.</p><p>Here''s the concept again:<br><strong><a href="%4$s">View the %2$s Laboratory concept</a></strong></p><p>Best wishes,<br>Khaled</p>',etitle,efamily,ex,eurl);
    else
      body_html_value := format('<p>Dear %1$s %2$s,</p><p>One final note regarding the website concept I created for your laboratory.</p><p>If a new website isn''t something you're considering at the moment, absolutely no problem. I mainly wanted to make sure the concept reached you.</p><p>If you'd ever like to develop it further, I'd be very happy to help.</p><p>Best wishes,<br>Khaled</p>',etitle,efamily);
    end if;
  end if;

  return jsonb_build_object(
    'subject',subject_value,
    'bodyText',body_text_value,
    'bodyHtml',body_html_value,
    'familyName',family_name,
    'topicX',topic_x,
    'contextY',context_y,
    'conceptUrl',live_url,
    'templateVersion',case when p_kind='initial' then 'short_personal_initial_v2' else 'three_message_v2' end
  );
end;
$function$;

create or replace function public.engine_v3_ensure_outreach_draft(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','labnarrative_engine_v3'
as $function$
declare
  v_uid uuid := auth.uid();
  v_run labnarrative_engine_v3.runs%rowtype;
  v_prospect public.prospects%rowtype;
  v_site public.sites%rowtype;
  v_compat public.production_runs%rowtype;
  v_message public.outreach_messages%rowtype;
  v_recipient text := '';
  v_url text := '';
  v_render jsonb;
begin
  if v_uid is null or not public.is_labnarrative_admin() then
    raise exception 'admin_access_required';
  end if;

  select * into v_run from labnarrative_engine_v3.runs where id=p_run_id;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.site_id is null then raise exception 'site_missing'; end if;
  if v_run.state not in ('published','completed') then raise exception 'outreach_requires_published_run:%',v_run.state; end if;

  select * into v_prospect from public.prospects where id=v_run.prospect_id;
  if not found then raise exception 'prospect_missing'; end if;
  select * into v_site from public.sites where id=v_run.site_id;
  if not found then raise exception 'site_missing'; end if;

  select * into v_compat
  from public.production_runs
  where source_pack->>'engine_v3_run_id'=p_run_id::text
  limit 1;

  if not found then
    insert into public.production_runs(
      prospect_id,site_id,status,current_step,source_pack,generated_content,qa_results,cost_summary,
      started_at,review_ready_at,created_at,updated_at
    ) values (
      v_run.prospect_id,v_run.site_id,'awaiting_final_review','email_draft',
      jsonb_build_object('engine','v3','engine_v3_run_id',p_run_id::text,'chatgpt_native',true),
      coalesce(v_site.content,'{}'::jsonb),
      jsonb_build_object('engine_v3_final_review',true,'renderer_contract_verified',true),
      jsonb_build_object('apiCostUsd',0,'generationSource','ChatGPT scheduled task'),
      coalesce(v_run.started_at,now()),now(),now(),now()
    ) returning * into v_compat;
  else
    update public.production_runs
    set site_id=v_run.site_id,
        status=case when status in ('completed','approved_to_send') then status else 'awaiting_final_review' end,
        current_step=case when status in ('completed','approved_to_send') then current_step else 'email_draft' end,
        generated_content=coalesce(v_site.content,'{}'::jsonb),
        updated_at=now()
    where id=v_compat.id
    returning * into v_compat;
  end if;

  select * into v_message from public.outreach_messages where production_run_id=v_compat.id;
  if found then
    return jsonb_build_object(
      'runId',p_run_id,'productionRunId',v_compat.id,'messageId',v_message.id,
      'recipientEmail',v_message.recipient_email,'senderEmail',v_message.sender_email,
      'subject',v_message.subject,'bodyText',v_message.body_text,'status',v_message.status,
      'publicUrl',coalesce(nullif(v_site.domain_url,''),'https://'||v_site.slug||'.labnarrative.com')
    );
  end if;

  v_recipient := lower(trim(coalesce(v_prospect.email,'')));
  if not public.is_valid_contact_email(v_recipient) then
    v_recipient := lower(trim(coalesce(nullif(v_site.content->>'email',''),nullif(v_site.content#>>'{pages,contact,email}',''),'')));
  end if;
  if not public.is_valid_contact_email(v_recipient) then v_recipient := ''; end if;

  v_url := coalesce(nullif(v_site.domain_url,''),'https://'||v_site.slug||'.labnarrative.com');
  v_render := public.render_outreach_sequence_message(v_compat.id,'initial');

  insert into public.outreach_messages(
    prospect_id,production_run_id,site_id,recipient_email,sender_email,subject,body_text,body_html,status,
    message_kind,is_test,delivery_status,reply_to_email,delivery_details
  ) values (
    v_run.prospect_id,v_compat.id,v_run.site_id,v_recipient,'Khaled Azzahrani <khaled@labnarrative.com>',
    v_render->>'subject',v_render->>'bodyText',v_render->>'bodyHtml','draft',
    'initial',false,'pending','khaled@labnarrative.com',
    jsonb_build_object('engine','v3','engine_v3_run_id',p_run_id::text,'draft_source','human_approved_publish','templateVersion',v_render->>'templateVersion')
  ) returning * into v_message;

  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
  values(p_run_id,'outreach_draft_prepared','Editable outreach draft prepared after human-approved publication. No email was sent.',jsonb_build_object('productionRunId',v_compat.id,'messageId',v_message.id,'recipientMissing',v_recipient='','templateVersion',v_render->>'templateVersion'));

  return jsonb_build_object(
    'runId',p_run_id,'productionRunId',v_compat.id,'messageId',v_message.id,
    'recipientEmail',v_message.recipient_email,'senderEmail',v_message.sender_email,
    'subject',v_message.subject,'bodyText',v_message.body_text,'status',v_message.status,
    'publicUrl',v_url
  );
end;
$function$;

create or replace function public.prepare_labnarrative_outreach_draft()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  c jsonb;
  pi_name text;
  clean_name text;
  family_name text;
  live_url text;
  research_area text := '';
  current_website text := '';
  topic_x text;
  rendered jsonb;
begin
  if new.status is distinct from 'draft' then return new; end if;

  select s.content, coalesce(nullif(s.domain_url,''),'https://'||s.slug||'.labnarrative.com')
  into c, live_url
  from public.sites s where s.id=new.site_id;
  if c is null then return new; end if;

  if new.prospect_id is not null then
    select coalesce(p.research_area,''),coalesce(p.current_website,'')
    into research_area,current_website
    from public.prospects p where p.id=new.prospect_id;
  end if;

  pi_name := coalesce(nullif(c->>'piName',''),'');
  clean_name := regexp_replace(pi_name,'(?i)(\s*,?\s*(ph\.?d\.?|dphil|m\.?d\.?|md|dds|dvm|mph|m\.?sc\.?|msc|ms|mba|frs))+$','','g');
  clean_name := regexp_replace(clean_name,'(?i)^\s*(professor|prof\.?|doctor|dr\.?)\s+','','g');
  clean_name := trim(regexp_replace(clean_name,'[,.;]+$','','g'));
  family_name := regexp_replace(clean_name,'^.*\s+','');
  family_name := trim(regexp_replace(family_name,'[,.;]+$','','g'));
  if family_name='' then family_name:='Professor'; end if;

  topic_x := public.labnarrative_outreach_topic(c,'{}'::jsonb,research_area);
  rendered := public.labnarrative_initial_outreach_message(family_name,topic_x,live_url,current_website);

  new.sender_email := 'Khaled Azzahrani <khaled@labnarrative.com>';
  new.subject := rendered->>'subject';
  new.body_text := rendered->>'bodyText';
  new.body_html := rendered->>'bodyHtml';
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.normalize_outreach_salutation()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare
  pi_name_value text;
  site_content jsonb := '{}'::jsonb;
  family_name text;
  salutation text;
  esc_family text;
begin
  if new.status is distinct from 'draft' then return new; end if;

  if new.message_kind='initial'
     and coalesce(new.delivery_details->>'templateVersion','')='short_personal_initial_v2' then
    return new;
  end if;

  if coalesce(new.delivery_details->>'sequence_template_version','') in ('three_message_v1','bourdon_initial_v1') then
    return new;
  end if;

  select p.pi_name,coalesce(s.content,'{}'::jsonb)
  into pi_name_value,site_content
  from public.prospects p
  left join public.sites s on s.id=new.site_id
  where p.id=new.prospect_id;

  if pi_name_value is null then return new; end if;

  family_name := public.labnarrative_family_name(pi_name_value);
  salutation := public.labnarrative_salutation_title(pi_name_value,site_content);
  esc_family := replace(replace(replace(family_name,'&','&amp;'),'<','&lt;'),'>','&gt;');

  if coalesce(new.body_text,'')<>'' then
    new.body_text := regexp_replace(new.body_text,'^Dear\s+(Professor|Prof\.?|Dr\.?)\s+[^,\n]+,','Dear '||salutation||' '||family_name||',','i');
  end if;
  if coalesce(new.body_html,'')<>'' then
    new.body_html := regexp_replace(new.body_html,'^<p>Dear\s+(Professor|Prof\.?|Dr\.?)\s+[^,<]+,</p>','<p>Dear '||salutation||' '||esc_family||',</p>','i');
  end if;
  return new;
end;
$function$;

with rendered as (
  select om.id, public.render_outreach_sequence_message(om.production_run_id,'initial') as r
  from public.outreach_messages om
  where om.message_kind='initial'
    and om.status='draft'
    and coalesce(om.is_test,false)=false
    and om.production_run_id is not null
)
update public.outreach_messages om
set subject=r.r->>'subject',
    body_text=r.r->>'bodyText',
    body_html=r.r->>'bodyHtml',
    sender_email='Khaled Azzahrani <khaled@labnarrative.com>',
    delivery_details=coalesce(om.delivery_details,'{}'::jsonb) || jsonb_build_object('templateVersion','short_personal_initial_v2')
from rendered r
where om.id=r.id;

with rendered as (
  select om.id, public.render_outreach_sequence_message(om.production_run_id,'initial') as r
  from public.outreach_messages om
  where om.message_kind='initial'
    and om.status='draft'
    and coalesce(om.is_test,false)=false
    and om.production_run_id is not null
    and om.delivery_details->>'templateVersion'='short_personal_initial_v2'
)
update public.outreach_messages om
set subject=r.r->>'subject',
    body_text=r.r->>'bodyText',
    body_html=r.r->>'bodyHtml'
from rendered r
where om.id=r.id;
