create or replace function public.sales_client_onboarding_public_get(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_client_onboarding%rowtype;
  v_prospect public.prospects%rowtype;
  v_site public.sites%rowtype;
  v_payment public.sales_payment_requests%rowtype;
  v_assets jsonb := '[]'::jsonb;
  v_progress integer;
begin
  select * into v from public.sales_client_onboarding where share_token=p_token and link_enabled=true for update;
  if not found then return jsonb_build_object('error','Onboarding link not found or disabled'); end if;
  if v.status='completed' then null;
  elsif v.status='not_started' then
    update public.sales_client_onboarding set status='in_progress',opened_at=coalesce(opened_at,now()),updated_at=now() where id=v.id returning * into v;
  elsif v.opened_at is null then
    update public.sales_client_onboarding set opened_at=now(),updated_at=now() where id=v.id returning * into v;
  end if;

  select * into v_prospect from public.prospects where id=v.prospect_id;
  if v.site_id is not null then select * into v_site from public.sites where id=v.site_id; end if;
  select * into v_payment from public.sales_payment_requests where id=v.payment_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'kind',a.kind,'label',a.label,'storage_path',a.storage_path,'public_url',a.public_url,
    'original_filename',a.original_filename,'mime_type',a.mime_type,'file_size',a.file_size,'created_at',a.created_at
  ) order by a.created_at desc),'[]'::jsonb) into v_assets
  from public.sales_client_onboarding_assets a where a.onboarding_id=v.id;
  v_progress := round((
    (case when v.identity_reviewed then 1 else 0 end)+
    (case when v.content_reviewed then 1 else 0 end)+
    (case when v.team_reviewed then 1 else 0 end)+
    (case when v.contact_reviewed then 1 else 0 end)+
    (case when v.domain_reviewed then 1 else 0 end)+
    (case when v.branding_reviewed then 1 else 0 end)+
    (case when v.hiring_reviewed then 1 else 0 end)
  ) * 100.0 / 7.0);

  return jsonb_build_object(
    'onboarding',to_jsonb(v)-'share_token'-'admin_notes'-'updated_by',
    'progress',v_progress,
    'prospect',jsonb_build_object('pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department),
    'site',case when v_site.id is null then null else jsonb_build_object('slug',v_site.slug,'domain_url',v_site.domain_url,'status',v_site.status,'headline',v_site.content->>'headline','introduction',v_site.content->>'introduction') end,
    'payment',jsonb_build_object('amount',v_payment.amount,'currency',v_payment.currency,'paid_at',v_payment.paid_at),
    'assets',v_assets
  );
end;
$$;
revoke all on function public.sales_client_onboarding_public_get(uuid) from public;
grant execute on function public.sales_client_onboarding_public_get(uuid) to anon,authenticated;
