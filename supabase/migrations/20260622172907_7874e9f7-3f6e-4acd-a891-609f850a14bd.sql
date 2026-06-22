-- ═══════════════════════════════════════════════════════════════════════════
-- WAVE A5 (Phase 2) — drop forensic-audit scratch tables and 2026-06-19 backups
-- ═══════════════════════════════════════════════════════════════════════════
-- These 12 tables are RLS-OFF scratch/backup artifacts referenced in audit
-- report 04-root-cause-analysis.md as dead weight. Provenance is captured
-- in `dropped_tables_archive` before each DROP.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Provenance archive (idempotent)
CREATE TABLE IF NOT EXISTS public.dropped_tables_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_count bigint,
  column_signature jsonb,
  dropped_at timestamptz NOT NULL DEFAULT now(),
  drop_reason text
);

GRANT SELECT ON public.dropped_tables_archive TO authenticated;
GRANT ALL ON public.dropped_tables_archive TO service_role;
ALTER TABLE public.dropped_tables_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_dropped_archive" ON public.dropped_tables_archive;
CREATE POLICY "service_role_full_dropped_archive"
  ON public.dropped_tables_archive
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Capture provenance + drop via a single PL/pgSQL block
DO $$
DECLARE
  t text;
  cnt bigint;
  cols jsonb;
  tables text[] := ARRAY[
    '_fa_canonical_hint_rice_backup_20260621',
    '_fa_content_gaps',
    '_fa_cross_crop_corruption',
    '_fa_findings',
    '_fa_hypothesis_condition_repair',
    '_fa_json_key_repair',
    '_fa_orphan_observations',
    '_fa_spelling_repair',
    '_fa_wildcard_repair',
    'decision_rules_bkp_20260619',
    'observation_aliases_bkp_20260619',
    'observation_master_bkp_20260619'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO cnt;

      SELECT jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type) ORDER BY ordinal_position)
        INTO cols
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t;

      INSERT INTO public.dropped_tables_archive (table_name, row_count, column_signature, drop_reason)
      VALUES (t, cnt, cols, 'Wave A5: forensic-audit scratch / pre-Wave-A backup table');

      EXECUTE format('DROP TABLE public.%I CASCADE', t);
      RAISE NOTICE 'Dropped public.% (% rows)', t, cnt;
    END IF;
  END LOOP;
END $$;