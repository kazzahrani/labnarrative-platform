create or replace function public.sync_engine_v3_outreach_completion()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','labnarrative_engine_v3'
as $$
declare
  v_run_id uuid;
  v_provider text;
  v_sent_at timestamptz;
begin
  if new.status <> 'sent' or old.status = 'sent' then
    return new;
  end if;

  begin
    v_run_id := nullif(new.delivery_details->>'engine_v3_run_id','')::uuid;
  exception when others then
    v_run_id := null;
  end;

  if v_run_id is null then
    return new;
  end if;

  v_provider := coalesce(nullif(new.provider,''),'unknown');
  v_sent_at := coalesce(new.sent_at, now());

  update labnarrative_engine_v3.runs
  set state='completed',
      finished_at=coalesce(finished_at,v_sent_at),
      updated_at=now(),
      summary=coalesce(summary,'{}'::jsonb) || jsonb_build_object(
        'outreachCompletedAt',v_sent_at,
        'outreachProvider',v_provider,
        'outreachMessageId',new.id,
        'outreachProductionRunId',new.production_run_id
      )
  where id=v_run_id
    and state in ('published','completed');

  if not exists (
    select 1
    from labnarrative_engine_v3.events
    where run_id=v_run_id
      and event_type='outreach_completed'
      and payload->>'messageId'=new.id::text
  ) then
    insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
    values(
      v_run_id,
      'outreach_completed',
      case when v_provider='private'
        then 'Outreach was confirmed as sent from a personal email account.'
        else 'Outreach was sent through the protected LabNarrative email delivery flow.'
      end,
      jsonb_build_object(
        'messageId',new.id,
        'productionRunId',new.production_run_id,
        'provider',v_provider,
        'sentAt',v_sent_at
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_engine_v3_outreach_completion_trigger on public.outreach_messages;
create trigger sync_engine_v3_outreach_completion_trigger
after update of status on public.outreach_messages
for each row
execute function public.sync_engine_v3_outreach_completion();
