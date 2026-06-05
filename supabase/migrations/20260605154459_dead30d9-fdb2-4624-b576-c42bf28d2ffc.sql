-- Wave 5: Archive legacy *_backup_* tables out of the public schema.
-- Moves them into a dedicated `archive` schema so they no longer clutter
-- PostgREST, the Data API surface, or developer tooling, while remaining
-- recoverable if rollback is ever needed.

CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA archive TO service_role;

DO $$
DECLARE
  t text;
  backup_tables text[] := ARRAY[
    'backup_events',
    'decision_rules_backup_20260316',
    'intent_observation_mapping_backup_2026_03',
    'observation_intent_master_backup_2026_03',
    'observation_master_backup_20260311',
    'observation_master_backup_20260316',
    'observation_master_backup_2026_03',
    'observation_translations_backup_20260316'
  ];
BEGIN
  FOREACH t IN ARRAY backup_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA archive', t);
      EXECUTE format('REVOKE ALL ON archive.%I FROM PUBLIC, anon, authenticated', t);
      EXECUTE format('GRANT ALL ON archive.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;