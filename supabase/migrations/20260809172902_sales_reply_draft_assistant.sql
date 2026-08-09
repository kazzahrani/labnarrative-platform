alter table public.sales_lead_workspaces
  add column if not exists reply_draft_subject text not null default '',
  add column if not exists reply_draft_body text not null default '',
  add column if not exists reply_draft_updated_at timestamptz;

create or replace function public.sales_lead_reply_draft_save(
  p_prospect_id uuid,
  p_subject text,
  p_body text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.sales_lead_workspaces%rowtype;
begin
  if not public.is_labnarrative_admin() then
    raise exception 'Administrator access required';
  end if;

  if not exists (select 1 from public.prospects where id = p_prospect_id) then
    raise exception 'Prospect not found';
  end if;

  insert into public.sales_lead_workspaces(
    prospect_id,
    stage,
    reply_draft_subject,
    reply_draft_body,
    reply_draft_updated_at,
    updated_at,
    updated_by
  )
  values (
    p_prospect_id,
    'contacted',
    coalesce(p_subject, ''),
    coalesce(p_body, ''),
    now(),
    now(),
    auth.uid()
  )
  on conflict (prospect_id) do update set
    reply_draft_subject = excluded.reply_draft_subject,
    reply_draft_body = excluded.reply_draft_body,
    reply_draft_updated_at = now(),
    updated_at = now(),
    updated_by = auth.uid()
  returning * into v_workspace;

  return to_jsonb(v_workspace);
end;
$$;

revoke all on function public.sales_lead_reply_draft_save(uuid,text,text) from public, anon;
grant execute on function public.sales_lead_reply_draft_save(uuid,text,text) to authenticated;
