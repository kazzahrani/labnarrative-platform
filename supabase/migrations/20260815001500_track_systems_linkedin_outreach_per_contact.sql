alter table public.systems_outreach_contacts
  add column if not exists linkedin_note text,
  add column if not exists linkedin_note_ar text,
  add column if not exists linkedin_request_sent_at timestamptz,
  add column if not exists linkedin_request_sent_by uuid;

create index if not exists systems_outreach_contacts_linkedin_request_sent_idx
  on public.systems_outreach_contacts (prospect_id, linkedin_request_sent_at)
  where linkedin_url is not null;

with primary_contact as (
  select p.id as prospect_id,
         p.linkedin_note,
         p.linkedin_note_ar,
         pc.name as primary_name
  from public.systems_outreach_prospects p
  left join public.systems_outreach_contacts pc on pc.id = p.linkedin_recipient_contact_id
)
update public.systems_outreach_contacts c
set linkedin_note = case
      when coalesce(trim(c.linkedin_note),'') <> '' then c.linkedin_note
      when pc.linkedin_note is null then null
      when pc.primary_name is not null and split_part(trim(pc.primary_name),' ',1) <> ''
        then replace(pc.linkedin_note, split_part(trim(pc.primary_name),' ',1), split_part(trim(c.name),' ',1))
      else pc.linkedin_note
    end,
    linkedin_note_ar = case
      when coalesce(trim(c.linkedin_note_ar),'') <> '' then c.linkedin_note_ar
      when pc.linkedin_note_ar is null then null
      when pc.primary_name is not null and split_part(trim(pc.primary_name),' ',1) <> ''
        then replace(pc.linkedin_note_ar, split_part(trim(pc.primary_name),' ',1), split_part(trim(c.name),' ',1))
      else pc.linkedin_note_ar
    end,
    updated_at = now()
from primary_contact pc
where c.prospect_id = pc.prospect_id
  and c.linkedin_url is not null;

update public.systems_outreach_contacts c
set linkedin_request_sent_at = p.linkedin_request_sent_at,
    updated_at = now()
from public.systems_outreach_prospects p
where c.id = p.linkedin_recipient_contact_id
  and p.linkedin_request_sent_at is not null
  and c.linkedin_request_sent_at is null;
