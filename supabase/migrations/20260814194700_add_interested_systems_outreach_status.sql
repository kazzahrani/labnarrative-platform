alter table public.systems_outreach_prospects
  drop constraint if exists systems_outreach_prospects_status_check;

alter table public.systems_outreach_prospects
  add constraint systems_outreach_prospects_status_check
  check (
    status = any (
      array[
        'discovered'::text,
        'researching'::text,
        'qualified'::text,
        'concept_ready'::text,
        'ready_to_send'::text,
        'contacted'::text,
        'connected'::text,
        'replied'::text,
        'interested'::text,
        'meeting'::text,
        'proposal'::text,
        'won'::text,
        'not_fit'::text,
        'blocked'::text
      ]
    )
  );
