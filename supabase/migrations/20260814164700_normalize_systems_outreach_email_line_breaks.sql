create or replace function public.normalize_systems_outreach_draft_text(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_text is null then null
    else btrim(
      replace(
        replace(
          replace(p_text, chr(92) || 'r' || chr(92) || 'n', chr(10)),
          chr(92) || 'n', chr(10)
        ),
        chr(13), ''
      )
    )
  end
$$;

create or replace function public.normalize_systems_outreach_drafts_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email_body := public.normalize_systems_outreach_draft_text(new.email_body);
  new.followup_1 := public.normalize_systems_outreach_draft_text(new.followup_1);
  new.followup_2 := public.normalize_systems_outreach_draft_text(new.followup_2);
  return new;
end
$$;

drop trigger if exists systems_outreach_normalize_drafts_before_write on public.systems_outreach_prospects;
create trigger systems_outreach_normalize_drafts_before_write
before insert or update of email_body, followup_1, followup_2
on public.systems_outreach_prospects
for each row
execute function public.normalize_systems_outreach_drafts_before_write();

update public.systems_outreach_prospects
set email_body = public.normalize_systems_outreach_draft_text(email_body),
    followup_1 = public.normalize_systems_outreach_draft_text(followup_1),
    followup_2 = public.normalize_systems_outreach_draft_text(followup_2),
    updated_at = now()
where strpos(coalesce(email_body,''), chr(92)||'n') > 0
   or strpos(coalesce(followup_1,''), chr(92)||'n') > 0
   or strpos(coalesce(followup_2,''), chr(92)||'n') > 0
   or strpos(coalesce(email_body,''), chr(92)||'r'||chr(92)||'n') > 0
   or strpos(coalesce(followup_1,''), chr(92)||'r'||chr(92)||'n') > 0
   or strpos(coalesce(followup_2,''), chr(92)||'r'||chr(92)||'n') > 0;

update public.systems_outreach_messages
set body_text = public.normalize_systems_outreach_draft_text(body_text),
    body_html = '',
    updated_at = now()
where status in ('draft','scheduled','sending')
  and (
    strpos(coalesce(body_text,''), chr(92)||'n') > 0
    or strpos(coalesce(body_text,''), chr(92)||'r'||chr(92)||'n') > 0
  );