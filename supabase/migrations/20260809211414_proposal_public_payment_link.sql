drop function if exists public.sales_public_proposal_get(uuid);
create function public.sales_public_proposal_get(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_proposals%rowtype;
  v_prospect public.prospects%rowtype;
  v_site public.sites%rowtype;
  v_payment public.sales_payment_requests%rowtype;
begin
  select * into v from public.sales_proposals where share_token=p_token and share_enabled=true for update;
  if not found then return jsonb_build_object('error','Proposal not found or link disabled'); end if;
  if v.valid_until < current_date and v.status not in ('accepted','declined') then
    update public.sales_proposals set status='expired',updated_at=now() where id=v.id returning * into v;
  end if;
  select * into v_prospect from public.prospects where id=v.prospect_id;
  if v.site_id is not null then select * into v_site from public.sites where id=v.site_id; end if;
  if v.status='accepted' then select * into v_payment from public.sales_payment_requests where proposal_id=v.id and kind='deposit'; end if;
  if v.status='sent' then
    update public.sales_proposals set status='viewed',first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v.id returning * into v;
  elsif v.status in ('ready','viewed') then
    update public.sales_proposals set first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v.id returning * into v;
  end if;
  return jsonb_build_object(
    'proposal', jsonb_build_object(
      'id',v.id,'status',v.status,'version',v.version,'package_name',v.package_name,'title',v.title,'summary_text',v.summary_text,
      'scope_items',v.scope_items,'deliverable_items',v.deliverable_items,'process_items',v.process_items,'timeline_label',v.timeline_label,
      'price_amount',v.price_amount,'currency',v.currency,'deposit_percent',v.deposit_percent,'valid_until',v.valid_until,'terms_text',v.terms_text,
      'sent_at',v.sent_at,'accepted_at',v.accepted_at,'accepted_by_name',v.accepted_by_name,'declined_at',v.declined_at
    ),
    'prospect',jsonb_build_object('pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department,'email',v_prospect.email),
    'site',case when v_site.id is null then null else jsonb_build_object('slug',v_site.slug,'domain_url',v_site.domain_url,'content',jsonb_build_object('labName',v_site.content->>'labName','headline',v_site.content->>'headline')) end,
    'payment',case when v_payment.id is null then null else jsonb_build_object('token',v_payment.token,'status',v_payment.status,'amount',v_payment.amount,'currency',v_payment.currency,'paid_at',v_payment.paid_at) end
  );
end;
$$;
revoke all on function public.sales_public_proposal_get(uuid) from public;
grant execute on function public.sales_public_proposal_get(uuid) to anon,authenticated;
