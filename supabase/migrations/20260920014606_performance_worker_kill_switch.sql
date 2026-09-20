create or replace function public.performance_enabled_internal()
returns boolean language sql stable security invoker set search_path=pg_catalog,private
as $$ select coalesce((select enabled from private.performance_plan_config where singleton=true),false) $$;
revoke all on function public.performance_enabled_internal() from public,anon,authenticated;
grant execute on function public.performance_enabled_internal() to service_role;