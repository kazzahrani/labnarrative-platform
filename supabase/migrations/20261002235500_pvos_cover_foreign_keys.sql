-- Cover PVOS foreign keys used in joins and member/workflow lookups.
create index if not exists pvos_approval_steps_assignee_idx on public.pvos_approval_steps (assignee_user_id);
create index if not exists pvos_audit_actor_idx on public.pvos_audit_events (actor_user_id);
create index if not exists pvos_audit_company_idx on public.pvos_audit_events (company_id);
create index if not exists pvos_companies_qppv_idx on public.pvos_companies (qppv_user_id);
create index if not exists pvos_companies_deputy_idx on public.pvos_companies (deputy_user_id);
create index if not exists pvos_handovers_qppv_idx on public.pvos_handovers (qppv_user_id);
create index if not exists pvos_handovers_deputy_idx on public.pvos_handovers (deputy_user_id);
create index if not exists pvos_obligations_owner_idx on public.pvos_obligations (owner_user_id);
create index if not exists pvos_obligations_reviewer_idx on public.pvos_obligations (reviewer_user_id);
create index if not exists pvos_task_approvals_route_idx on public.pvos_task_approvals (route_id);
create index if not exists pvos_task_evidence_uploader_idx on public.pvos_task_evidence (uploaded_by);
