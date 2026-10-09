-- Preserve a plain-language requirement/basis without building a parallel obligations model.
-- Existing records, scheduler dates, task links and audit triggers remain untouched.
alter table public.pvos_obligations
  add column if not exists requirement_text text;
comment on column public.pvos_obligations.requirement_text is
  'Why this company/product PV obligation exists; cite the source in source_type/source_reference.';
