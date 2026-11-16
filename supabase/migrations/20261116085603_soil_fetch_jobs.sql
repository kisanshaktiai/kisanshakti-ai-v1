-- Service-only queue. Deploy and test in staging before production.
BEGIN;
CREATE TABLE public.soil_engine_workers (
  worker_id uuid PRIMARY KEY, source_version text NOT NULL,
  algorithm_version text NOT NULL, heartbeat_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.soil_fetch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  land_id uuid NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, farmer_id uuid NOT NULL,
  geometry jsonb NOT NULL, boundary_hash text NOT NULL,
  source_version text NOT NULL, algorithm_version text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','partial','failed')),
  attempts integer NOT NULL DEFAULT 0, progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  lease_token uuid, lease_until timestamptz, error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX soil_fetch_one_active ON public.soil_fetch_jobs(land_id) WHERE status IN ('queued','running');
CREATE INDEX soil_fetch_claim ON public.soil_fetch_jobs(status,created_at);
CREATE INDEX soil_fetch_land_history ON public.soil_fetch_jobs(tenant_id,land_id,created_at DESC);
CREATE TABLE public.soil_parcel_reports (
  id uuid PRIMARY KEY REFERENCES public.soil_fetch_jobs(id) ON DELETE CASCADE,
  land_id uuid NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, farmer_id uuid NOT NULL,
  boundary_hash text NOT NULL, source_version text NOT NULL, algorithm_version text NOT NULL,
  quality text NOT NULL CHECK(quality IN ('complete','partial')),
  report jsonb NOT NULL, retrieved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 months')
);
CREATE INDEX soil_parcel_latest ON public.soil_parcel_reports(tenant_id,land_id,retrieved_at DESC);
ALTER TABLE public.soil_engine_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soil_fetch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soil_parcel_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.soil_engine_workers,public.soil_fetch_jobs,public.soil_parcel_reports FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.soil_engine_workers,public.soil_fetch_jobs,public.soil_parcel_reports TO service_role;

CREATE FUNCTION public.soil_enqueue(p_land uuid,p_tenant uuid,p_farmer uuid,p_source text,p_algorithm text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,extensions AS $$
DECLARE l public.lands%ROWTYPE; j public.soil_fetch_jobs%ROWTYPE; r public.soil_parcel_reports%ROWTYPE; h text;
BEGIN
  SELECT * INTO l FROM public.lands WHERE id=p_land AND tenant_id=p_tenant AND farmer_id=p_farmer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LAND_NOT_FOUND'; END IF;
  IF l.boundary_geom IS NULL OR NOT ST_IsValid(l.boundary_geom) OR ST_IsEmpty(l.boundary_geom)
    OR ST_SRID(l.boundary_geom)<>4326 OR GeometryType(l.boundary_geom) NOT IN ('POLYGON','MULTIPOLYGON')
    OR ST_NPoints(l.boundary_geom)>4096 THEN RAISE EXCEPTION 'INVALID_BOUNDARY'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.soil_engine_workers WHERE source_version=p_source AND algorithm_version=p_algorithm
    AND heartbeat_at>now()-interval '2 minutes') THEN RAISE EXCEPTION 'ENGINE_OFFLINE'; END IF;
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

CREATE FUNCTION public.soil_claim(p_source text,p_algorithm text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j public.soil_fetch_jobs%ROWTYPE;
BEGIN
  UPDATE public.soil_fetch_jobs SET status='failed',error_code='WORKER_TIMEOUT',updated_at=now()
    WHERE status='running' AND lease_until<now() AND attempts>=3;
  SELECT * INTO j FROM public.soil_fetch_jobs WHERE source_version=p_source AND algorithm_version=p_algorithm
    AND attempts<3 AND (status='queued' OR (status='running' AND lease_until<now()))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.soil_fetch_jobs SET status='running',attempts=attempts+1,lease_token=gen_random_uuid(),
    lease_until=now()+interval '10 minutes',progress=0,error_code=NULL,updated_at=now()
    WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.soil_progress(p_job uuid,p_lease uuid,p_progress integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  UPDATE public.soil_fetch_jobs SET progress=greatest(progress,least(99,greatest(0,p_progress))),
    lease_until=now()+interval '10 minutes',updated_at=now()
    WHERE id=p_job AND lease_token=p_lease AND status='running' AND lease_until>now();
  RETURN FOUND;
END $$;
CREATE FUNCTION public.soil_fail(p_job uuid,p_lease uuid,p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  UPDATE public.soil_fetch_jobs SET status='failed',error_code=CASE WHEN p_code IN ('PROVIDER_UNAVAILABLE','INVALID_BOUNDARY','INVALID_REPORT')
    THEN p_code ELSE 'FETCH_FAILED' END,lease_until=NULL,updated_at=now()
    WHERE id=p_job AND lease_token=p_lease AND status='running' AND lease_until>now();
  RETURN FOUND;
END $$;

CREATE FUNCTION public.soil_complete(p_job uuid,p_lease uuid,p_report jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,extensions AS $$
DECLARE j public.soil_fetch_jobs%ROWTYPE; l public.lands%ROWTYPE; s_id uuid; p jsonb; prop text; dep text; layer jsonb;
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
  IF p_report->>'quality'='complete' AND NOT EXISTS(SELECT 1 FROM public.soil_health
    WHERE land_id=j.land_id AND source IS DISTINCT FROM 'soilgrid') THEN
    SELECT id INTO s_id FROM public.soil_health WHERE land_id=j.land_id AND tenant_id=j.tenant_id
      AND farmer_id=j.farmer_id AND source='soilgrid' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
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
      test_date=NULL,confidence_level=NULL,sample_count=(p_report#>>'{sampling,generated_points}')::int,
      field_area_ha=(p_report->>'area_m2')::numeric/10000,
      data_quality_flags=jsonb_build_object('soil_parcel_report_id',j.id,'depth_cm','0-5','modelled_not_measured',true),
      note='SoilGrids estimate, 0–5 cm. Full depth and pixel evidence in soil_parcel_reports. Not a laboratory test.',updated_at=now()
      WHERE id=s_id;
  END IF;
  UPDATE public.soil_fetch_jobs SET status=p_report->>'quality',progress=100,lease_until=NULL,updated_at=now() WHERE id=j.id;
  RETURN true;
END $$;
CREATE FUNCTION public.soil_state(p_land uuid,p_tenant uuid,p_farmer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,extensions AS $$
DECLARE l public.lands%ROWTYPE; j public.soil_fetch_jobs%ROWTYPE; r public.soil_parcel_reports%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.lands WHERE id=p_land AND tenant_id=p_tenant AND farmer_id=p_farmer;
  IF NOT FOUND THEN RAISE EXCEPTION 'LAND_NOT_FOUND'; END IF;
  SELECT * INTO j FROM public.soil_fetch_jobs WHERE land_id=p_land AND tenant_id=p_tenant AND farmer_id=p_farmer ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO r FROM public.soil_parcel_reports WHERE land_id=p_land AND tenant_id=p_tenant AND farmer_id=p_farmer ORDER BY retrieved_at DESC LIMIT 1;
  RETURN jsonb_build_object('job',CASE WHEN j.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id',j.id,'status',j.status,'progress',j.progress,'error_code',j.error_code,'updated_at',j.updated_at) END,
    'model',CASE WHEN r.id IS NULL THEN NULL ELSE to_jsonb(r)-'tenant_id'-'farmer_id' END,
    'boundary_changed',r.id IS NOT NULL AND r.boundary_hash IS DISTINCT FROM md5(ST_AsEWKB(l.boundary_geom)::text));
END $$;
REVOKE ALL ON FUNCTION public.soil_state(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.soil_state(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.soil_enqueue(uuid,uuid,uuid,text,text),public.soil_claim(text,text),
 public.soil_progress(uuid,uuid,integer),public.soil_fail(uuid,uuid,text),public.soil_complete(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.soil_enqueue(uuid,uuid,uuid,text,text),public.soil_claim(text,text),
 public.soil_progress(uuid,uuid,integer),public.soil_fail(uuid,uuid,text),public.soil_complete(uuid,uuid,jsonb) TO service_role;
COMMIT;
