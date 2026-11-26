-- Soil projection provenance fix. Apply after 20261116230500_soil_github_actions_queue.sql.
-- Changes soil_complete only; queue, report storage, grants and RPC names are unchanged.
--  1. A soil_health row flagged SEEDED_PLACEHOLDER (test/default data) no longer blocks
--     the model projection. Real manual/lab rows still block it, exactly as before.
--  2. Only an earlier parcel-report projection row is reused. A seeded soilgrid row is
--     never overwritten in place (it kept seeded soil_type/texture next to model values);
--     a clean projection row is inserted instead and the seeded row stays for audit.
--  3. sample_count is the number of distinct SoilGrids source pixels, not zigzag positions:
--     positions inside one 250 m pixel are not independent samples.
--  4. lands soil summary columns follow the projection. The legacy soil_health → lands
--     trigger skips this whenever the land holds an older seeded test date, which left
--     seeded pH / OC / N-P-K on lands after a real fetch.
BEGIN;
CREATE OR REPLACE FUNCTION public.soil_complete(p_job uuid,p_lease uuid,p_report jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,extensions AS $$
DECLARE j public.soil_fetch_jobs%ROWTYPE; l public.lands%ROWTYPE; s_id uuid; p jsonb; prop text; dep text; layer jsonb; oc numeric;
BEGIN
  SELECT * INTO j FROM public.soil_fetch_jobs WHERE id=p_job FOR UPDATE;
  IF NOT FOUND OR j.status<>'running' OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_until<=now() THEN RETURN false; END IF;
  SELECT * INTO l FROM public.lands WHERE id=j.land_id FOR UPDATE;
  IF l.tenant_id IS DISTINCT FROM j.tenant_id OR l.farmer_id IS DISTINCT FROM j.farmer_id
    OR md5(ST_AsEWKB(l.boundary_geom)::text) IS DISTINCT FROM j.boundary_hash THEN
    UPDATE public.soil_fetch_jobs SET status='failed',error_code='LAND_CHANGED',updated_at=now() WHERE id=j.id;
    RETURN false;
  END IF;
  IF p_report->>'quality' IS NULL OR p_report->>'quality' NOT IN ('complete','partial')
    OR p_report->>'algorithm_version' IS DISTINCT FROM j.algorithm_version
    OR p_report->>'source_version' IS DISTINCT FROM j.source_version
    OR p_report->>'source' IS DISTINCT FROM 'ISRIC_SOILGRIDS'
    OR p_report->>'modelled_not_measured' IS DISTINCT FROM 'true'
    OR coalesce((p_report#>>'{sampling,generated_points}')::int,0) NOT BETWEEN 4 AND 20
    OR octet_length(p_report::text)>16000000 THEN RAISE EXCEPTION 'INVALID_REPORT'; END IF;
  FOREACH prop IN ARRAY ARRAY['phh2o','soc','nitrogen','sand','silt','clay','bdod','cec'] LOOP
    FOREACH dep IN ARRAY ARRAY['0-5cm','5-15cm','15-30cm'] LOOP
      layer:=p_report#>ARRAY['properties',prop,dep];
      IF layer IS NULL OR layer->>'quality' IS NULL OR layer->>'quality' NOT IN ('complete','partial','unavailable') THEN RAISE EXCEPTION 'INVALID_REPORT'; END IF;
      IF p_report->>'quality'='complete' AND (layer->>'quality'<>'complete' OR layer->>'mean' IS NULL) THEN RAISE EXCEPTION 'INVALID_REPORT'; END IF;
    END LOOP;
  END LOOP;
  INSERT INTO public.soil_parcel_reports(id,land_id,tenant_id,farmer_id,boundary_hash,source_version,algorithm_version,quality,report)
    VALUES(j.id,j.land_id,j.tenant_id,j.farmer_id,j.boundary_hash,j.source_version,j.algorithm_version,p_report->>'quality',p_report);
  -- Compatibility projection: only complete topsoil values. Preserve ALL manual/lab rows.
  -- No estimated plant-available N/P/K, fertility classification or laboratory test date.
  -- Rows flagged SEEDED_PLACEHOLDER are test/default data, not a manual or lab measurement.
  IF p_report->>'quality'='complete' AND NOT EXISTS(SELECT 1 FROM public.soil_health
    WHERE land_id=j.land_id AND source IS DISTINCT FROM 'soilgrid'
      AND NOT (coalesce(data_quality_flags,'[]'::jsonb) @> '["SEEDED_PLACEHOLDER"]'::jsonb)) THEN
    -- Reuse only an earlier projection of a parcel report; never a seeded/legacy soilgrid row.
    SELECT id INTO s_id FROM public.soil_health WHERE land_id=j.land_id AND tenant_id=j.tenant_id
      AND farmer_id=j.farmer_id AND source='soilgrid' AND data_quality_flags ? 'soil_parcel_report_id'
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF s_id IS NULL THEN
      INSERT INTO public.soil_health(land_id,tenant_id,farmer_id,source,test_date) VALUES(j.land_id,j.tenant_id,j.farmer_id,'soilgrid',NULL) RETURNING id INTO s_id;
    END IF;
    p:=p_report->'properties';
    UPDATE public.soil_health SET ph_level=(p#>>'{phh2o,0-5cm,mean}')::numeric,
      organic_carbon=(p#>>'{soc,0-5cm,mean}')::numeric,bulk_density=(p#>>'{bdod,0-5cm,mean}')::numeric,
      cec=(p#>>'{cec,0-5cm,mean}')::numeric,clay_percent=(p#>>'{clay,0-5cm,mean}')::numeric,
      sand_percent=(p#>>'{sand,0-5cm,mean}')::numeric,silt_percent=(p#>>'{silt,0-5cm,mean}')::numeric,
      nitrogen_kg_per_ha=NULL,phosphorus_kg_per_ha=NULL,potassium_kg_per_ha=NULL,
      nitrogen_total_kg=NULL,phosphorus_total_kg=NULL,potassium_total_kg=NULL,
      nitrogen_est=NULL,phosphorus_est=NULL,potassium_est=NULL,
      nitrogen_level=NULL,phosphorus_level=NULL,potassium_level=NULL,fertility_class=NULL,
      nitrogen_text=NULL,phosphorus_text=NULL,potassium_text=NULL,ph_text=NULL,organic_carbon_text=NULL,
      nitrogen_confidence=NULL,phosphorus_confidence=NULL,potassium_confidence=NULL,
      test_date=NULL,confidence_level=NULL,sample_count=(p#>>'{phh2o,0-5cm,distinct_pixels}')::int,
      field_area_ha=(p_report->>'area_m2')::numeric/10000,
      data_quality_flags=jsonb_build_object('soil_parcel_report_id',j.id,'depth_cm','0-5','modelled_not_measured',true,
        'sampling_positions',(p_report#>>'{sampling,generated_points}')::int),
      note='SoilGrids estimate, 0–5 cm. Full depth and pixel evidence in soil_parcel_reports. Not a laboratory test.',updated_at=now()
      WHERE id=s_id;
    -- lands.organic_carbon_percent is numeric(3,2); a value it cannot hold is left empty, not clipped.
    oc:=(p#>>'{soc,0-5cm,mean}')::numeric;
    UPDATE public.lands SET soil_ph=(p#>>'{phh2o,0-5cm,mean}')::numeric,
      organic_carbon_percent=CASE WHEN oc<10 THEN oc END,
      nitrogen_kg_per_ha=NULL,phosphorus_kg_per_ha=NULL,potassium_kg_per_ha=NULL,
      last_soil_test_date=NULL,soil_data_source='soilgrid',soil_confidence_level=NULL,updated_at=now()
      WHERE id=j.land_id;
  END IF;
  UPDATE public.soil_fetch_jobs SET status=p_report->>'quality',progress=100,lease_until=NULL,updated_at=now() WHERE id=j.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.soil_complete(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.soil_complete(uuid,uuid,jsonb) TO service_role;
COMMIT;
