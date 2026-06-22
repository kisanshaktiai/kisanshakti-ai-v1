-- Helper: returns mode of soil/water/irrigation/crop among lands within radius_m
-- of (lat, lng) for the given tenant. Used by lands-api?action=infer-context.
CREATE OR REPLACE FUNCTION public.nearest_lands_summary(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_neighbor_count integer := 0;
  v_soil text;
  v_water text;
  v_irrigation text;
  v_crop text;
  v_crop_id uuid;
BEGIN
  -- Count neighbors using a simple bounding-box + haversine in degrees fallback.
  -- Uses center_lat/center_lon (always populated on create) to avoid a hard
  -- dependency on the PostGIS boundary_geom column.
  WITH neighbors AS (
    SELECT
      l.soil_type,
      l.water_source,
      l.irrigation_type,
      l.current_crop,
      l.current_crop_id
    FROM public.lands l
    WHERE l.tenant_id = p_tenant_id
      AND l.is_active = true
      AND l.deleted_at IS NULL
      AND l.center_lat IS NOT NULL
      AND l.center_lon IS NOT NULL
      -- Cheap bounding box (≈ p_radius_m / 111_000 degrees latitude)
      AND l.center_lat BETWEEN p_lat - (p_radius_m::float / 111000.0)
                           AND p_lat + (p_radius_m::float / 111000.0)
      AND l.center_lon BETWEEN p_lng - (p_radius_m::float / (111000.0 * GREATEST(cos(radians(p_lat)), 0.01)))
                           AND p_lng + (p_radius_m::float / (111000.0 * GREATEST(cos(radians(p_lat)), 0.01)))
    LIMIT 50
  )
  SELECT COUNT(*) INTO v_neighbor_count FROM neighbors;

  IF v_neighbor_count = 0 THEN
    RETURN jsonb_build_object(
      'neighbor_count', 0,
      'soil_type', NULL,
      'water_source', NULL,
      'irrigation_type', NULL,
      'current_crop', NULL,
      'current_crop_id', NULL
    );
  END IF;

  SELECT soil_type INTO v_soil
  FROM (
    SELECT soil_type, COUNT(*) c
    FROM public.lands
    WHERE tenant_id = p_tenant_id AND is_active = true AND deleted_at IS NULL
      AND soil_type IS NOT NULL
      AND center_lat BETWEEN p_lat - (p_radius_m::float / 111000.0) AND p_lat + (p_radius_m::float / 111000.0)
      AND center_lon BETWEEN p_lng - (p_radius_m::float / (111000.0 * GREATEST(cos(radians(p_lat)), 0.01)))
                         AND p_lng + (p_radius_m::float / (111000.0 * GREATEST(cos(radians(p_lat)), 0.01)))
    GROUP BY soil_type ORDER BY c DESC LIMIT 1
  ) x;

  SELECT water_source INTO v_water
  FROM (
    SELECT water_source, COUNT(*) c
    FROM public.lands
    WHERE tenant_id = p_tenant_id AND is_active = true AND deleted_at IS NULL
      AND water_source IS NOT NULL
      AND center_lat BETWEEN p_lat - (p_radius_m::float / 111000.0) AND p_lat + (p_radius_m::float / 111000.0)
      AND center_lon BETWEEN p_lng - (p_radius_m::float / (111000.0 * GREATEST(cos(radians(p_lat)), 0.01)))
                         AND p_lng + (p_radius_m::float / (111000.0 * GREATEST(cos(radians(p_lat)), 0.01)))
    GROUP BY water_source ORDER BY c DESC LIMIT 1
  ) x;

  SELECT irrigation_type INTO v_irrigation
  FROM (
    SELECT irrigation_type, COUNT(*) c
    FROM public.lands
    WHERE tenant_id = p_tenant_id AND is_active = true AND deleted_at IS NULL
      AND irrigation_type IS NOT NULL
      AND center_lat BETWEEN p_lat - (p_radius_m::float / 111000.0) AND p_lat + (p_radius_m::float / 111000.0)
      AND center_lon BETWEEN p_lng - (p_radius_m::float / (111000.0 * GREATEST(cos(radians(p_lat)), 0.01)))
                         AND p_lng + (p_radius_m::float / (111000.0 * GREATEST(cos(radians(p_lat)), 0.01)))
    GROUP BY irrigation_type ORDER BY c DESC LIMIT 1
  ) x;

  SELECT current_crop, current_crop_id INTO v_crop, v_crop_id
  FROM (
    SELECT current_crop, current_crop_id, COUNT(*) c
    FROM public.lands
    WHERE tenant_id = p_tenant_id AND is_active = true AND deleted_at IS NULL
      AND current_crop IS NOT NULL
      AND center_lat BETWEEN p_lat - (p_radius_m::float / 111000.0) AND p_lat + (p_radius_m::float / 111000.0)
      AND center_lon BETWEEN p_lng - (p_radius_m::float / (111000.0 * GREATEST(cos(radians(p_lat)), 0.01)))
                         AND p_lng + (p_radius_m::float / (111000.0 * GREATEST(cos(radians(p_lat)), 0.01)))
    GROUP BY current_crop, current_crop_id ORDER BY c DESC LIMIT 1
  ) x;

  RETURN jsonb_build_object(
    'neighbor_count', v_neighbor_count,
    'soil_type', v_soil,
    'water_source', v_water,
    'irrigation_type', v_irrigation,
    'current_crop', v_crop,
    'current_crop_id', v_crop_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.nearest_lands_summary(double precision, double precision, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nearest_lands_summary(double precision, double precision, integer, uuid) TO authenticated, service_role;
