create or replace function public.claim_due_outreach_followup()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  parent record;
  next_kind text;
  next_sequence integer;
  new_run_id uuid;
  new_message_id uuid;
  rendered jsonb;
  reply_address text;
  sender_address text := 'Khaled Azzahrani <khaled@labnarrative.com>';
begin
  select om.id,om.prospect_id,om.production_run_id,om.site_id,om.recipient_email,om.sender_email,om.message_kind,om.subject,
         om.provider_message_id,om.internet_message_id,om.reply_to_email,
         pr.media_pack,pr.generated_content,pr.qa_results,pr.cost_summary
    into parent
  from public.outreach_messages om
  join public.production_runs pr on pr.id=om.production_run_id
  join public.prospects p on p.id=om.prospect_id
  where om.status='sent'
    and om.is_test=false
    and om.message_kind in ('initial','followup_1')
    and om.follow_up_at is not null
    and om.follow_up_at<=now()
    and coalesce(om.delivery_status,'') not in ('bounced','complained','failed','suppressed')
    and p.status not in ('replied','interested','rejected','paused')
    and not exists (
      select 1 from public.outreach_messages later
      where later.prospect_id=om.prospect_id
        and later.message_kind=case when om.message_kind='initial' then 'followup_1' else 'followup_2' end
    )
  order by om.follow_up_at asc
  limit 1
  for update of om skip locked;

  if not found then return null; end if;

  next_kind := case when parent.message_kind='initial' then 'followup_1' else 'followup_2' end;
  next_sequence := case when next_kind='followup_1' then 2 else 3 end;
  reply_address := public.labnarrative_reply_address(parent.prospect_id);

  insert into public.production_runs(
    prospect_id,site_id,status,current_step,source_pack,media_pack,generated_content,qa_results,cost_summary,
    started_at,last_heartbeat_at,operator_send_locked
  ) values (
    parent.prospect_id,parent.site_id,'running','send',
    jsonb_build_object('message_kind',next_kind,'followup_sequence',next_sequence,'parent_message_id',parent.id,'auto_sequence',true,'approval_required',false,'automatic_send',true,'scheduled_at',now()),
    coalesce(parent.media_pack,'{}'::jsonb),coalesce(parent.generated_content,'{}'::jsonb),coalesce(parent.qa_results,'{}'::jsonb),coalesce(parent.cost_summary,'{}'::jsonb),
    null,now(),false
  ) returning id into new_run_id;

  rendered := public.render_outreach_sequence_message(new_run_id,next_kind);

  insert into public.outreach_messages(
    prospect_id,production_run_id,site_id,recipient_email,sender_email,subject,body_text,body_html,status,message_kind,is_test,delivery_status,delivery_details,
    reply_to_email,in_reply_to,references_header
  ) values (
    parent.prospect_id,new_run_id,parent.site_id,parent.recipient_email,
    sender_address,
    rendered->>'subject',rendered->>'bodyText',rendered->>'bodyHtml','sending',next_kind,false,'pending',
    jsonb_build_object('auto_sequence',true,'approval_required',false,'automatic_send',true,'sequence_template_version',rendered->>'templateVersion','parent_message_id',parent.id,'personalization_x',rendered->>'topicX','personalization_y',rendered->>'contextY','concept_url',rendered->>'conceptUrl'),
    reply_address,coalesce(parent.internet_message_id,''),coalesce(parent.internet_message_id,'')
  ) returning id into new_message_id;

  insert into public.pipeline_events(prospect_id,production_run_id,event_type,step,message,payload)
  values(parent.prospect_id,new_run_id,
    case when next_kind='followup_1' then 'followup_1_automatic_send_started' else 'followup_2_automatic_send_started' end,
    'send',
    case when next_kind='followup_1' then 'Follow-up 1 became due and automatic sending started.' else 'Follow-up 2 became due and automatic sending started.' end,
    jsonb_build_object('messageKind',next_kind,'approvalRequired',false,'automaticSend',true,'scheduledAt',now()));

  return jsonb_build_object(
    'runId',new_run_id,'messageId',new_message_id,'prospectId',parent.prospect_id,'siteId',parent.site_id,
    'messageKind',next_kind,'sequence',next_sequence,'recipientEmail',parent.recipient_email,
    'senderEmail',sender_address,
    'subject',rendered->>'subject','bodyText',rendered->>'bodyText','bodyHtml',rendered->>'bodyHtml',
    'conceptUrl',rendered->>'conceptUrl','replyToEmail',reply_address,
    'parentProviderMessageId',coalesce(parent.provider_message_id,''),'parentInternetMessageId',coalesce(parent.internet_message_id,''),
    'approvalRequired',false,'automaticSend',true
  );
end;
$function$;

create or replace function public.claim_due_outreach_followup_for_prospect(p_prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  parent record;
  next_kind text;
  next_sequence integer;
  new_run_id uuid;
  new_message_id uuid;
  rendered jsonb;
  reply_address text;
  sender_address text := 'Khaled Azzahrani <khaled@labnarrative.com>';
begin
  select om.id,om.prospect_id,om.production_run_id,om.site_id,om.recipient_email,om.sender_email,om.message_kind,om.subject,
         om.provider_message_id,om.internet_message_id,om.reply_to_email,
         pr.media_pack,pr.generated_content,pr.qa_results,pr.cost_summary
    into parent
  from public.outreach_messages om
  join public.production_runs pr on pr.id=om.production_run_id
  join public.prospects p on p.id=om.prospect_id
  where om.prospect_id=p_prospect_id
    and om.status='sent'
    and om.is_test=false
    and om.message_kind in ('initial','followup_1')
    and om.follow_up_at is not null
    and om.follow_up_at<=now()
    and coalesce(om.delivery_status,'') not in ('bounced','complained','failed','suppressed')
    and p.status not in ('replied','interested','rejected','paused')
    and not exists (
      select 1 from public.outreach_messages later
      where later.prospect_id=om.prospect_id
        and later.message_kind=case when om.message_kind='initial' then 'followup_1' else 'followup_2' end
    )
  order by om.follow_up_at asc
  limit 1
  for update of om skip locked;

  if not found then return null; end if;

  next_kind := case when parent.message_kind='initial' then 'followup_1' else 'followup_2' end;
  next_sequence := case when next_kind='followup_1' then 2 else 3 end;
  reply_address := public.labnarrative_reply_address(parent.prospect_id);

  insert into public.production_runs(
    prospect_id,site_id,status,current_step,source_pack,media_pack,generated_content,qa_results,cost_summary,
    started_at,last_heartbeat_at,operator_send_locked
  ) values (
    parent.prospect_id,parent.site_id,'running','send',
    jsonb_build_object('message_kind',next_kind,'followup_sequence',next_sequence,'parent_message_id',parent.id,'auto_sequence',true,'approval_required',false,'automatic_send',true,'scheduled_at',now()),
    coalesce(parent.media_pack,'{}'::jsonb),coalesce(parent.generated_content,'{}'::jsonb),coalesce(parent.qa_results,'{}'::jsonb),coalesce(parent.cost_summary,'{}'::jsonb),
    null,now(),false
  ) returning id into new_run_id;

  rendered := public.render_outreach_sequence_message(new_run_id,next_kind);

  insert into public.outreach_messages(
    prospect_id,production_run_id,site_id,recipient_email,sender_email,subject,body_text,body_html,status,message_kind,is_test,delivery_status,delivery_details,
    reply_to_email,in_reply_to,references_header
  ) values (
    parent.prospect_id,new_run_id,parent.site_id,parent.recipient_email,
    sender_address,
    rendered->>'subject',rendered->>'bodyText',rendered->>'bodyHtml','sending',next_kind,false,'pending',
    jsonb_build_object('auto_sequence',true,'approval_required',false,'automatic_send',true,'sequence_template_version',rendered->>'templateVersion','parent_message_id',parent.id,'personalization_x',rendered->>'topicX','personalization_y',rendered->>'contextY','concept_url',rendered->>'conceptUrl'),
    reply_address,coalesce(parent.internet_message_id,''),coalesce(parent.internet_message_id,'')
  ) returning id into new_message_id;

  insert into public.pipeline_events(prospect_id,production_run_id,event_type,step,message,payload)
  values(parent.prospect_id,new_run_id,
    case when next_kind='followup_1' then 'followup_1_automatic_send_started' else 'followup_2_automatic_send_started' end,
    'send',
    case when next_kind='followup_1' then 'Follow-up 1 became due and automatic sending started.' else 'Follow-up 2 became due and automatic sending started.' end,
    jsonb_build_object('messageKind',next_kind,'approvalRequired',false,'automaticSend',true,'scheduledAt',now()));

  return jsonb_build_object(
    'runId',new_run_id,'messageId',new_message_id,'prospectId',parent.prospect_id,'siteId',parent.site_id,
    'messageKind',next_kind,'sequence',next_sequence,'recipientEmail',parent.recipient_email,
    'senderEmail',sender_address,
    'subject',rendered->>'subject','bodyText',rendered->>'bodyText','bodyHtml',rendered->>'bodyHtml',
    'conceptUrl',rendered->>'conceptUrl','replyToEmail',reply_address,
    'parentProviderMessageId',coalesce(parent.provider_message_id,''),'parentInternetMessageId',coalesce(parent.internet_message_id,''),
    'approvalRequired',false,'automaticSend',true
  );
end;
$function$;