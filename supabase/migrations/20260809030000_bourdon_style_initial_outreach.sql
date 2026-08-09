-- Restore the initial outreach style that produced LabNarrative's first positive PI reply.
-- Follow-up messages are intentionally unchanged.

create or replace function public.labnarrative_outreach_topic(
  p_content jsonb default '{}'::jsonb,
  p_generated jsonb default '{}'::jsonb,
  p_research_area text default ''::text
)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog', 'public'
as $function$
declare
  candidates text[];
  candidate text;
  prefix text;
  words text[];
  prefix_words text[];
  word_count integer;
  prefix_count integer;
begin
  candidates := array[
    nullif(trim(p_content #>> '{focusAreas,0}'),''),
    nullif(trim(p_content #>> '{projects,0,title}'),''),
    nullif(trim(p_content #>> '{research,0,title}'),''),
    nullif(trim(p_generated #>> '{focusAreas,0}'),''),
    nullif(trim(p_generated #>> '{projects,0,title}'),''),
    nullif(trim(p_generated #>> '{research,0,title}'),''),
    nullif(trim(p_research_area),'')
  ];

  foreach candidate in array candidates loop
    candidate := trim(regexp_replace(coalesce(candidate,''), '[\r\n\t]+', ' ', 'g'));
    candidate := trim(regexp_replace(candidate, '\s+', ' ', 'g'));
    if candidate = '' then continue; end if;
    if candidate ~ '\?' then continue; end if;
    if candidate ~* '^(how|what|why|which|when|where|who|does|do|can|could|is|are|should|would)\b' then continue; end if;
    candidate := trim(regexp_replace(candidate, '[.!?;:]+$', '', 'g'));
    if candidate = '' then continue; end if;

    if candidate = trim(coalesce(p_research_area,'')) then
      candidate := trim(regexp_replace(candidate, '\s*[,;(].*$', '', 'g'));
    end if;

    words := regexp_split_to_array(candidate, '\s+');
    word_count := coalesce(array_length(words,1),0);

    if word_count > 5 and candidate ~* '\s+(and|&)\s+' then
      prefix := trim(regexp_replace(candidate, '\s+(and|&)\s+.*$', '', 'i'));
      prefix_words := regexp_split_to_array(prefix, '\s+');
      prefix_count := coalesce(array_length(prefix_words,1),0);
      if prefix_count between 2 and 5 then
        candidate := prefix;
        words := prefix_words;
        word_count := prefix_count;
      end if;
    end if;

    if word_count > 5 then
      candidate := array_to_string(words[1:5], ' ');
    end if;

    candidate := trim(regexp_replace(candidate, '\s+(and|or|for|of|to|with|the)$', '', 'i'));
    candidate := trim(regexp_replace(candidate, '[,.;:!?-]+$', '', 'g'));
    if candidate <> '' then return candidate; end if;
  end loop;

  return 'your research';
end;
$function$;

create or replace function public.normalize_outreach_salutation()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  pi_name_value text;
  site_content jsonb := '{}'::jsonb;
  family_name text;
  salutation text;
  esc_family text;
begin
  if new.status is distinct from 'draft' then return new; end if;
  if coalesce(new.delivery_details->>'sequence_template_version','') in ('three_message_v1','bourdon_initial_v1') then return new; end if;

  select p.pi_name, coalesce(s.content,'{}'::jsonb)
    into pi_name_value, site_content
  from public.prospects p
  left join public.sites s on s.id = new.site_id
  where p.id = new.prospect_id;

  if pi_name_value is null then return new; end if;
  family_name := public.labnarrative_family_name(pi_name_value);
  salutation := public.labnarrative_salutation_title(pi_name_value, site_content);
  esc_family := replace(replace(replace(family_name,'&','&amp;'),'<','&lt;'),'>','&gt;');

  if coalesce(new.body_text,'') <> '' then
    new.body_text := regexp_replace(
      new.body_text,
      '^Dear\s+(Professor|Prof\.?|Dr\.?)\s+[^,\n]+,',
      'Dear ' || salutation || ' ' || family_name || ',',
      'i'
    );
  end if;
  if coalesce(new.body_html,'') <> '' then
    new.body_html := regexp_replace(
      new.body_html,
      '^<p>Dear\s+(Professor|Prof\.?|Dr\.?)\s+[^,<]+,</p>',
      '<p>Dear ' || salutation || ' ' || esc_family || ',</p>',
      'i'
    );
  end if;
  return new;
end;
$function$;

create or replace function public.render_outreach_sequence_message(p_run_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
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

  subject_value := case
    when p_kind='initial' then format('Website concept for the %s Laboratory',family_name)
    else format('Re: Website concept for the %s Laboratory',family_name)
  end;

  if p_kind='initial' then
    body_text_value := format($fmt$Dear Professor %1$s,

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
https://labnarrative.com$fmt$,family_name,topic_x,live_url);
  elsif p_kind='followup_1' then
    body_text_value := format($fmt$Dear %1$s %2$s,

I just wanted to follow up on the lab website concept I sent earlier.

I particularly enjoyed translating your work on %3$s into the research section, and I'd be very interested to hear what you think of the direction.

Here's the concept again:
View the %2$s Laboratory concept:
%4$s

Best wishes,
Khaled$fmt$,salutation_title,family_name,topic_x,live_url);
  elsif p_kind='followup_2' then
    body_text_value := format($fmt$Dear %1$s %2$s,

One final note regarding the website concept I created for your laboratory.

If a new website isn't something you're considering at the moment, absolutely no problem. I mainly wanted to make sure the concept reached you.

If you'd ever like to develop it further, I'd be very happy to help.

Best wishes,
Khaled$fmt$,salutation_title,family_name);
  else
    raise exception 'Unsupported outreach sequence message kind: %',p_kind using errcode='23514';
  end if;

  efamily := replace(replace(replace(family_name,'&','&amp;'),'<','&lt;'),'>','&gt;');
  etitle := replace(replace(replace(salutation_title,'&','&amp;'),'<','&lt;'),'>','&gt;');
  ex := replace(replace(replace(topic_x,'&','&amp;'),'<','&lt;'),'>','&gt;');
  eurl := replace(replace(replace(replace(live_url,'&','&amp;'),'"','&quot;'),'<','&lt;'),'>','&gt;');

  if p_kind='initial' then
    body_html_value := format(
      '<p>Dear Professor %1$s,</p><p>My name is Dr Khaled Azzahrani. I am a molecular oncology researcher, and I completed my doctoral work in Professor Kurt Engeland’s group, where I studied p53, RB/E2F signalling, and cell-cycle transcription.</p><p>I have followed your research on the %2$s for years, although unfortunately we have never had the opportunity to connect. Given the significance and breadth of your work, I felt that it could benefit from a dedicated website presenting the laboratory’s research, publications, and scientific direction in one place.</p><p>I am currently developing LabNarrative, a specialized service that creates professional, scientifically accurate websites for research laboratories. I prepared a personalized website concept for your group using publicly available information about your research and publications:</p><p><strong><a href="%3$s">View the %1$s Laboratory concept</a></strong></p><p>The concept includes dedicated pages for your research programmes, publications, laboratory members, opportunities, and contact information. Every aspect—including the text, images, projects, publications, and team profiles—can be revised or expanded.</p><p>This is an independently prepared concept and does not imply any affiliation. If you find the direction useful, I would be pleased to customize it with your current team members, photographs, ongoing projects, and preferred content, and then prepare the completed website for publication on a domain of your choice.</p><p>Would you be open to a brief conversation about it?</p><p>Kind regards,<br>Dr Khaled Azzahrani<br>Founder, LabNarrative<br><a href="https://labnarrative.com">https://labnarrative.com</a></p>',
      efamily,ex,eurl
    );
  elsif p_kind='followup_1' then
    body_html_value := format(
      '<p>Dear %1$s %2$s,</p><p>I just wanted to follow up on the lab website concept I sent earlier.</p><p>I particularly enjoyed translating your work on %3$s into the research section, and I''d be very interested to hear what you think of the direction.</p><p>Here''s the concept again:<br><strong><a href="%4$s">View the %2$s Laboratory concept</a></strong></p><p>Best wishes,<br>Khaled</p>',
      etitle,efamily,ex,eurl
    );
  else
    body_html_value := format(
      '<p>Dear %1$s %2$s,</p><p>One final note regarding the website concept I created for your laboratory.</p><p>If a new website isn''t something you''re considering at the moment, absolutely no problem. I mainly wanted to make sure the concept reached you.</p><p>If you''d ever like to develop it further, I''d be very happy to help.</p><p>Best wishes,<br>Khaled</p>',
      etitle,efamily
    );
  end if;

  return jsonb_build_object(
    'subject',subject_value,
    'bodyText',body_text_value,
    'bodyHtml',body_html_value,
    'familyName',family_name,
    'topicX',topic_x,
    'contextY',context_y,
    'conceptUrl',live_url,
    'templateVersion',case when p_kind='initial' then 'bourdon_initial_v1' else 'three_message_v2' end
  );
end;
$function$;

-- Refresh every unsent initial draft so the very next send uses this template.
with rendered as (
  select om.id, public.render_outreach_sequence_message(om.production_run_id,'initial') as msg
  from public.outreach_messages om
  where om.message_kind='initial'
    and om.status='draft'
    and om.production_run_id is not null
)
update public.outreach_messages om
set subject=r.msg->>'subject',
    body_text=r.msg->>'bodyText',
    body_html=r.msg->>'bodyHtml',
    delivery_details=coalesce(om.delivery_details,'{}'::jsonb) || jsonb_build_object(
      'sequence_template_version','bourdon_initial_v1',
      'personalization_x',r.msg->>'topicX',
      'concept_url',r.msg->>'conceptUrl'
    ),
    updated_at=now()
from rendered r
where om.id=r.id;