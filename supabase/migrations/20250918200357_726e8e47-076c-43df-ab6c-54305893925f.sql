-- Update view for land agent context using correct weather table columns
CREATE OR REPLACE VIEW public.land_agent_context AS
SELECT 
  l.id as land_id,
  l.tenant_id,
  l.farmer_id,
  l.name as land_name,
  l.area_acres,
  l.area_guntas,
  l.soil_type,
  l.water_source,
  l.irrigation_type,
  l.current_crop,
  l.previous_crop,
  l.cultivation_date,
  l.last_harvest_date,
  l.state,
  l.district,
  l.taluka,
  l.village,
  l.survey_number,
  l.boundary_polygon_old,
  l.center_point_old,
  f.farmer_name,
  f.mobile_number as farmer_phone,
  COALESCE(f.language, f.language_preference) as farmer_language,
  f.location as farmer_location,
  -- Weather data from existing tables with correct column names
  COALESCE(
    (SELECT jsonb_build_object(
      'current', jsonb_build_object(
        'temperature', wc.temperature_celsius,
        'feels_like', wc.feels_like_celsius,
        'humidity', wc.humidity_percent,
        'pressure', wc.pressure_hpa,
        'wind_speed', wc.wind_speed_kmh,
        'wind_direction', wc.wind_direction_degrees,
        'rainfall_1h', wc.rain_1h_mm,
        'rainfall_24h', wc.rain_24h_mm,
        'cloud_cover', wc.cloud_cover_percent,
        'weather_main', wc.weather_main,
        'weather_description', wc.weather_description,
        'uv_index', wc.uv_index,
        'evapotranspiration', wc.evapotranspiration_mm,
        'soil_temperature', wc.soil_temperature_celsius,
        'soil_moisture', wc.soil_moisture_percent,
        'observation_time', wc.observation_time
      ),
      'historical', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'date', wh.record_date,
            'temperature_avg', wh.temperature_avg_celsius,
            'temperature_max', wh.temperature_max_celsius,
            'temperature_min', wh.temperature_min_celsius,
            'humidity', wh.humidity_avg_percent,
            'rainfall', wh.rainfall_mm,
            'wind_speed', wh.wind_speed_avg_kmh,
            'evapotranspiration', wh.evapotranspiration_mm,
            'growing_degree_days', wh.growing_degree_days
          ) ORDER BY wh.record_date DESC
        ) FROM public.weather_historical wh
        WHERE wh.latitude::text = SUBSTRING(l.center_point_old::text FROM '\(([-0-9.]+),')
          AND wh.longitude::text = SUBSTRING(l.center_point_old::text FROM ',([-0-9.]+)\)')
          AND wh.record_date >= CURRENT_DATE - INTERVAL '7 days'
        LIMIT 7),
        '[]'::jsonb
      )
    ) FROM public.weather_current wc
    WHERE wc.latitude::text = SUBSTRING(l.center_point_old::text FROM '\(([-0-9.]+),')
      AND wc.longitude::text = SUBSTRING(l.center_point_old::text FROM ',([-0-9.]+)\)')
    LIMIT 1),
    jsonb_build_object(
      'current', '{}',
      'historical', '[]'
    )
  ) as weather_data
FROM public.lands l
JOIN public.farmers f ON f.id = l.farmer_id AND f.tenant_id = l.tenant_id
WHERE l.is_active = true;