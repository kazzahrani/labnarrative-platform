create or replace function public.labnarrative_website_positioning_sentence(p_current_website text)
returns text
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(p_current_website,'')),'') is not null then
      'I am aware that your laboratory already has an online presence, but I felt there may be an opportunity to present the group’s research, publications, and scientific direction in a more focused and contemporary way.'
    else
      'Given the significance and breadth of your work, I felt that it could benefit from a dedicated website presenting the laboratory’s research, publications, and scientific direction in one place.'
  end;
$$;

create or replace function public.normalize_outreach_website_awareness()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_current_website text := '';
  v_sentence text;
  v_old_generic constant text := 'Given the significance and breadth of your work, I felt that it could benefit from a dedicated website presenting the laboratory’s research, publications, and scientific direction in one place.';
  v_existing_site constant text := 'I am aware that your laboratory already has an online presence, but I felt there may be an opportunity to present the group’s research, publications, and scientific direction in a more focused and contemporary way.';
begin
  if new.message_kind is distinct from 'initial' or new.is_test then
    return new;
  end if;

  select coalesce(p.current_website,'') into v_current_website
  from public.prospects p
  where p.id = new.prospect_id;

  v_sentence := public.labnarrative_website_positioning_sentence(v_current_website);

  if coalesce(new.body_text,'') <> '' then
    new.body_text := replace(new.body_text, v_old_generic, v_sentence);
    new.body_text := replace(new.body_text, v_existing_site, v_sentence);
  end if;

  if coalesce(new.body_html,'') <> '' then
    new.body_html := replace(new.body_html, v_old_generic, v_sentence);
    new.body_html := replace(new.body_html, v_existing_site, v_sentence);
  end if;

  new.delivery_details := coalesce(new.delivery_details,'{}'::jsonb) || jsonb_build_object(
    'website_awareness', case when nullif(trim(v_current_website),'') is not null then 'existing_online_presence' else 'no_current_website_recorded' end
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists zzz_normalize_outreach_website_awareness on public.outreach_messages;
create trigger zzz_normalize_outreach_website_awareness
before insert or update of body_text,body_html,prospect_id,message_kind,is_test
on public.outreach_messages
for each row
execute function public.normalize_outreach_website_awareness();

update public.outreach_messages om
set body_text = replace(
      replace(coalesce(om.body_text,''),
        'Given the significance and breadth of your work, I felt that it could benefit from a dedicated website presenting the laboratory’s research, publications, and scientific direction in one place.',
        public.labnarrative_website_positioning_sentence(p.current_website)),
        'I am aware that your laboratory already has an online presence, but I felt there may be an opportunity to present the group’s research, publications, and scientific direction in a more focused and contemporary way.',
        public.labnarrative_website_positioning_sentence(p.current_website)),
    body_html = replace(
      replace(coalesce(om.body_html,''),
        'Given the significance and breadth of your work, I felt that it could benefit from a dedicated website presenting the laboratory’s research, publications, and scientific direction in one place.',
        public.labnarrative_website_positioning_sentence(p.current_website)),
        'I am aware that your laboratory already has an online presence, but I felt there may be an opportunity to present the group’s research, publications, and scientific direction in a more focused and contemporary way.',
        public.labnarrative_website_positioning_sentence(p.current_website)),
    delivery_details = coalesce(om.delivery_details,'{}'::jsonb) || jsonb_build_object(
      'website_awareness', case when nullif(trim(coalesce(p.current_website,'')),'') is not null then 'existing_online_presence' else 'no_current_website_recorded' end),
    updated_at = now()
from public.prospects p
where p.id=om.prospect_id
  and om.message_kind='initial'
  and om.is_test=false
  and om.status in ('draft','approved','sending');
