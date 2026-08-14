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

  v_body := format($body$Dear Professor %1$s,

My name is Dr Khaled Azzahrani. I am a molecular oncology researcher and completed my doctoral work in Professor Kurt Engeland’s group, studying p53, RB/E2F signalling and cell-cycle transcription.

%2$s

I recently founded LabNarrative, and I prepared a website concept for your group using your published research:

%3$s

I thought you might enjoy seeing how I presented the laboratory and its scientific work.

I would genuinely be interested to hear what you think of the direction.

Best wishes,
Dr Khaled Azzahrani
Founder, LabNarrative
labnarrative.com$body$, v_family, v_research_line, v_url);

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
    $html$<p>Dear Professor %1$s,</p><p>My name is Dr Khaled Azzahrani. I am a molecular oncology researcher and completed my doctoral work in Professor Kurt Engeland’s group, studying p53, RB/E2F signalling and cell-cycle transcription.</p><p>%2$s</p><p>I recently founded LabNarrative, and I prepared a website concept for your group using your published research:</p><p><strong><a href="%3$s">%3$s</a></strong></p><p>I thought you might enjoy seeing how I presented the laboratory and its scientific work.</p><p>I would genuinely be interested to hear what you think of the direction.</p><p>Best wishes,<br>Dr Khaled Azzahrani<br>Founder, LabNarrative<br><a href="https://labnarrative.com">labnarrative.com</a></p>$html$,
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
  topic_x := public.labnarrative_outreach_topic(coalesce(s.content,'{}'::jsonb),coalesce(pr.generated_content,'{}'::jsonb),p.research_area);
  context_y := coalesce(nullif(trim(p.research_area),''),topic_x);
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
    body_text_value := format($body$Dear %1$s %2$s,

I just wanted to follow up on the lab website concept I sent earlier.

I particularly enjoyed translating your work on %3$s into the research section, and I'd be very interested to hear what you think of the direction.

Here's the concept again:
View the %2$s Laboratory concept:
%4$s

Best wishes,
Khaled$body$,salutation_title,family_name,topic_x,live_url);
  elsif p_kind='followup_2' then
    subject_value := format('Re: Website concept for the %s Laboratory',family_name);
    body_text_value := format($body$Dear %1$s %2$s,

One final note regarding the website concept I created for your laboratory.

If a new website isn't something you're considering at the moment, absolutely no problem. I mainly wanted to make sure the concept reached you.

If you'd ever like to develop it further, I'd be very happy to help.

Best wishes,
Khaled$body$,salutation_title,family_name);
  else
    raise exception 'Unsupported outreach sequence message kind: %',p_kind using errcode='23514';
  end if;

  if p_kind<>'initial' then
    efamily := replace(replace(replace(family_name,'&','&amp;'),'<','&lt;'),'>','&gt;');
    etitle := replace(replace(replace(salutation_title,'&','&amp;'),'<','&lt;'),'>','&gt;');
    ex := replace(replace(replace(topic_x,'&','&amp;'),'<','&lt;'),'>','&gt;');
    eurl := replace(replace(replace(replace(live_url,'&','&amp;'),'"','&quot;'),'<','&lt;'),'>','&gt;');

    if p_kind='followup_1' then
      body_html_value := format(
        $html$<p>Dear %1$s %2$s,</p><p>I just wanted to follow up on the lab website concept I sent earlier.</p><p>I particularly enjoyed translating your work on %3$s into the research section, and I'd be very interested to hear what you think of the direction.</p><p>Here's the concept again:<br><strong><a href="%4$s">View the %2$s Laboratory concept</a></strong></p><p>Best wishes,<br>Khaled</p>$html$,
        etitle,efamily,ex,eurl
      );
    else
      body_html_value := format(
        $html$<p>Dear %1$s %2$s,</p><p>One final note regarding the website concept I created for your laboratory.</p><p>If a new website isn't something you're considering at the moment, absolutely no problem. I mainly wanted to make sure the concept reached you.</p><p>If you'd ever like to develop it further, I'd be very happy to help.</p><p>Best wishes,<br>Khaled</p>$html$,
        etitle,efamily
      );
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

create or replace function public.normalize_short_personal_initial_outreach()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare
  p public.prospects%rowtype;
  s public.sites%rowtype;
  pr public.production_runs%rowtype;
  family_name text;
  topic_x text;
  live_url text;
  rendered jsonb;
begin
  if new.status is distinct from 'draft'
     or new.message_kind is distinct from 'initial'
     or coalesce(new.is_test,false) then
    return new;
  end if;

  select * into p from public.prospects where id=new.prospect_id;
  if not found then return new; end if;
  if new.site_id is not null then select * into s from public.sites where id=new.site_id; end if;
  if new.production_run_id is not null then select * into pr from public.production_runs where id=new.production_run_id; end if;

  family_name := public.labnarrative_family_name(p.pi_name);
  topic_x := public.labnarrative_outreach_topic(coalesce(s.content,'{}'::jsonb),coalesce(pr.generated_content,'{}'::jsonb),p.research_area);
  live_url := coalesce(
    nullif(trim(s.domain_url),''),
    case when nullif(trim(s.slug),'') is not null then 'https://'||trim(s.slug)||'.labnarrative.com' end,
    case when nullif(trim(p.slug),'') is not null then 'https://'||trim(p.slug)||'.labnarrative.com' end,
    'https://labnarrative.com'
  );

  rendered := public.labnarrative_initial_outreach_message(family_name,topic_x,live_url,p.current_website);
  new.sender_email := 'Khaled Azzahrani <khaled@labnarrative.com>';
  new.subject := rendered->>'subject';
  new.body_text := rendered->>'bodyText';
  new.body_html := rendered->>'bodyHtml';
  new.delivery_details := coalesce(new.delivery_details,'{}'::jsonb)
    || jsonb_build_object('templateVersion','short_personal_initial_v2');
  return new;
end;
$function$;

drop trigger if exists zzzz_normalize_short_personal_initial on public.outreach_messages;
create trigger zzzz_normalize_short_personal_initial
before insert or update of body_text,body_html,subject,status,prospect_id,site_id,production_run_id,message_kind,is_test
on public.outreach_messages
for each row execute function public.normalize_short_personal_initial_outreach();

update public.outreach_messages
set body_text=body_text
where message_kind='initial'
  and status='draft'
  and coalesce(is_test,false)=false;
