grant select, insert, update on table public.internal_video_jobs to authenticated;

create policy "internal admins can read video jobs"
on public.internal_video_jobs
for select
to authenticated
using ((select public.is_internal_admin()));

create policy "internal admins can create video jobs"
on public.internal_video_jobs
for insert
to authenticated
with check (
  (select public.is_internal_admin())
  and created_by = (select auth.uid())
);

create policy "internal admins can update video jobs"
on public.internal_video_jobs
for update
to authenticated
using ((select public.is_internal_admin()))
with check ((select public.is_internal_admin()));
