create table if not exists public.tender_automation_config (
  key text primary key,
  secret_sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tender_automation_config_sha256_check check (secret_sha256 ~ '^[0-9a-f]{64}$')
);

alter table public.tender_automation_config enable row level security;
revoke all on table public.tender_automation_config from anon, authenticated;
grant select on table public.tender_automation_config to service_role;

-- Keep the scheduler token encrypted in Supabase Vault. Only its SHA-256 hash is
-- exposed to the application through the service-role client for verification.
do $$
declare
  v_secret text;
begin
  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name = 'labnarrative_tender_scheduler'
  order by created_at desc
  limit 1;

  if v_secret is null then
    v_secret := encode(gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      v_secret,
      'labnarrative_tender_scheduler',
      'Bearer token used only by Supabase pg_cron to call protected LabNarrative tender automation routes.'
    );
  end if;

  insert into public.tender_automation_config (key, secret_sha256, updated_at)
  values ('scheduler', encode(digest(v_secret, 'sha256'), 'hex'), now())
  on conflict (key) do update
  set secret_sha256 = excluded.secret_sha256,
      updated_at = now();
end
$$;

create or replace function public.invoke_labnarrative_tender_job(p_path text)
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  if p_path not in ('/api/cron/tenders/nupco', '/api/cron/tenders/match') then
    raise exception 'Unsupported tender automation path';
  end if;

  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name = 'labnarrative_tender_scheduler'
  order by created_at desc
  limit 1;

  if v_secret is null then
    raise exception 'Tender scheduler secret is missing from Supabase Vault';
  end if;

  select net.http_get(
    url := 'https://labnarrative.com' || p_path,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'User-Agent', 'LabNarrative-Supabase-Scheduler/1.0'
    ),
    timeout_milliseconds := 55000
  ) into v_request_id;

  return v_request_id;
end
$$;

revoke all on function public.invoke_labnarrative_tender_job(text) from public, anon, authenticated;
grant execute on function public.invoke_labnarrative_tender_job(text) to service_role;

-- Replace any older copies of these jobs if this migration is reapplied in a
-- repaired environment.
do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in ('labnarrative_nupco_tender_ingest', 'labnarrative_tender_match')
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'labnarrative_nupco_tender_ingest',
  '20 3 * * *',
  $$select public.invoke_labnarrative_tender_job('/api/cron/tenders/nupco');$$
);

select cron.schedule(
  'labnarrative_tender_match',
  '40 3 * * *',
  $$select public.invoke_labnarrative_tender_job('/api/cron/tenders/match');$$
);
