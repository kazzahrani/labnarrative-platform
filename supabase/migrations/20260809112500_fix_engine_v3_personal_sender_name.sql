do $$
declare
  fn oid;
  ddl text;
begin
  select p.oid into fn
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='engine_v3_ensure_outreach_draft'
  limit 1;
  if fn is not null then
    ddl := pg_get_functiondef(fn);
    ddl := replace(ddl, '''LabNarrative <khaled@labnarrative.com>''', '''Khaled Azzahrani <khaled@labnarrative.com>''');
    execute ddl;
  end if;

  select p.oid into fn
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='engine_v3_admin_outreach_save'
  limit 1;
  if fn is not null then
    ddl := pg_get_functiondef(fn);
    ddl := replace(ddl, '''LabNarrative <khaled@labnarrative.com>''', '''Khaled Azzahrani <khaled@labnarrative.com>''');
    execute ddl;
  end if;
end $$;

update public.outreach_messages
set sender_email='Khaled Azzahrani <khaled@labnarrative.com>', updated_at=now()
where status='draft'
  and sender_email='LabNarrative <khaled@labnarrative.com>';
