-- Reviewable data change, NOT a migration. Run by hand only after review.
-- Run after migration 20261117150000_soil_projection_provenance.sql.
--
-- Purpose: mark the 36 seeded soil_health rows (test / regional-default data that was
-- never measured on the land) so that
--   * soil_complete no longer treats them as a manual/lab measurement, and
--   * lands-api?action=soil no longer shows them to the farmer as a saved report.
-- Nothing is deleted and no value is changed. Only the marker SEEDED_PLACEHOLDER is
-- appended to data_quality_flags (these 36 rows hold a JSON array there today).
--
-- The two soil_health triggers are held off for this one statement only, because both
-- would act on a flag-only UPDATE:
--   trg_soil_health_to_spine           re-inserts the seeded pH/OC/N/P/K into
--                                      env_observations as new observations
--                                      (its dedup key contains issue_time = now()).
--   trigger_update_lands_from_soil_health  re-copies the seeded values onto lands.
-- The DO block is one transaction: on any error the triggers stay enabled and no row changes.

-- 1. PREVIEW (read-only). Expected: manual 10, soilgrid 7, soilgrid 19 = 36 rows.
SELECT source, note, count(*) AS rows_to_flag
FROM public.soil_health
WHERE NOT (coalesce(data_quality_flags,'[]'::jsonb) @> '["SEEDED_PLACEHOLDER"]'::jsonb)
  AND jsonb_typeof(coalesce(data_quality_flags,'[]'::jsonb)) = 'array'
  AND ((source = 'manual'   AND note = 'Testing dataset based on typical soil health values of Kolhapur district sugarcane farms')
    OR (source = 'soilgrid' AND note IN ('Kolhapur regional default (black cotton soil)','Migrated from lands table data')))
GROUP BY source, note ORDER BY source, note;

-- 2. APPLY.
DO $$
DECLARE n integer; already integer;
BEGIN
  SELECT count(*) INTO already FROM public.soil_health
   WHERE coalesce(data_quality_flags,'[]'::jsonb) @> '["SEEDED_PLACEHOLDER"]'::jsonb;
  ALTER TABLE public.soil_health DISABLE TRIGGER trg_soil_health_to_spine;
  ALTER TABLE public.soil_health DISABLE TRIGGER trigger_update_lands_from_soil_health;
  UPDATE public.soil_health
     SET data_quality_flags = coalesce(data_quality_flags,'[]'::jsonb) || '["SEEDED_PLACEHOLDER"]'::jsonb
   WHERE NOT (coalesce(data_quality_flags,'[]'::jsonb) @> '["SEEDED_PLACEHOLDER"]'::jsonb)
     AND jsonb_typeof(coalesce(data_quality_flags,'[]'::jsonb)) = 'array'
     AND ((source = 'manual'   AND note = 'Testing dataset based on typical soil health values of Kolhapur district sugarcane farms')
       OR (source = 'soilgrid' AND note IN ('Kolhapur regional default (black cotton soil)','Migrated from lands table data')));
  GET DIAGNOSTICS n = ROW_COUNT;
  ALTER TABLE public.soil_health ENABLE TRIGGER trg_soil_health_to_spine;
  ALTER TABLE public.soil_health ENABLE TRIGGER trigger_update_lands_from_soil_health;
  IF n = 0 AND already = 36 THEN
    RAISE NOTICE 'Already applied: 36 rows carry SEEDED_PLACEHOLDER';
  ELSIF n <> 36 THEN
    RAISE EXCEPTION 'Expected 36 seeded rows, matched % (already flagged %). Nothing changed.', n, already;
  END IF;
END $$;

-- 3. VERIFY (read-only). Expected: 36 flagged rows; both triggers enabled ('O').
SELECT count(*) AS flagged_rows FROM public.soil_health
 WHERE coalesce(data_quality_flags,'[]'::jsonb) @> '["SEEDED_PLACEHOLDER"]'::jsonb;
SELECT tgname, tgenabled FROM pg_trigger
 WHERE tgrelid = 'public.soil_health'::regclass AND NOT tgisinternal ORDER BY tgname;

-- ROLLBACK (only if needed): removes the marker, nothing else.
-- DO $$ BEGIN
--   ALTER TABLE public.soil_health DISABLE TRIGGER trg_soil_health_to_spine;
--   ALTER TABLE public.soil_health DISABLE TRIGGER trigger_update_lands_from_soil_health;
--   UPDATE public.soil_health SET data_quality_flags = data_quality_flags - 'SEEDED_PLACEHOLDER'
--    WHERE jsonb_typeof(data_quality_flags) = 'array' AND data_quality_flags @> '["SEEDED_PLACEHOLDER"]'::jsonb;
--   ALTER TABLE public.soil_health ENABLE TRIGGER trg_soil_health_to_spine;
--   ALTER TABLE public.soil_health ENABLE TRIGGER trigger_update_lands_from_soil_health;
-- END $$;
