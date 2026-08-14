alter table public.systems_outreach_prospects
  add column if not exists linkedin_request_sent_at timestamptz;

comment on column public.systems_outreach_prospects.linkedin_request_sent_at is
  'Human-recorded timestamp when the initial LinkedIn connection request was manually sent.';
