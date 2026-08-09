create or replace function public.register_linkedin_outreach_after_initial_email()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
begin
  if new.prospect_id is not null
     and new.message_kind='initial'
     and new.is_test=false
     and new.status='sent' then
    insert into public.linkedin_outreach(prospect_id)
    values(new.prospect_id)
    on conflict (prospect_id) do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists outreach_messages_register_linkedin on public.outreach_messages;
create trigger outreach_messages_register_linkedin
after insert or update of status,message_kind,is_test,prospect_id on public.outreach_messages
for each row execute function public.register_linkedin_outreach_after_initial_email();
