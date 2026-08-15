drop trigger if exists capture_linkedin_inbound_notification_trigger on public.resend_webhook_events;
drop function if exists public.capture_linkedin_inbound_notification();
drop table if exists public.linkedin_inbox_messages;

alter table public.linkedin_outreach drop constraint if exists linkedin_outreach_status_check;
alter table public.linkedin_outreach add constraint linkedin_outreach_status_check
  check (status in ('not_contacted','message_sent','not_found'));
