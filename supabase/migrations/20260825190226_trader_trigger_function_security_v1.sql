alter function public.trader_guard_pending_averaging_window() set search_path = '';
alter function public.trader_touch_updated_at() set search_path = '';
alter function public.guard_trader_import_completion() set search_path = '';

revoke execute on function public.trader_guard_pending_averaging_window() from public, anon, authenticated;
revoke execute on function public.trader_touch_updated_at() from public, anon, authenticated;
revoke execute on function public.guard_trader_import_completion() from public, anon, authenticated;

grant execute on function public.trader_guard_pending_averaging_window() to service_role;
grant execute on function public.trader_touch_updated_at() to service_role;
grant execute on function public.guard_trader_import_completion() to service_role;
