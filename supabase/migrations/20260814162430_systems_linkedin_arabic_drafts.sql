alter table public.systems_outreach_prospects
  add column if not exists linkedin_note_ar text,
  add column if not exists linkedin_followup_ar text;

comment on column public.systems_outreach_prospects.linkedin_note_ar is 'Arabic LinkedIn connection note, kept separate from the English draft.';
comment on column public.systems_outreach_prospects.linkedin_followup_ar is 'Arabic post-acceptance LinkedIn follow-up, kept separate from the English draft.';
