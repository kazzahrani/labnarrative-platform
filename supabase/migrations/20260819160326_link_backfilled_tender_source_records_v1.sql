update public.tenders t
set source_record_uuid = r.id,
    normalized_at = now()
from public.tender_source_records r
where t.source_record_uuid is null
  and r.source_id = t.source_id
  and r.source_record_id = coalesce(nullif(t.source_record_id,''), nullif(t.reference_number,''), nullif(t.tender_number,''), t.id::text)
  and r.content_hash = encode(digest(coalesce(t.raw_payload,'{}'::jsonb)::text, 'sha256'), 'hex');
