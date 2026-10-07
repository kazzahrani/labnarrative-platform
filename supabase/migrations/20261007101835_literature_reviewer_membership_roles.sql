CREATE OR REPLACE FUNCTION public.pvos_bootstrap_workspace(workspace_name text DEFAULT 'PVOS Workspace'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  user_email text;
  existing_org uuid;
  invited_org uuid;
  invite_id uuid;
  invite_role text;
  new_org uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));

  select email into user_email from auth.users where id=uid;

  select i.id,i.organization_id,i.role
  into invite_id,invited_org,invite_role
  from public.pvos_workspace_invites i
  where i.status='pending'
    and lower(i.email)=lower(user_email)
  order by i.invited_at desc
  limit 1;

  if invited_org is not null then
    insert into public.pvos_memberships(organization_id,user_id,role)
    values(invited_org,uid,case when invite_role in ('admin','qppv','deputy_qppv','pv_specialist','quality','manager','client_representative') then invite_role else 'quality' end)
    on conflict(organization_id,user_id) do nothing;

    update public.pvos_workspace_invites
    set status='accepted',accepted_by=uid,accepted_at=now()
    where id=invite_id;

    return invited_org;
  end if;

  select organization_id into existing_org
  from public.pvos_memberships
  where user_id=uid
  order by created_at desc
  limit 1;

  if existing_org is not null then
    return existing_org;
  end if;

  insert into public.pvos_organizations(name)
  values(coalesce(nullif(trim(workspace_name),''),'PVOS Workspace'))
  returning id into new_org;

  insert into public.pvos_memberships(organization_id,user_id,role)
  values(new_org,uid,'admin');

  return new_org;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.pvos_invite_workspace_member(p_organization_id uuid, p_email text, p_role text DEFAULT 'reviewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_uid uuid;
  v_role text := case when p_role in ('admin','qppv','deputy_qppv','pv_specialist','quality','manager','client_representative') then p_role else 'quality' end;
begin
  if auth.uid() is null or not exists(select 1 from public.pvos_memberships where organization_id=p_organization_id and user_id=auth.uid() and role in ('admin','qppv')) then
    raise exception 'Not authorized for this workspace';
  end if;

  if coalesce(trim(p_email),'')='' then
    raise exception 'Email is required';
  end if;

  select id into v_uid
  from auth.users
  where lower(email)=lower(trim(p_email))
  limit 1;

  if v_uid is not null then
    insert into public.pvos_memberships(organization_id,user_id,role)
    values(p_organization_id,v_uid,v_role)
    on conflict(organization_id,user_id) do nothing;

    update public.pvos_workspace_invites
    set status='accepted',accepted_by=v_uid,accepted_at=now()
    where organization_id=p_organization_id
      and lower(email)=lower(trim(p_email))
      and status='pending';

    return jsonb_build_object('status','member_added','user_id',v_uid);
  end if;

  insert into public.pvos_workspace_invites(
    organization_id,email,role,status,invited_by,metadata
  )
  values(
    p_organization_id,lower(trim(p_email)),v_role,'pending',auth.uid(),
    jsonb_build_object('source','second_review')
  )
  on conflict(organization_id,lower(email)) where status='pending'
  do update set role=excluded.role,invited_by=auth.uid(),invited_at=now();

  return jsonb_build_object('status','invited','email',lower(trim(p_email)));
end;
$function$
;
revoke all on function public.pvos_invite_workspace_member(uuid,text,text),public.pvos_member_directory(uuid) from public,anon;
grant execute on function public.pvos_invite_workspace_member(uuid,text,text),public.pvos_member_directory(uuid) to authenticated;
