create or replace function public.care_provider_bind_subscription(p_offer_id uuid,p_plan_id uuid,p_provider_subscription_id text,p_status text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_offer public.care_offers%rowtype; v_plan public.care_plans%rowtype; v_sub public.care_subscriptions%rowtype;
begin
 select * into v_offer from public.care_offers where id=p_offer_id for update; if not found then raise exception 'Care offer not found'; end if;
 if exists(select 1 from public.care_subscriptions where offer_id=p_offer_id and status='active' and provider='proposal_included') then
   raise exception 'Care is already active and included with this project';
 end if;
 select * into v_plan from public.care_plans where id=p_plan_id and is_active; if not found then raise exception 'Care plan not found'; end if;
 select * into v_sub from public.care_subscriptions where provider_subscription_id=p_provider_subscription_id;
 if v_sub.id is null then
  insert into public.care_subscriptions(offer_id,prospect_id,site_id,plan_id,status,provider_subscription_id,plan_name,billing_interval,price_amount,currency,provider_metadata)
  values(v_offer.id,v_offer.prospect_id,v_offer.site_id,v_plan.id,case when upper(p_status)='ACTIVE' then 'active' else 'approval_pending' end,p_provider_subscription_id,v_plan.name,v_plan.billing_interval,v_plan.price_amount,v_plan.currency,coalesce(p_metadata,'{}'::jsonb)) returning * into v_sub;
 end if;
 update public.care_offers set status=case when v_sub.status='active' then 'active' else 'accepted' end,selected_plan_id=v_plan.id,accepted_at=coalesce(accepted_at,now()),updated_at=now() where id=v_offer.id;
 return to_jsonb(v_sub);
end;
$$;
