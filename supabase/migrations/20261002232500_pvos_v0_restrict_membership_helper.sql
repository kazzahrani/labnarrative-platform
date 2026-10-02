-- Restrict PVOS membership helper to signed-in users only.
revoke all on function public.pvos_is_member(uuid) from public, anon;
grant execute on function public.pvos_is_member(uuid) to authenticated;
