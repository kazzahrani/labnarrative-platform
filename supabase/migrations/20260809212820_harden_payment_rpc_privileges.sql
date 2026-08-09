revoke execute on function public.sales_payment_admin_get(uuid) from public, anon;
revoke execute on function public.sales_payment_admin_mark_received(uuid,text,text,text) from public, anon;
grant execute on function public.sales_payment_admin_get(uuid) to authenticated;
grant execute on function public.sales_payment_admin_mark_received(uuid,text,text,text) to authenticated;

revoke execute on function public.sales_payment_provider_bind(uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public.sales_payment_provider_fail(uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public.sales_payment_provider_complete(uuid,text,text,text,numeric,text,jsonb) from public, anon, authenticated;
grant execute on function public.sales_payment_provider_bind(uuid,text,jsonb) to service_role;
grant execute on function public.sales_payment_provider_fail(uuid,text,jsonb) to service_role;
grant execute on function public.sales_payment_provider_complete(uuid,text,text,text,numeric,text,jsonb) to service_role;

revoke execute on function public.sales_payment_public_get(uuid) from public;
grant execute on function public.sales_payment_public_get(uuid) to anon, authenticated;
revoke execute on function public.sales_public_proposal_get(uuid) from public;
grant execute on function public.sales_public_proposal_get(uuid) to anon, authenticated;
revoke execute on function public.sales_public_proposal_decide(uuid,text,text,text) from public;
grant execute on function public.sales_public_proposal_decide(uuid,text,text,text) to anon, authenticated;
