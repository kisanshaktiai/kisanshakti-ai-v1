
CREATE OR REPLACE FUNCTION public.mark_provisional_stage_triggers() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
DROP FUNCTION public.mark_provisional_stage_triggers();

DO $mig$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'resolve_crop_phenology'
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_cultivation_method%';

  v_src := replace(
    v_src,
    'IN (''das'', ''dat'') THEN',
    'IN (''das'', ''dat'', ''autonomous_init'') THEN'
  );

  EXECUTE v_src;
END
$mig$;
