create or replace function public.sales_client_handover_public_get(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.sales_client_launches%rowtype; v_prospect public.prospects%rowtype; v_site public.sites%rowtype; v_onboarding public.sales_client_onboarding%rowtype; v_payment public.sales_payment_requests%rowtype; v_offer public.care_offers%rowtype; v_url text;
begin
  select * into v from public.sales_client_launches where handover_token=p_token and handover_link_enabled=true and status in ('launched','handover_sent','completed') for update;
  if not found then return jsonb_build_object('error','Handover link not found or disabled'); end if;
  if v.status<>'completed' then update public.sales_client_launches set handover_first_viewed_at=coalesce(handover_first_viewed_at,now()),handover_last_viewed_at=now(),handover_view_count=handover_view_count+1,updated_at=now() where id=v.id returning * into v; end if;
  select * into v_prospect from public.prospects where id=v.prospect_id;
  select * into v_site from public.sites where id=v.site_id;
  select * into v_onboarding from public.sales_client_onboarding where id=v.onboarding_id;
  select * into v_payment from public.sales_payment_requests where id=v.balance_payment_id;
  if v.status='completed' then select * into v_offer from public.care_offers where prospect_id=v.prospect_id; end if;
  v_url:=coalesce(nullif(v_site.domain_url,''),'https://' || v_site.slug || '.labnarrative.com');
  return jsonb_build_object(
    'handover',jsonb_build_object('status',v.status,'launched_at',v.launched_at,'handover_sent_at',v.handover_sent_at,'acknowledged_at',v.handover_acknowledged_at,'client_name',v.handover_client_name),
    'prospect',jsonb_build_object('pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department),
    'site',jsonb_build_object('slug',v_site.slug,'url',v_url,'domain_status',v_site.domain_status),
    'domain',jsonb_build_object('choice',v_onboarding.domain_choice,'preferred_domain',v_onboarding.preferred_domain),
    'payment',jsonb_build_object('status',v_payment.status,'amount',v_payment.amount,'currency',v_payment.currency,'paid_at',v_payment.paid_at),
    'care',case when v_offer.id is null then null else jsonb_build_object('token',v_offer.token,'status',v_offer.status,'valid_until',v_offer.valid_until) end,
    'support',jsonb_build_object('email','khaled@labnarrative.com','provider','LabNarrative')
  );
end;$$;
revoke all on function public.sales_client_handover_public_get(uuid) from public;
grant execute on function public.sales_client_handover_public_get(uuid) to anon,authenticated;
