CREATE OR REPLACE FUNCTION public.stc_eval_single(p_type text, p_cfg jsonb, p_land_id uuid, p_das integer, p_dat integer, p_gdd numeric)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_min numeric; v_max numeric; v_code text; v_within int; v_event text; v_stage uuid; v_conf numeric;
BEGIN
  IF p_cfg IS NULL THEN RETURN false; END IF;
  IF p_type = 'das' THEN
    v_min := (p_cfg->>'min')::numeric; v_max := NULLIF(p_cfg->>'max','')::numeric;
    IF p_das IS NULL THEN RETURN false; END IF;
    RETURN (v_min IS NULL OR p_das >= v_min) AND (v_max IS NULL OR p_das <= v_max);
  ELSIF p_type = 'dat' THEN
    v_min := (p_cfg->>'min')::numeric; v_max := NULLIF(p_cfg->>'max','')::numeric;
    IF p_dat IS NULL THEN RETURN false; END IF;
    RETURN (v_min IS NULL OR p_dat >= v_min) AND (v_max IS NULL OR p_dat <= v_max);
  ELSIF p_type = 'gdd' THEN
    v_min := (p_cfg->>'min')::numeric; v_max := NULLIF(p_cfg->>'max','')::numeric;
    IF p_gdd IS NULL THEN RETURN false; END IF;
    RETURN (v_min IS NULL OR p_gdd >= v_min) AND (v_max IS NULL OR p_gdd <= v_max);
  ELSIF p_type = 'observation' THEN
    v_code := p_cfg->>'code'; v_within := NULLIF(p_cfg->>'within_days','')::int;
    IF v_code IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (SELECT 1 FROM public.crop_lifecycle_events cle WHERE cle.land_id=p_land_id AND upper(cle.event_type)=upper(v_code) AND (v_within IS NULL OR cle.created_at >= now()-make_interval(days=>v_within)));
  ELSIF p_type = 'event' THEN
    v_event := p_cfg->>'event_type'; v_within := NULLIF(p_cfg->>'within_days','')::int;
    IF v_event IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (SELECT 1 FROM public.crop_lifecycle_events cle WHERE cle.land_id=p_land_id AND (upper(cle.event_type)=upper(v_event) OR upper(coalesce(cle.to_status,''))=upper(v_event)) AND (v_within IS NULL OR cle.created_at >= now()-make_interval(days=>v_within)));
  ELSIF p_type = 'morphology_stage' THEN
    v_stage := NULLIF(p_cfg->>'stage_uuid','')::uuid; v_code := p_cfg->>'stage_code'; v_within := coalesce(NULLIF(p_cfg->>'within_days','')::int,21); v_conf := coalesce(NULLIF(p_cfg->>'min_confidence','')::numeric,0.6);
    IF v_stage IS NULL AND v_code IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.crop_growth_analysis cga
      WHERE cga.land_id=p_land_id AND cga.detected_growth_stage IS NOT NULL
        AND cga.created_at >= now()-make_interval(days=>v_within)
        AND coalesce(cga.confidence_score,1) >= v_conf
        AND (
          upper(regexp_replace(cga.detected_growth_stage,'[^a-zA-Z0-9]+','_','g'))=upper(coalesce(v_code,''))
          OR EXISTS (SELECT 1 FROM public.crop_stage_master csm WHERE csm.id=v_stage AND upper(regexp_replace(cga.detected_growth_stage,'[^a-zA-Z0-9]+','_','g'))=upper(regexp_replace(coalesce(csm.growth_stage,''),'[^a-zA-Z0-9]+','_','g')))
          OR EXISTS (SELECT 1 FROM public.crop_stage_aliases csa WHERE csa.canonical_id=v_stage AND upper(regexp_replace(csa.alias_text,'[^a-zA-Z0-9]+','_','g'))=upper(regexp_replace(cga.detected_growth_stage,'[^a-zA-Z0-9]+','_','g')))
        )
    );
  ELSIF p_type = 'ndvi' THEN
    v_min := NULLIF(p_cfg->>'min','')::numeric; v_max := NULLIF(p_cfg->>'max','')::numeric; v_within := coalesce(NULLIF(p_cfg->>'within_days','')::int,21);
    RETURN EXISTS (
      SELECT 1 FROM public.ndvi_data nd
      WHERE nd.land_id=p_land_id AND nd.date >= current_date-v_within
        AND coalesce(nd.mean_ndvi,nd.ndvi_value) IS NOT NULL
        AND coalesce(nd.coverage_percentage,nd.coverage,0) > 15
        AND (coalesce(nd.cloud_cover,nd.cloud_coverage) IS NULL OR coalesce(nd.cloud_cover,nd.cloud_coverage) < 40)
        AND (v_min IS NULL OR coalesce(nd.mean_ndvi,nd.ndvi_value) >= v_min)
        AND (v_max IS NULL OR coalesce(nd.mean_ndvi,nd.ndvi_value) <= v_max)
    );
  END IF;
  RETURN false;
END;
$function$;