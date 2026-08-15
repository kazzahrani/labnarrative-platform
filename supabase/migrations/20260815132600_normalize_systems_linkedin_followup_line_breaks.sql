create or replace function public.normalize_systems_linkedin_followup_text(p_text text)
returns text
language sql
immutable
as $$
  select case
    when p_text is null then null
    else btrim(
      regexp_replace(
        replace(
          replace(
            replace(p_text, E'\\r\\n', E'\n'),
            E'\\n', E'\n'
          ),
          E'\\r', E'\n'
        ),
        E'\n{3,}', E'\n\n', 'g'
      )
    )
  end;
$$;

create or replace function public.normalize_systems_linkedin_followup_fields()
returns trigger
language plpgsql
as $$
begin
  new.linkedin_followup := public.normalize_systems_linkedin_followup_text(new.linkedin_followup);
  new.linkedin_followup_ar := public.normalize_systems_linkedin_followup_text(new.linkedin_followup_ar);
  return new;
end;
$$;

drop trigger if exists normalize_systems_linkedin_followup_fields_trigger on public.systems_outreach_prospects;
create trigger normalize_systems_linkedin_followup_fields_trigger
before insert or update of linkedin_followup, linkedin_followup_ar
on public.systems_outreach_prospects
for each row
execute function public.normalize_systems_linkedin_followup_fields();

update public.systems_outreach_prospects
set linkedin_followup = public.normalize_systems_linkedin_followup_text(linkedin_followup),
    linkedin_followup_ar = public.normalize_systems_linkedin_followup_text(linkedin_followup_ar)
where linkedin_followup is not null or linkedin_followup_ar is not null;
