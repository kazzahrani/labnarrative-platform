create or replace function public.sales_client_launch_admin_launch(p_prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.sales_client_launches%rowtype;v_site public.sites%rowtype;v_review public.sales_client_final_reviews%rowtype;v_payment public.sales_payment_requests%rowtype;v_onboarding public.sales_client_onboarding%rowtype;v_url text;v_launch_time timestamptz:=now();
begin
 if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
 select * into v from public.sales_client_launches where prospect_id=p_prospect_id for update;if not found then raise exception 'Launch workspace not found';end if;
 if v.status in ('launched','handover_sent','completed') then return jsonb_build_object('ok',true,'launch',to_jsonb(v)); end if;
 select * into v_site from public.sites where id=v.site_id for update;select * into v_review from public.sales_client_final_reviews where id=v.final_review_id;select * into v_payment from public.sales_payment_requests where id=v.balance_payment_id;select * into v_onboarding from public.sales_client_onboarding where id=v.onboarding_id;
 if v_review.status<>'approved' then raise exception 'Client final approval is required';end if;if v_payment.status<>'paid' then raise exception 'Final balance must be paid';end if;if v_onboarding.status<>'completed' then raise exception 'Client onboarding must be completed';end if;if v_site.updated_at is distinct from v.approved_site_updated_at then raise exception 'Website changed after client approval; prepare a new final review';end if;if v_onboarding.domain_choice='undecided' then raise exception 'Domain choice must be resolved before launch';end if;if v_onboarding.domain_choice in ('custom','institutional') and not(v_site.domain_status in ('live','wildcard_live','wildcard_ready') and coalesce(v_site.domain_url,'') like 'https://%') then raise exception 'Custom or institutional domain is not live with HTTPS';end if;if not(v.domain_ready and v.https_ready and v.website_health_ready and v.mobile_reviewed and v.contact_links_reviewed and v.analytics_ready and v.branding_reviewed) then raise exception 'Complete every launch checklist item first';end if;
 v_url:=coalesce(nullif(v_site.domain_url,''),'https://'||v_site.slug||'.labnarrative.com');
 update public.sites set status='live',outreach_status='client',updated_at=v_launch_time where id=v_site.id;
 update public.sales_client_launches set status='launched',handover_link_enabled=true,launched_at=v_launch_time,approved_site_updated_at=v_launch_time,updated_at=v_launch_time,updated_by=auth.uid() where id=v.id returning * into v;
 update public.sales_lead_workspaces set stage='client',payment_status='paid_in_full',next_action='Send client handover',next_action_due_at=v_launch_time,updated_at=v_launch_time,updated_by=auth.uid() where prospect_id=v.prospect_id;
 insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by) values(v.prospect_id,'website_launched','client_delivery','Client website launched after final approval and payment',jsonb_build_object('launch_id',v.id,'site_id',v.site_id,'url',v_url),auth.uid());
 return jsonb_build_object('ok',true,'launch',to_jsonb(v),'site_url',v_url,'handover_url','https://labnarrative.com/handover/'||v.handover_token::text);
end;
$$;
revoke all on function public.sales_client_launch_admin_launch(uuid) from public,anon;
grant execute on function public.sales_client_launch_admin_launch(uuid) to authenticated;
