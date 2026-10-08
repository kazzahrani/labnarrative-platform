-- Delivery worker: only the server-side Supabase service role may claim or finish notices.
create or replace function public.pvos_invoice_mail_claim(p_invoice_id uuid default null,p_limit integer default 15)
returns jsonb language plpgsql security definer set search_path='' as $$
declare batch jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required';end if;
 if p_limit<1 or p_limit>30 then raise exception 'Invalid claim size';end if;
 with eligible as (
  select n.id from public.pvos_invoice_notifications n
  where (p_invoice_id is null or n.invoice_id=p_invoice_id)
   and ((n.status in ('queued','failed') and n.attempts<5)
     or (n.status='sending' and n.created_at<clock_timestamp()-interval '15 minutes'))
  order by n.created_at
  for update skip locked limit p_limit
 ), updated as (
  update public.pvos_invoice_notifications n set status='sending',attempts=attempts+1,last_error=null
  from eligible e where n.id=e.id returning n.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'invoice_id',n.invoice_id,
   'recipient_email',n.recipient_email,'event_type',n.event_type,'company_name',c.name,
   'created_at',n.created_at)),'[]'::jsonb) into batch
 from updated n join public.pvos_invoice_processes i on i.id=n.invoice_id join public.pvos_companies c on c.id=i.company_id;
 return batch;
end $$;
create or replace function public.pvos_invoice_mail_finish(p_notice_id uuid,p_success boolean,p_provider_id text default null,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required';end if;
 update public.pvos_invoice_notifications set
 status=case when p_success then 'sent' else 'failed' end,
 sent_at=case when p_success then clock_timestamp() else sent_at end,
 provider_message_id=case when p_success then left(coalesce(p_provider_id,''),200) else null end,
 last_error=case when p_success then null else left(coalesce(p_error,'Sending failed'),500) end
 where id=p_notice_id and status='sending';
 if not found then raise exception 'Notice not claimed';end if;
end $$;
revoke all on function public.pvos_invoice_mail_claim(uuid,integer),
 public.pvos_invoice_mail_finish(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.pvos_invoice_mail_claim(uuid,integer),
 public.pvos_invoice_mail_finish(uuid,boolean,text,text) to service_role;
