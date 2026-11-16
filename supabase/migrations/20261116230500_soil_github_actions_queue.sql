-- Move to durable queue dispatch, independent of an always-on container.
-- GitHub Actions processes jobs asynchronously; apply only after dispatch workflow is configured.
BEGIN;
CREATE OR REPLACE FUNCTION public.soil_enqueue(p_land uuid,p_tenant uuid,p_farmer uuid,p_source text,p_algorithm text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,extensions AS $$
DECLARE l public.lands%ROWTYPE; j public.soil_fetch_jobs%ROWTYPE; r public.soil_parcel_reports%ROWTYPE; h text;
BEGIN
  SELECT * INTO l FROM public.lands WHERE id=p_land AND tenant_id=p_tenant AND farmer_id=p_farmer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LAND_NOT_FOUND'; END IF;
  IF l.boundary_geom IS NULL OR NOT ST_IsValid(l.boundary_geom) OR ST_IsEmpty(l.boundary_geom)
    OR ST_SRID(l.boundary_geom)<>4326 OR GeometryType(l.boundary_geom) NOT IN ('POLYGON','MULTIPOLYGON')
    OR ST_NPoints(l.boundary_geom)>4096 THEN RAISE EXCEPTION 'INVALID_BOUNDARY'; END IF;
  -- GitHub-hosted runners are ephemeral; no persistent worker heartbeat is required.
  h := md5(ST_AsEWKB(l.boundary_geom)::text);
  SELECT * INTO r FROM public.soil_parcel_reports WHERE land_id=p_land AND tenant_id=p_tenant AND farmer_id=p_farmer
    AND boundary_hash=h AND source_version=p_source AND algorithm_version=p_algorithm AND quality='complete'
    AND expires_at>now() ORDER BY retrieved_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('status','cached','report_id',r.id); END IF;
  SELECT * INTO j FROM public.soil_fetch_jobs WHERE land_id=p_land AND status IN ('queued','running') LIMIT 1;
  IF FOUND THEN
    IF j.boundary_hash=h AND j.source_version=p_source AND j.algorithm_version=p_algorithm
      AND j.tenant_id=p_tenant AND j.farmer_id=p_farmer THEN
      RETURN jsonb_build_object('status',j.status,'job_id',j.id);
    END IF;
    UPDATE public.soil_fetch_jobs SET status='failed',error_code='SUPERSEDED',updated_at=now() WHERE id=j.id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.soil_fetch_jobs WHERE land_id=p_land AND created_at>now()-interval '1 minute')
    OR (SELECT count(*) FROM public.soil_fetch_jobs WHERE land_id=p_land AND created_at>now()-interval '1 day')>=5
    THEN RAISE EXCEPTION 'RETRY_LATER'; END IF;
  INSERT INTO public.soil_fetch_jobs(land_id,tenant_id,farmer_id,geometry,boundary_hash,source_version,algorithm_version)
    VALUES(p_land,p_tenant,p_farmer,ST_AsGeoJSON(l.boundary_geom)::jsonb,h,p_source,p_algorithm) RETURNING * INTO j;
  RETURN jsonb_build_object('status',j.status,'job_id',j.id);
END $$;

COMMIT;
