alter table public.systems_outreach_prospects
  add column if not exists manual_email_recipient_email text,
  add column if not exists manual_email_recipient_name text,
  add column if not exists manual_email_recipient_set_at timestamptz,
  add column if not exists manual_email_recipient_set_by uuid references auth.users(id) on delete set null;

comment on column public.systems_outreach_prospects.manual_email_recipient_email is 'Human-entered outreach recipient override. Not research-verified and never populated by the automated worker.';
comment on column public.systems_outreach_prospects.manual_email_recipient_name is 'Optional human-entered display name for the manual outreach recipient.';
comment on column public.systems_outreach_prospects.manual_email_recipient_set_at is 'When an administrator last set the manual email recipient override.';
comment on column public.systems_outreach_prospects.manual_email_recipient_set_by is 'Administrator who last set the manual email recipient override.';
