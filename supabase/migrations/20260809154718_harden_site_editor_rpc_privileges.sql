revoke all on function public.site_editor_validate_content(uuid,jsonb) from public, anon, authenticated;

revoke all on function public.site_editor_open(text) from public, anon;
revoke all on function public.site_editor_save(uuid,jsonb,text) from public, anon;
revoke all on function public.site_editor_reset_to_live(uuid) from public, anon;
revoke all on function public.site_editor_use_history(uuid) from public, anon;
revoke all on function public.site_editor_publish(uuid) from public, anon;

grant execute on function public.site_editor_open(text) to authenticated;
grant execute on function public.site_editor_save(uuid,jsonb,text) to authenticated;
grant execute on function public.site_editor_reset_to_live(uuid) to authenticated;
grant execute on function public.site_editor_use_history(uuid) to authenticated;
grant execute on function public.site_editor_publish(uuid) to authenticated;
