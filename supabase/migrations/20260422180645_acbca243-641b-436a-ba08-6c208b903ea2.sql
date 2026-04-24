-- =====================================================================
-- Phase 4 — Database Hygiene (additive, non-breaking) — corrected
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4A.1 Switch regular views to SECURITY INVOKER
-- ---------------------------------------------------------------------
ALTER VIEW public.hypotheses                  SET (security_invoker = true);
ALTER VIEW public.rule_authority_weights      SET (security_invoker = true);
ALTER VIEW public.security_audit_summary      SET (security_invoker = true);
ALTER VIEW public.v_active_scrapers           SET (security_invoker = true);
ALTER VIEW public.v_decision_rules_admin      SET (security_invoker = true);
ALTER VIEW public.v_missing_translations      SET (security_invoker = true);
ALTER VIEW public.v_recent_scraper_runs       SET (security_invoker = true);
ALTER VIEW public.v_scraper_performance       SET (security_invoker = true);
ALTER VIEW public.vw_latest_soil_data         SET (security_invoker = true);
ALTER VIEW public.vw_soil_summary             SET (security_invoker = true);
ALTER VIEW public.vw_zone_statistics          SET (security_invoker = true);

-- ---------------------------------------------------------------------
-- 4A.2 Containment for materialized views
--      (matviews don't support security_invoker; revoke instead)
-- ---------------------------------------------------------------------
REVOKE ALL ON public.farmer_upcoming_needs FROM anon, authenticated;
REVOKE ALL ON public.vw_rules_by_taxonomy   FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 4B. Containment for legacy backup / staging tables
--     Tables remain (no data loss) but anon/authenticated cannot read.
--     service_role keeps full access, so cron/admin jobs continue working.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  legacy_tables text[] := ARRAY[
    'decision_rules_backup_20260316',
    'decision_rules_translations_archive',
    'intent_observation_mapping_backup_2026_03',
    'observation_intent_master_backup_2026_03',
    'observation_master_backup_20260311',
    'observation_master_backup_20260316',
    'observation_master_backup_2026_03',
    'observation_translations_backup_20260316',
    'staging_mgrs_tiles',
    'staging_mgrs_tiles_wkb',
    'staging_mgrs_tiles_wkt',
    'staging_states'
  ];
BEGIN
  FOREACH t IN ARRAY legacy_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4C. Pin search_path = public on every SECURITY DEFINER function
--     in the public schema that lacks it. Signature-preserving.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid,
           n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
        )
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public',
        r.nspname, r.proname, r.args
      );
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipped %.%(%) — %', r.nspname, r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;