-- Keep authoritative ISSNs intact; configure only API routes verified on 7 October 2026.
-- Direct access limitations remain explicit and are carried into automatic run reports.
update public.pvos_literature_sources
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
  'crossref_issns',jsonb_build_array('1658-8312'),
  'crossref_unavailable_issns',jsonb_build_array('1658-8592'),
  'crossref_route_verified_at',now(),
  'crossref_route_evidence',jsonb_build_object('issn','1658-8312','http_status',200,'total_registered_works',30,'online_route_http_status',404),
  'coverage_limitation','Publisher feed is blocked. Current-issue and same-day coverage are not verified; Crossref metadata is a fallback.',
  'connector_status','active'
), updated_at=now()
where metadata->>'print_issn'='1658-8312' and metadata->>'connector'='lww_crossref';

update public.pvos_literature_sources
set method='api', metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
  'connector','crossref_journal',
  'crossref_backfill_pending',true,
  'crossref_backfill_start','2026-01-01',
  'crossref_issns',jsonb_build_array('1658-645X'),
  'crossref_route_verified_at',now(),
  'crossref_route_evidence',jsonb_build_object('issn','1658-645X','http_status',200,'total_registered_works',528,'sample_2026_doi','10.5455/mjhs.2026.03.016'),
  'connector_status','active',
  'direct_monitoring_status','error',
  'coverage_limitation','Direct journal pages are unavailable. Crossref metadata monitoring is active; publisher deposit delays can delay detection.',
  'connector_change_reason','Verified Crossref fallback for unavailable direct journal snapshots'
), updated_at=now()
where metadata->>'print_issn'='1658-645X' and metadata->>'connector'='open_web_snapshot';
