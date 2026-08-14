alter table public.systems_outreach_messages
  add column if not exists copy_recipient_email text,
  add column if not exists copy_provider_message_id text,
  add column if not exists copy_delivery_status text not null default 'not_requested',
  add column if not exists copy_sent_at timestamptz,
  add column if not exists copy_delivered_at timestamptz,
  add column if not exists copy_delivery_delayed_at timestamptz,
  add column if not exists copy_bounced_at timestamptz,
  add column if not exists copy_error_message text not null default '',
  add column if not exists copy_delivery_details jsonb not null default '{}'::jsonb;

create index if not exists systems_outreach_messages_copy_provider_message_idx
  on public.systems_outreach_messages(copy_provider_message_id)
  where copy_provider_message_id is not null;

update public.systems_outreach_messages m
set copy_recipient_email = 'kazzahrani@ksu.edu.sa',
    copy_delivery_status = 'delivered',
    copy_delivered_at = coalesce((
      select min((e.payload->>'created_at')::timestamptz)
      from public.resend_webhook_events e
      where e.provider_message_id = m.provider_message_id
        and e.event_type = 'email.delivered'
        and lower(coalesce(e.payload->'data'->'to'->>0,'')) = 'kazzahrani@ksu.edu.sa'
    ), copy_delivered_at),
    copy_delivery_details = jsonb_build_object('historical_mode','shared_bcc_provider_id','recipient','kazzahrani@ksu.edu.sa'),
    updated_at = now()
where m.message_kind = 'initial'
  and m.provider_message_id in ('a69c2e78-3e4a-4942-924c-4a04383ffc74','334fd141-15ce-4f87-b898-e4398bc38571');