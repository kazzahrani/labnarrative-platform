with seeded as (
  insert into public.tender_source_records (
    source_id,
    source_record_id,
    source_url,
    fetched_at,
    published_at,
    content_type,
    http_status,
    content_hash,
    raw_text,
    payload,
    document_urls
  )
  select
    t.source_id,
    coalesce(nullif(t.source_record_id,''), nullif(t.reference_number,''), nullif(t.tender_number,''), t.id::text),
    t.source_url,
    coalesce(t.source_indexed_at, t.updated_at, t.created_at, now()),
    t.published_at,
    'application/vnd.labnarrative.legacy-source+json',
    null,
    encode(digest(coalesce(t.raw_payload,'{}'::jsonb)::text, 'sha256'), 'hex'),
    null,
    coalesce(t.raw_payload,'{}'::jsonb),
    '[]'::jsonb
  from public.tenders t
  where t.source_record_uuid is null
  on conflict (source_id, source_record_id, content_hash) do update
    set source_url = excluded.source_url,
        published_at = excluded.published_at
  returning id, source_id, source_record_id, content_hash
)
update public.tenders t
set source_record_uuid = r.id,
    normalized_at = now()
from public.tender_source_records r
where t.source_record_uuid is null
  and r.source_id = t.source_id
  and r.source_record_id = coalesce(nullif(t.source_record_id,''), nullif(t.reference_number,''), nullif(t.tender_number,''), t.id::text)
  and r.content_hash = encode(digest(coalesce(t.raw_payload,'{}'::jsonb)::text, 'sha256'), 'hex');
