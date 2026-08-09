create table if not exists public.linkedin_outreach (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references public.prospects(id) on delete cascade,
  profile_url text not null default '',
  status text not null default 'not_contacted' check (status in ('not_contacted','connected','message_sent','replied')),
  connection_note text not null default '',
  last_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.linkedin_outreach enable row level security;

drop policy if exists linkedin_outreach_admin_select on public.linkedin_outreach;
create policy linkedin_outreach_admin_select
on public.linkedin_outreach for select
to authenticated
using (public.is_labnarrative_admin());

drop policy if exists linkedin_outreach_admin_insert on public.linkedin_outreach;
create policy linkedin_outreach_admin_insert
on public.linkedin_outreach for insert
to authenticated
with check (public.is_labnarrative_admin());

drop policy if exists linkedin_outreach_admin_update on public.linkedin_outreach;
create policy linkedin_outreach_admin_update
on public.linkedin_outreach for update
to authenticated
using (public.is_labnarrative_admin())
with check (public.is_labnarrative_admin());

drop policy if exists linkedin_outreach_admin_delete on public.linkedin_outreach;
create policy linkedin_outreach_admin_delete
on public.linkedin_outreach for delete
to authenticated
using (public.is_labnarrative_admin());

create index if not exists linkedin_outreach_status_idx
  on public.linkedin_outreach(status, updated_at desc);

insert into public.linkedin_outreach (prospect_id)
select distinct om.prospect_id
from public.outreach_messages om
where om.message_kind='initial'
  and om.is_test=false
  and om.status='sent'
  and om.prospect_id is not null
on conflict (prospect_id) do nothing;

comment on table public.linkedin_outreach is
  'Manual LinkedIn outreach workflow for LabNarrative sales. The platform prepares notes and tracks status but does not automate LinkedIn sending.';
