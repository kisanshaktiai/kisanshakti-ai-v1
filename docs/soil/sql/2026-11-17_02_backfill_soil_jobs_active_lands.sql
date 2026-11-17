-- Reviewable one-time backfill, NOT a migration. Run by hand only after review, and only
-- after: migration 20261117150000_soil_projection_provenance.sql, the seeded-row flag
-- (2026-11-17_01_flag_seeded_soil_health_rows.sql) and the updated lands-api are live.
--
-- Purpose: queue one SoilGrids parcel job for every active land through the SAME
-- soil_enqueue RPC the farmer button uses, so every land gets a real model report and
-- the seeded values stop reaching chat, schedule, analytics and proactive alerts.
-- soil_enqueue reuses a valid saved report ('cached') and an active job, so a second
-- run queues nothing new. A land it refuses (invalid boundary, rate limit) is reported
-- and skipped; the others still queue.
--
-- v_source MUST equal the lands-api secret SOILGRIDS_SOURCE_VERSION and the soil-engine
-- GitHub variable SOILGRIDS_SOURCE_VERSION. The live value on 2026-11-17 is below.
-- After running: GitHub → kisanshakti-soil-engine → Actions → "On-demand SoilGrids
-- processing" → Run workflow, with max_jobs 25 (about 100 s per land). Run it again
-- after it finishes until no job is queued (query 3).

-- 1. PREVIEW (read-only): active lands and whether each already has a valid report.
SELECT count(*) AS active_lands,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.soil_parcel_reports r
         WHERE r.land_id = l.id AND r.quality = 'complete' AND r.expires_at > now())) AS with_valid_report
FROM public.lands l
WHERE l.is_active AND l.deleted_at IS NULL;

-- 2. APPLY.
DO $$
DECLARE l record; r jsonb; queued_or_active integer := 0; cached integer := 0; skipped integer := 0;
  v_source constant text := 'soilgrids-2.0-2020';
BEGIN
  FOR l IN SELECT id, tenant_id, farmer_id FROM public.lands
           WHERE is_active AND deleted_at IS NULL ORDER BY created_at, id LOOP
    BEGIN
      r := public.soil_enqueue(l.id, l.tenant_id, l.farmer_id, v_source, 'parcel-native-area-zigzag-v2');
      IF r->>'status' = 'cached' THEN cached := cached + 1; ELSE queued_or_active := queued_or_active + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      skipped := skipped + 1;
      RAISE NOTICE 'land % skipped: %', l.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'queued_or_already_active=% cached=% skipped=%', queued_or_active, cached, skipped;
END $$;

-- 3. PROGRESS (read-only): re-run while the workflow processes the queue.
SELECT status, coalesce(error_code, '') AS error_code, count(*) AS jobs
FROM public.soil_fetch_jobs GROUP BY status, error_code ORDER BY status;
