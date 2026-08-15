alter table public.linkedin_outreach drop constraint if exists linkedin_outreach_status_check;
alter table public.linkedin_outreach add constraint linkedin_outreach_status_check
  check (status in ('not_contacted','message_sent','not_found','replied'));

create table if not exists public.linkedin_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  provider_email_id text not null unique,
  prospect_id uuid references public.prospects(id) on delete set null,
  source_from_email text not null default '',
  subject text not null default '',
  sender_name text not null default '',
  sender_profile_url text not null default '',
  notification_type text not null default 'unknown' check (notification_type in ('reply','notification','unknown')),
  match_method text not null default 'unmatched' check (match_method in ('subject_pi_name','profile_url','manual','unmatched')),
  status text not null default 'new' check (status in ('new','handled','ignored')),
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.linkedin_inbox_messages enable row level security;

drop policy if exists linkedin_inbox_admin_select on public.linkedin_inbox_messages;
create policy linkedin_inbox_admin_select
on public.linkedin_inbox_messages for select
to authenticated
using (public.is_labnarrative_admin());

drop policy if exists linkedin_inbox_admin_update on public.linkedin_inbox_messages;
create policy linkedin_inbox_admin_update
on public.linkedin_inbox_messages for update
to authenticated
using (public.is_labnarrative_admin())
with check (public.is_labnarrative_admin());

grant select, update on public.linkedin_inbox_messages to authenticated;

create index if not exists linkedin_inbox_received_idx
  on public.linkedin_inbox_messages(received_at desc);
create index if not exists linkedin_inbox_prospect_idx
  on public.linkedin_inbox_messages(prospect_id, received_at desc);
create index if not exists linkedin_inbox_status_idx
  on public.linkedin_inbox_messages(status, notification_type, received_at desc);

create or replace function public.capture_linkedin_inbound_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  d jsonb := coalesce(new.payload->'data', '{}'::jsonb);
  recipient_text text := lower(coalesce((new.payload->'data'->'to')::text, ''));
  v_subject text := coalesce(d->>'subject','');
  v_from text := coalesce(d->>'from','');
  v_provider_email_id text := coalesce(d->>'email_id', new.provider_message_id, new.id);
  v_received_at timestamptz := coalesce(nullif(d->>'created_at','')::timestamptz, new.received_at, now());
  v_type text := 'unknown';
  v_prospect_id uuid;
  v_sender_name text := '';
  v_candidate_count integer := 0;
begin
  if new.event_type <> 'email.received' then
    return new;
  end if;

  if recipient_text not like '%linkedin@%' then
    return new;
  end if;

  if lower(v_subject) similar to '%(sent you a message|messaged you|replied to you|replied to your message|sent a new message|new message from)%' then
    v_type := 'reply';
  elsif lower(v_subject) similar to '%(invitation|profile view|appeared in recent searches|recently posted|follow |add )%' then
    v_type := 'notification';
  end if;

  select count(*), min(p.id)
  into v_candidate_count, v_prospect_id
  from public.prospects p
  join public.linkedin_outreach li on li.prospect_id = p.id
  where li.status in ('message_sent','replied')
    and length(trim(coalesce(p.pi_name,''))) >= 5
    and position(lower(trim(p.pi_name)) in lower(v_subject)) > 0;

  if v_candidate_count <> 1 then
    v_prospect_id := null;
  else
    select coalesce(p.pi_name,'') into v_sender_name
    from public.prospects p where p.id = v_prospect_id;
  end if;

  insert into public.linkedin_inbox_messages(
    provider_email_id, prospect_id, source_from_email, subject, sender_name,
    notification_type, match_method, raw_payload, received_at
  ) values (
    v_provider_email_id, v_prospect_id, v_from, v_subject, v_sender_name,
    v_type, case when v_prospect_id is not null then 'subject_pi_name' else 'unmatched' end,
    new.payload, v_received_at
  )
  on conflict (provider_email_id) do update set
    prospect_id = coalesce(public.linkedin_inbox_messages.prospect_id, excluded.prospect_id),
    source_from_email = excluded.source_from_email,
    subject = excluded.subject,
    sender_name = case when public.linkedin_inbox_messages.sender_name='' then excluded.sender_name else public.linkedin_inbox_messages.sender_name end,
    notification_type = excluded.notification_type,
    match_method = case when public.linkedin_inbox_messages.match_method='unmatched' then excluded.match_method else public.linkedin_inbox_messages.match_method end,
    raw_payload = excluded.raw_payload,
    received_at = excluded.received_at,
    updated_at = now();

  if v_type = 'reply' and v_prospect_id is not null then
    update public.linkedin_outreach
      set status='replied', last_action_at=v_received_at, updated_at=now()
      where prospect_id=v_prospect_id;
    perform public.stop_outreach_sequence_after_reply(v_prospect_id, null);
  end if;

  return new;
end;
$$;

revoke all on function public.capture_linkedin_inbound_notification() from public, anon, authenticated;

drop trigger if exists capture_linkedin_inbound_notification_trigger on public.resend_webhook_events;
create trigger capture_linkedin_inbound_notification_trigger
after insert on public.resend_webhook_events
for each row execute function public.capture_linkedin_inbound_notification();

comment on table public.linkedin_inbox_messages is
  'LinkedIn message/reply notifications captured from the dedicated inbound forwarding alias. Matching is conservative; unmatched items stay visible for manual review.';
