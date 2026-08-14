alter table public.systems_outreach_prospects
  add column if not exists email_recipient_contact_id uuid,
  add column if not exists email_recipient_email text,
  add column if not exists email_provider_message_id text,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_delivery_status text,
  add column if not exists email_last_error text,
  add column if not exists email_last_event_at timestamptz;

create index if not exists systems_outreach_prospects_email_provider_message_idx
  on public.systems_outreach_prospects(email_provider_message_id)
  where email_provider_message_id is not null;
