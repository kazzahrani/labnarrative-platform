create or replace function public.track_systems_outreach_copy_webhook_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id uuid;
  v_current text;
  v_candidate text;
  v_current_rank int;
  v_candidate_rank int;
  v_occurred_at timestamptz;
  v_error text;
begin
  if new.provider_message_id is null or new.provider_message_id = '' then
    return new;
  end if;

  select id, copy_delivery_status
    into v_message_id, v_current
  from public.systems_outreach_messages
  where copy_provider_message_id = new.provider_message_id
  limit 1;

  if v_message_id is null then
    return new;
  end if;

  v_occurred_at := coalesce(nullif(new.payload->>'created_at','')::timestamptz,new.received_at,now());
  v_candidate := case new.event_type
    when 'email.sent' then 'sent'
    when 'email.delivery_delayed' then 'delivery_delayed'
    when 'email.delivered' then 'delivered'
    when 'email.bounced' then 'bounced'
    when 'email.complained' then 'complained'
    when 'email.failed' then 'failed'
    when 'email.suppressed' then 'suppressed'
    else null
  end;

  if v_candidate is null then
    update public.systems_outreach_messages
    set copy_delivery_details = coalesce(copy_delivery_details,'{}'::jsonb) || jsonb_build_object('last_event',new.event_type,'last_payload',new.payload,'last_event_at',v_occurred_at),
        updated_at = now()
    where id = v_message_id;
    return new;
  end if;

  v_current_rank := case coalesce(v_current,'not_requested')
    when 'not_requested' then 0 when 'pending' then 0 when 'sent' then 1 when 'delivery_delayed' then 2 when 'delivered' then 3
    when 'bounced' then 4 when 'complained' then 4 when 'failed' then 4 when 'suppressed' then 4 else 0 end;
  v_candidate_rank := case v_candidate
    when 'sent' then 1 when 'delivery_delayed' then 2 when 'delivered' then 3
    when 'bounced' then 4 when 'complained' then 4 when 'failed' then 4 when 'suppressed' then 4 else 0 end;

  v_error := case
    when new.event_type = 'email.bounced' then coalesce(new.payload->'data'->'bounce'->'diagnosticCode'->>0,new.payload->'data'->'bounce'->>'message','email.bounced')
    when new.event_type in ('email.failed','email.suppressed','email.complained') then new.event_type
    else ''
  end;

  update public.systems_outreach_messages
  set copy_delivery_status = case when v_candidate_rank >= v_current_rank then v_candidate else copy_delivery_status end,
      copy_sent_at = case when new.event_type = 'email.sent' then coalesce(copy_sent_at,v_occurred_at) else copy_sent_at end,
      copy_delivered_at = case when new.event_type = 'email.delivered' then coalesce(copy_delivered_at,v_occurred_at) else copy_delivered_at end,
      copy_delivery_delayed_at = case when new.event_type = 'email.delivery_delayed' then coalesce(copy_delivery_delayed_at,v_occurred_at) else copy_delivery_delayed_at end,
      copy_bounced_at = case when new.event_type = 'email.bounced' then coalesce(copy_bounced_at,v_occurred_at) else copy_bounced_at end,
      copy_error_message = case when v_error <> '' then v_error else copy_error_message end,
      copy_delivery_details = coalesce(copy_delivery_details,'{}'::jsonb) || jsonb_build_object('last_event',new.event_type,'last_payload',new.payload,'last_event_at',v_occurred_at),
      updated_at = now()
  where id = v_message_id;

  return new;
end
$$;

drop trigger if exists systems_outreach_copy_webhook_event on public.resend_webhook_events;
create trigger systems_outreach_copy_webhook_event
after insert on public.resend_webhook_events
for each row execute function public.track_systems_outreach_copy_webhook_event();