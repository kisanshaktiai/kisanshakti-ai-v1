-- Create function to insert land with PostGIS geometry from WKT
CREATE OR REPLACE FUNCTION public.insert_land_with_geometry(
  p_farmer_id UUID,
  p_tenant_id UUID,
  p_name TEXT,
  p_ownership_type TEXT,
  p_area_acres NUMERIC,
  p_survey_number TEXT DEFAULT NULL,
  p_state_id UUID DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_district_id UUID DEFAULT NULL,
  p_district TEXT DEFAULT NULL,
  p_taluka_id UUID DEFAULT NULL,
  p_taluka TEXT DEFAULT NULL,
  p_village_id UUID DEFAULT NULL,
  p_village TEXT DEFAULT NULL,
  p_soil_type TEXT DEFAULT NULL,
  p_water_source TEXT DEFAULT NULL,
  p_irrigation_type TEXT DEFAULT NULL,
  p_current_crop TEXT DEFAULT NULL,
  p_previous_crop TEXT DEFAULT NULL,
  p_cultivation_date DATE DEFAULT NULL,
  p_last_harvest_date DATE DEFAULT NULL,
  p_area_guntas NUMERIC DEFAULT NULL,
  p_area_sqft NUMERIC DEFAULT NULL,
  p_boundary_wkt TEXT DEFAULT NULL,
  p_center_wkt TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_land_id UUID;
  v_result JSON;
BEGIN
  -- Insert land record with geometry conversion from WKT
  INSERT INTO public.lands (
    farmer_id,
    tenant_id,
    name,
    ownership_type,
    area_acres,
    survey_number,
    state_id,
    state,
    district_id,
    district,
    taluka_id,
    taluka,
    village_id,
    village,
    soil_type,
    water_source,
    irrigation_type,
    current_crop,
    previous_crop,
    cultivation_date,
    last_harvest_date,
    area_guntas,
    area_sqft,
    boundary_polygon_old,
    center_point_old,
    boundary_method,
    gps_accuracy_meters,
    gps_recorded_at,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    p_farmer_id,
    p_tenant_id,
    p_name,
    p_ownership_type,
    p_area_acres,
    p_survey_number,
    p_state_id,
    p_state,
    p_district_id,
    p_district,
    p_taluka_id,
    p_taluka,
    p_village_id,
    p_village,
    p_soil_type,
    p_water_source,
    p_irrigation_type,
    p_current_crop,
    p_previous_crop,
    p_cultivation_date,
    p_last_harvest_date,
    p_area_guntas,
    p_area_sqft,
    CASE WHEN p_boundary_wkt IS NOT NULL THEN ST_GeomFromText(p_boundary_wkt, 4326) ELSE NULL END,
    CASE WHEN p_center_wkt IS NOT NULL THEN ST_GeomFromText(p_center_wkt, 4326) ELSE NULL END,
    CASE WHEN p_boundary_wkt IS NOT NULL THEN 'gps_points' ELSE NULL END,
    CASE WHEN p_boundary_wkt IS NOT NULL THEN 10 ELSE NULL END,
    CASE WHEN p_boundary_wkt IS NOT NULL THEN NOW() ELSE NULL END,
    true,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_land_id;

  -- Fetch and return the inserted record as JSON
  SELECT row_to_json(lands.*) INTO v_result
  FROM public.lands
  WHERE id = v_land_id;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.insert_land_with_geometry TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_land_with_geometry TO anon;
GRANT EXECUTE ON FUNCTION public.insert_land_with_geometry TO service_role;