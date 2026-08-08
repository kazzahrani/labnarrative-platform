-- Switch future Engine v2 builds from Dobbelstein Editorial to the existing Narita design variant.
-- Existing sites are intentionally untouched.

DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.engine_v2_ingest_build(uuid,jsonb)'::regprocedure)
    INTO v_definition;

  IF position('dobbelstein-editorial-v1' in v_definition) = 0 THEN
    RAISE EXCEPTION 'expected_engine_v2_default_variant_not_found';
  END IF;

  v_definition := replace(
    v_definition,
    'dobbelstein-editorial-v1',
    'ciribilli-narita-v1'
  );

  EXECUTE v_definition;
END
$migration$;
