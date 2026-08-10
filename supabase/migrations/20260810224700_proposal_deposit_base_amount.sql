alter table public.sales_proposals add column if not exists deposit_base_amount numeric(12,2);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='sales_proposals_deposit_base_amount_check') then
    alter table public.sales_proposals add constraint sales_proposals_deposit_base_amount_check check (deposit_base_amount is null or (deposit_base_amount >= 0 and deposit_base_amount <= price_amount));
  end if;
end $$;

create or replace function public.sales_proposal_admin_save_v2(
  p_proposal_id uuid,
  p_package_key text,
  p_package_name text,
  p_title text,
  p_summary_text text,
  p_scope_items jsonb,
  p_deliverable_items jsonb,
  p_process_items jsonb,
  p_timeline_label text,
  p_price_amount numeric,
  p_currency text,
  p_deposit_percent numeric,
  p_deposit_base_amount numeric,
  p_valid_until date,
  p_terms_text text,
  p_private_notes text
) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  v_old public.sales_proposals%rowtype;
  v_new public.sales_proposals%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v_old from public.sales_proposals where id=p_proposal_id for update;
  if not found then raise exception 'Proposal not found'; end if;
  if v_old.status in ('accepted','declined') then raise exception 'Accepted or declined proposals are locked. Create a new revision first.'; end if;
  if p_package_key not in ('starter','standard','pro','custom') then raise exception 'Invalid package'; end if;
  if coalesce(length(trim(p_package_name)),0)=0 or coalesce(length(trim(p_title)),0)=0 then raise exception 'Package name and title are required'; end if;
  if p_price_amount is null or p_price_amount < 0 then raise exception 'Invalid proposal amount'; end if;
  if p_deposit_percent is null or p_deposit_percent < 0 or p_deposit_percent > 100 then raise exception 'Invalid deposit percent'; end if;
  if p_deposit_base_amount is not null and (p_deposit_base_amount < 0 or p_deposit_base_amount > p_price_amount) then raise exception 'Deposit base amount must be between 0 and the project total'; end if;
  if p_valid_until is null then raise exception 'Proposal validity date is required'; end if;
  if jsonb_typeof(coalesce(p_scope_items,'[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_deliverable_items,'[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_process_items,'[]'::jsonb)) <> 'array' then raise exception 'Proposal list fields must be arrays'; end if;

  if v_old.status in ('sent','viewed') then
    insert into public.sales_proposal_revisions(proposal_id,version,snapshot,created_by)
    values(v_old.id,v_old.version,to_jsonb(v_old),auth.uid());
  end if;

  update public.sales_proposals set
    package_key=p_package_key,
    package_name=trim(p_package_name),
    title=trim(p_title),
    summary_text=coalesce(p_summary_text,''),
    scope_items=coalesce(p_scope_items,'[]'::jsonb),
    deliverable_items=coalesce(p_deliverable_items,'[]'::jsonb),
    process_items=coalesce(p_process_items,'[]'::jsonb),
    timeline_label=coalesce(trim(p_timeline_label),''),
    price_amount=p_price_amount,
    currency=upper(coalesce(nullif(trim(p_currency),''),'USD')),
    deposit_percent=p_deposit_percent,
    deposit_base_amount=p_deposit_base_amount,
    valid_until=p_valid_until,
    terms_text=coalesce(p_terms_text,''),
    private_notes=coalesce(p_private_notes,''),
    status=case when v_old.status in ('sent','viewed') then 'draft' else v_old.status end,
    version=case when v_old.status in ('sent','viewed') then v_old.version+1 else v_old.version end,
    share_enabled=case when v_old.status in ('sent','viewed') then false else v_old.share_enabled end,
    share_token=case when v_old.status in ('sent','viewed') then gen_random_uuid() else v_old.share_token end,
    sent_at=case when v_old.status in ('sent','viewed') then null else v_old.sent_at end,
    first_viewed_at=case when v_old.status in ('sent','viewed') then null else v_old.first_viewed_at end,
    last_viewed_at=case when v_old.status in ('sent','viewed') then null else v_old.last_viewed_at end,
    view_count=case when v_old.status in ('sent','viewed') then 0 else v_old.view_count end,
    updated_at=now(),updated_by=auth.uid()
  where id=p_proposal_id returning * into v_new;
  return to_jsonb(v_new);
end;
$$;

create or replace function public.sales_proposal_admin_mark_sent(p_proposal_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  v public.sales_proposals%rowtype;
  v_site_id uuid;
  v_deposit numeric;
  v_deposit_base numeric;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.sales_proposals where id=p_proposal_id for update;
  if not found then raise exception 'Proposal not found'; end if;
  if v.status in ('accepted','declined') then raise exception 'This proposal is already closed'; end if;
  if not v.share_enabled then raise exception 'Prepare the share link first'; end if;
  if v.valid_until < current_date then raise exception 'Proposal has expired'; end if;
  v_deposit_base := coalesce(v.deposit_base_amount,v.price_amount);
  v_deposit := round(v_deposit_base * v.deposit_percent / 100.0,2);
  update public.sales_proposals set status='sent',sent_at=coalesce(sent_at,now()),updated_at=now(),updated_by=auth.uid() where id=p_proposal_id returning * into v;

  select site_id into v_site_id from public.prospects where id=v.prospect_id;
  insert into public.sales_lead_workspaces(prospect_id,stage,proposal_status,proposal_sent_at,proposal_amount,proposal_currency,deposit_percent,deposit_amount,next_action,next_action_due_at,updated_at,updated_by)
  values(v.prospect_id,'proposal_sent','sent',now(),v.price_amount,v.currency,v.deposit_percent,v_deposit,'Follow up on proposal',now()+interval '3 days',now(),auth.uid())
  on conflict(prospect_id) do update set
    stage='proposal_sent',proposal_status='sent',proposal_sent_at=now(),proposal_amount=v.price_amount,proposal_currency=v.currency,deposit_percent=v.deposit_percent,deposit_amount=v_deposit,next_action='Follow up on proposal',next_action_due_at=now()+interval '3 days',updated_at=now(),updated_by=auth.uid();
  if v_site_id is not null then update public.sites set outreach_status='proposal_sent',updated_at=now() where id=v_site_id; end if;
  update public.prospects set status='interested',updated_at=now() where id=v.prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by)
  values(v.prospect_id,'proposal_sent','sales_conversion','Proposal marked as sent',jsonb_build_object('proposal_id',v.id,'version',v.version,'amount',v.price_amount,'currency',v.currency,'deposit_base_amount',v_deposit_base,'deposit_amount',v_deposit),auth.uid());
  return to_jsonb(v);
end;
$$;

create or replace function public.sales_public_proposal_decide(p_token uuid,p_decision text,p_name text,p_email text default null::text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  v public.sales_proposals%rowtype;
  v_site_id uuid;
  v_deposit numeric;
  v_deposit_base numeric;
  v_balance numeric;
  v_payment public.sales_payment_requests%rowtype;
begin
  if p_decision not in ('accept','decline') then return jsonb_build_object('error','Invalid decision'); end if;
  if coalesce(length(trim(p_name)),0)<2 then return jsonb_build_object('error','Please enter your name'); end if;
  select * into v from public.sales_proposals where share_token=p_token and share_enabled=true for update;
  if not found then return jsonb_build_object('error','Proposal not found or link disabled'); end if;
  if v.valid_until < current_date and v.status not in ('accepted','declined') then return jsonb_build_object('error','This proposal has expired'); end if;

  if v.status='accepted' then
    select * into v_payment from public.sales_payment_requests where proposal_id=v.id and kind='deposit';
    return jsonb_build_object('ok',true,'status','accepted','proposal_id',v.id,'payment_token',v_payment.token,'payment_status',v_payment.status);
  end if;
  if v.status='declined' then return jsonb_build_object('ok',true,'status','declined','proposal_id',v.id); end if;

  v_deposit_base := coalesce(v.deposit_base_amount,v.price_amount);
  v_deposit := round(v_deposit_base * v.deposit_percent / 100.0,2);
  v_balance := greatest(0,v.price_amount-v_deposit);
  select site_id into v_site_id from public.prospects where id=v.prospect_id;

  if p_decision='accept' then
    update public.sales_proposals set status='accepted',accepted_at=now(),accepted_by_name=trim(p_name),accepted_by_email=nullif(trim(coalesce(p_email,'')),''),updated_at=now() where id=v.id returning * into v;
    insert into public.sales_payment_requests(proposal_id,proposal_version,prospect_id,site_id,kind,status,proposal_amount,deposit_percent,amount,currency,balance_after,provider,valid_until,requested_at)
    values(v.id,v.version,v.prospect_id,v_site_id,'deposit','requested',v.price_amount,v.deposit_percent,v_deposit,upper(v.currency),v_balance,'paypal',greatest(v.valid_until,current_date+14),now())
    on conflict(proposal_id,kind) do update set updated_at=public.sales_payment_requests.updated_at
    returning * into v_payment;
    insert into public.sales_lead_workspaces(prospect_id,stage,proposal_status,proposal_amount,proposal_currency,deposit_percent,deposit_amount,payment_status,next_action,next_action_due_at,updated_at)
    values(v.prospect_id,'proposal_sent','accepted',v.price_amount,v.currency,v.deposit_percent,v_deposit,'deposit_requested','Await deposit payment',null,now())
    on conflict(prospect_id) do update set proposal_status='accepted',proposal_amount=v.price_amount,proposal_currency=v.currency,deposit_percent=v.deposit_percent,deposit_amount=v_deposit,payment_status='deposit_requested',next_action='Await deposit payment',next_action_due_at=null,updated_at=now();
    if v_site_id is not null then update public.sites set outreach_status='proposal_sent',updated_at=now() where id=v_site_id; end if;
    update public.prospects set status='interested',updated_at=now() where id=v.prospect_id;
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
    values(v.prospect_id,'proposal_accepted','sales_conversion','Proposal approved; deposit request prepared',jsonb_build_object('proposal_id',v.id,'version',v.version,'accepted_by',trim(p_name),'payment_id',v_payment.id,'deposit_base_amount',v_deposit_base,'deposit_amount',v_payment.amount,'currency',v_payment.currency));
  else
    update public.sales_proposals set status='declined',declined_at=now(),updated_at=now() where id=v.id returning * into v;
    update public.sales_lead_workspaces set proposal_status='declined',next_action='Review proposal and decide whether to revise or close',next_action_due_at=now()+interval '1 day',updated_at=now() where prospect_id=v.prospect_id;
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
    values(v.prospect_id,'proposal_declined','sales_conversion','Proposal declined by recipient',jsonb_build_object('proposal_id',v.id,'version',v.version,'declined_by',trim(p_name)));
  end if;
  return jsonb_build_object('ok',true,'status',v.status,'proposal_id',v.id,'payment_token',case when v_payment.id is null then null else v_payment.token end,'payment_status',case when v_payment.id is null then null else v_payment.status end);
end;
$$;

create or replace function public.sales_public_proposal_get(p_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  v public.sales_proposals%rowtype;
  v_prospect public.prospects%rowtype;
  v_site public.sites%rowtype;
  v_payment public.sales_payment_requests%rowtype;
begin
  select * into v from public.sales_proposals where share_token=p_token and share_enabled=true for update;
  if not found then return jsonb_build_object('error','Proposal not found or link disabled'); end if;
  if v.valid_until < current_date and v.status not in ('accepted','declined') then update public.sales_proposals set status='expired',updated_at=now() where id=v.id returning * into v; end if;
  select * into v_prospect from public.prospects where id=v.prospect_id;
  if v.site_id is not null then select * into v_site from public.sites where id=v.site_id; end if;
  if v.status='accepted' then select * into v_payment from public.sales_payment_requests where proposal_id=v.id and kind='deposit'; end if;
  if v.status='sent' then
    update public.sales_proposals set status='viewed',first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v.id returning * into v;
  elsif v.status in ('ready','viewed') then
    update public.sales_proposals set first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v.id returning * into v;
  end if;
  return jsonb_build_object(
    'proposal',jsonb_build_object(
      'id',v.id,'status',v.status,'version',v.version,'package_name',v.package_name,'title',v.title,'summary_text',v.summary_text,
      'scope_items',v.scope_items,'deliverable_items',v.deliverable_items,'process_items',v.process_items,'timeline_label',v.timeline_label,
      'price_amount',v.price_amount,'currency',v.currency,'deposit_percent',v.deposit_percent,'deposit_base_amount',v.deposit_base_amount,'valid_until',v.valid_until,'terms_text',v.terms_text,
      'sent_at',v.sent_at,'accepted_at',v.accepted_at,'accepted_by_name',v.accepted_by_name,'declined_at',v.declined_at
    ),
    'prospect',jsonb_build_object('pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department,'email',v_prospect.email),
    'site',case when v_site.id is null then null else jsonb_build_object('slug',v_site.slug,'domain_url',v_site.domain_url,'content',jsonb_build_object('labName',v_site.content->>'labName','headline',v_site.content->>'headline')) end,
    'payment',case when v_payment.id is null then null else jsonb_build_object('token',v_payment.token,'status',v_payment.status,'amount',v_payment.amount,'currency',v_payment.currency,'paid_at',v_payment.paid_at) end
  );
end;
$$;
