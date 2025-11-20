-- =====================================================
-- PHASE 1: Fix Security Definer Views → SECURITY INVOKER
-- =====================================================

-- 1. active_subscriptions
DROP VIEW IF EXISTS active_subscriptions CASCADE;
CREATE OR REPLACE VIEW active_subscriptions
WITH (security_invoker = true) AS
SELECT s.id, s.farmer_id, s.tenant_id, s.plan_id, s.payment_gateway, s.payment_id,
    s.amount, s.currency, s.status, s.start_date, s.end_date, s.auto_renew,
    s.activation_code_id, s.metadata, s.archived, s.created_at, s.updated_at,
    f.farmer_name, f.mobile_number, t.name AS tenant_name,
    p.title AS plan_title, p.duration_days
FROM subscriptions s
JOIN farmers f ON s.farmer_id = f.id
JOIN tenants t ON s.tenant_id = t.id
JOIN plans p ON s.plan_id = p.id
WHERE s.status = 'active' AND s.archived = false 
  AND (s.end_date IS NULL OR s.end_date > now());

GRANT SELECT ON active_subscriptions TO authenticated, anon;

-- 2. land_agent_context
DROP VIEW IF EXISTS land_agent_context CASCADE;
CREATE OR REPLACE VIEW land_agent_context
WITH (security_invoker = true) AS
SELECT l.id AS land_id, l.tenant_id, l.farmer_id, l.name AS land_name,
    l.area_acres, l.area_guntas, l.soil_type, l.water_source, l.irrigation_type,
    l.current_crop, l.previous_crop, l.cultivation_date, l.last_harvest_date,
    l.state, l.district, l.taluka, l.village, l.survey_number,
    l.boundary_polygon_old, l.center_point_old,
    f.farmer_name, f.mobile_number AS farmer_phone,
    f.language_preference AS farmer_language, f.location AS farmer_location,
    COALESCE((
      SELECT jsonb_build_object(
        'current', jsonb_build_object(
          'temperature', wc.temperature_celsius, 'feels_like', wc.feels_like_celsius,
          'humidity', wc.humidity_percent, 'pressure', wc.pressure_hpa,
          'wind_speed', wc.wind_speed_kmh, 'wind_direction', wc.wind_direction_degrees,
          'rainfall_1h', wc.rain_1h_mm, 'rainfall_24h', wc.rain_24h_mm,
          'cloud_cover', wc.cloud_cover_percent, 'weather_main', wc.weather_main,
          'weather_description', wc.weather_description, 'uv_index', wc.uv_index,
          'evapotranspiration', wc.evapotranspiration_mm,
          'soil_temperature', wc.soil_temperature_celsius,
          'soil_moisture', wc.soil_moisture_percent, 'observation_time', wc.observation_time
        ),
        'historical', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'date', wh.record_date, 'temperature_avg', wh.temperature_avg_celsius,
            'temperature_max', wh.temperature_max_celsius, 'temperature_min', wh.temperature_min_celsius,
            'humidity', wh.humidity_avg_percent, 'rainfall', wh.rainfall_mm,
            'wind_speed', wh.wind_speed_avg_kmh, 'evapotranspiration', wh.evapotranspiration_mm,
            'growing_degree_days', wh.growing_degree_days
          ) ORDER BY wh.record_date DESC)
          FROM weather_historical wh
          WHERE wh.latitude::text = substring(l.center_point_old::text, '\(([-0-9.]+),')
            AND wh.longitude::text = substring(l.center_point_old::text, ',([-0-9.]+)\)')
            AND wh.record_date >= CURRENT_DATE - INTERVAL '7 days'
          LIMIT 7
        ), '[]'::jsonb)
      )
      FROM weather_current wc
      WHERE wc.latitude::text = substring(l.center_point_old::text, '\(([-0-9.]+),')
        AND wc.longitude::text = substring(l.center_point_old::text, ',([-0-9.]+)\)')
      LIMIT 1
    ), jsonb_build_object('current', '{}', 'historical', '[]')) AS weather_data
FROM lands l
JOIN farmers f ON f.id = l.farmer_id AND f.tenant_id = l.tenant_id
WHERE l.is_active = true;

GRANT SELECT ON land_agent_context TO authenticated, anon;

-- 3. land_boundary_overlaps
DROP VIEW IF EXISTS land_boundary_overlaps CASCADE;
CREATE OR REPLACE VIEW land_boundary_overlaps
WITH (security_invoker = true) AS
SELECT a.id AS land_a_id, a.name AS land_a_name, a.tenant_id, b.id AS land_b_id, b.name AS land_b_name,
    st_area(st_intersection(a.boundary_geom, b.boundary_geom)::geography) AS overlap_area_sqm,
    st_area(a.boundary_geom::geography) AS land_a_area_sqm,
    st_area(b.boundary_geom::geography) AS land_b_area_sqm,
    round((st_area(st_intersection(a.boundary_geom, b.boundary_geom)::geography) / 
      st_area(a.boundary_geom::geography) * 100)::numeric, 2) AS overlap_percent_of_a
FROM lands a
JOIN lands b ON a.tenant_id = b.tenant_id AND a.id < b.id
WHERE st_intersects(a.boundary_geom, b.boundary_geom)
  AND st_area(st_intersection(a.boundary_geom, b.boundary_geom)::geography) > 10
  AND a.deleted_at IS NULL AND b.deleted_at IS NULL;

GRANT SELECT ON land_boundary_overlaps TO authenticated, anon;

-- 4. land_tile_coverage
DROP VIEW IF EXISTS land_tile_coverage CASCADE;
CREATE OR REPLACE VIEW land_tile_coverage
WITH (security_invoker = true) AS
SELECT l.id AS land_id, l.name AS land_name, l.tenant_id, st.tile_id,
    st.acquisition_date, st.cloud_cover,
    round((st_area(st_intersection(l.boundary_geom, st.bbox_geom)::geography) / 
      st_area(l.boundary_geom::geography) * 100)::numeric, 2) AS coverage_percent,
    CASE
      WHEN nd.id IS NOT NULL THEN 'processed'
      WHEN nrq.id IS NOT NULL THEN 'queued'
      ELSE 'available'
    END AS ndvi_status
FROM lands l
JOIN satellite_tiles st ON st_intersects(l.boundary_geom, st.bbox_geom)
LEFT JOIN ndvi_data nd ON nd.land_id = l.id AND nd.date = st.acquisition_date
LEFT JOIN ndvi_request_queue nrq ON nrq.tenant_id = l.tenant_id 
  AND l.id = ANY(nrq.land_ids) AND nrq.status IN ('queued', 'processing')
WHERE st.status = 'completed' AND st.ndvi_path IS NOT NULL AND l.deleted_at IS NULL
  AND (st_area(st_intersection(l.boundary_geom, st.bbox_geom)::geography) / 
    st_area(l.boundary_geom::geography)) > 0.5
ORDER BY l.name, st.acquisition_date DESC;

GRANT SELECT ON land_tile_coverage TO authenticated, anon;

-- 5. ndvi_coverage_stats
DROP VIEW IF EXISTS ndvi_coverage_stats CASCADE;
CREATE OR REPLACE VIEW ndvi_coverage_stats
WITH (security_invoker = true) AS
SELECT count(*) AS total_lands, count(nm.id) AS lands_with_ndvi,
    max(nm.acquisition_date) AS latest_ndvi_date,
    count(DISTINCT nm.acquisition_date) AS unique_dates
FROM lands l
LEFT JOIN ndvi_micro_tiles nm ON l.id = nm.land_id;

GRANT SELECT ON ndvi_coverage_stats TO authenticated, anon;

-- 6. ndvi_full_view
DROP VIEW IF EXISTS ndvi_full_view CASCADE;
CREATE OR REPLACE VIEW ndvi_full_view
WITH (security_invoker = true) AS
SELECT n.id AS ndvi_id, n.tenant_id, n.land_id, n.date,
    n.ndvi_value, n.evi_value, n.ndwi_value, n.savi_value,
    n.ndvi_min, n.ndvi_max, n.ndvi_std, n.coverage, n.image_url,
    n.cloud_cover, n.cloud_coverage, n.collection_id, n.satellite_source,
    n.created_at AS ndvi_created_at, n.updated_at AS ndvi_updated_at,
    l.name AS land_name, l.village, l.district, l.state, l.area_acres,
    l.last_ndvi_value, l.last_ndvi_calculation, l.ndvi_thumbnail_url,
    f.id AS farmer_id, f.farmer_code, f.farmer_name, f.mobile_number AS farmer_mobile,
    up.id AS user_profile_id, up.full_name AS user_full_name,
    up.mobile_number AS user_mobile, up.village AS user_village,
    up.district AS user_district, up.state AS user_state
FROM ndvi_data n
LEFT JOIN lands l ON n.land_id = l.id
LEFT JOIN farmers f ON l.farmer_id = f.id
LEFT JOIN user_profiles up ON f.user_profile_id = up.id;

GRANT SELECT ON ndvi_full_view TO authenticated, anon;

-- 7. pending_payouts
DROP VIEW IF EXISTS pending_payouts CASCADE;
CREATE OR REPLACE VIEW pending_payouts
WITH (security_invoker = true) AS
SELECT p.id, p.tenant_id, p.transaction_id, p.amount, p.currency,
    p.commission_rate, p.status, p.payout_method, p.transfer_ref,
    p.gateway_response, p.processed_at, p.failed_at, p.failure_reason,
    p.metadata, p.archived, p.created_at, p.updated_at,
    t.name AS tenant_name, t.commission_rate AS current_commission_rate,
    t.bank_details, tr.amount AS transaction_amount, tr.gateway
FROM payouts p
JOIN tenants t ON p.tenant_id = t.id
LEFT JOIN transactions tr ON p.transaction_id = tr.id
WHERE p.status = 'pending' AND p.archived = false;

GRANT SELECT ON pending_payouts TO authenticated, anon;

-- 8. weather_with_location
DROP VIEW IF EXISTS weather_with_location CASCADE;
CREATE OR REPLACE VIEW weather_with_location
WITH (security_invoker = true) AS
SELECT w.id, w.tenant_id, w.farmer_id, w.land_id, w.observation_date,
    w.observation_time, w.temperature_celsius, w.humidity_percent,
    w.rainfall_mm, w.wind_speed_kmh, w.wind_direction, w.weather_condition,
    w.pressure_hpa, w.visibility_km, w.uv_index, w.feels_like_celsius,
    w.dew_point_celsius, w.cloud_coverage_percent, w.metadata,
    w.created_at, w.updated_at, l.location_coords, l.center_lat, l.center_lon,
    l.name AS land_name, l.area_acres, l.district, l.village
FROM weather_observations w
JOIN lands l ON w.land_id = l.id;

GRANT SELECT ON weather_with_location TO authenticated, anon;

-- =====================================================
-- PHASE 2: Enable RLS on Critical Tables
-- =====================================================

-- Enable RLS on farmers table
ALTER TABLE farmers ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role has full access to farmers"
ON farmers FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Enable RLS on account_lockouts table
ALTER TABLE account_lockouts ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for auth system)
CREATE POLICY "Service role has full access to account_lockouts"
ON account_lockouts FOR ALL
TO service_role
USING (true)
WITH CHECK (true);