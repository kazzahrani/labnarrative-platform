update public.systems_outreach_prospects
set status='contacted', updated_at=now()
where status='connected';

create or replace function public.record_systems_linkedin_connected(
  p_prospect_id uuid,
  p_contact_id uuid default null::uuid
)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamptz := now();
  v_contact uuid;
begin
  if not exists(
    select 1 from public.user_roles ur
    where ur.user_id=auth.uid() and ur.role='admin'
  ) then
    raise exception 'Administrator permission is required.';
  end if;

  select coalesce(p_contact_id, p.linkedin_recipient_contact_id)
    into v_contact
  from public.systems_outreach_prospects p
  where p.id=p_prospect_id;

  if v_contact is not null and not exists(
    select 1
    from public.systems_outreach_contacts c
    where c.id=v_contact and c.prospect_id=p_prospect_id
  ) then
    raise exception 'LinkedIn contact does not belong to this prospect.';
  end if;

  update public.systems_outreach_prospects
  set status=case
        when status in ('discovered','researching','qualified','concept_ready','ready_to_send','connected') then 'contacted'
        else status
      end,
      linkedin_recipient_contact_id=coalesce(v_contact,linkedin_recipient_contact_id),
      linkedin_connected_at=coalesce(linkedin_connected_at,v_now),
      contacted_at=coalesce(contacted_at,v_now),
      updated_at=v_now
  where id=p_prospect_id;

  insert into public.systems_outreach_events(prospect_id,channel,event_type,status,content)
  values(
    p_prospect_id,
    'linkedin',
    'linkedin_connected',
    'recorded',
    'LinkedIn connection accepted; prospect remains Contacted until an actual reply is recorded.'
  );

  return v_now;
end;
$function$;
