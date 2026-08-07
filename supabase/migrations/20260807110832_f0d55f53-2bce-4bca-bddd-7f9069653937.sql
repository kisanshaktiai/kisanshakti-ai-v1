-- ============================================================
-- Environmental Intelligence Engine — Observation Spine + Scientific Registry
-- ADDITIVE ONLY. No existing table altered except the two explicit changes below.
-- ============================================================

-- 1) env_source_registry -------------------------------------------------
CREATE TABLE public.env_source_registry (
  source_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text CHECK (source_kind IN ('api_provider','reanalysis','gridded_product','farm_station','field_sensor','canopy_sensor','soil_sensor','satellite','drone','human_observer','derived_engine')),
  source_code text UNIQUE NOT NULL,
  tenant_id uuid NULL,
  land_id uuid NULL,
  geom geometry NULL,
  elevation_m numeric NULL,
  siting_class smallint NULL CHECK (siting_class BETWEEN 1 AND 5),
  sensor_spec jsonb DEFAULT '{}'::jsonb,
  calibration_ref uuid NULL,
  trust_prior numeric DEFAULT 0.5 CHECK (trust_prior BETWEEN 0 AND 1),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.env_source_registry TO authenticated;
GRANT ALL ON public.env_source_registry TO service_role;
ALTER TABLE public.env_source_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_source_registry_read" ON public.env_source_registry
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "env_source_registry_service_write" ON public.env_source_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.env_source_registry (source_code, source_kind, trust_prior) VALUES
  ('OPENWEATHER','api_provider',0.7),
  ('TOMORROW_IO','api_provider',0.7),
  ('IMD_API','api_provider',0.85),
  ('IMD_GRIDDED','gridded_product',0.85),
  ('NASA_POWER','reanalysis',0.75),
  ('ERA5','reanalysis',0.75),
  ('ENGINE_DERIVED','derived_engine',0.8);

-- 2) env_property_master -------------------------------------------------
CREATE TABLE public.env_property_master (
  property_code text PRIMARY KEY,
  display_name text,
  unit text NOT NULL,
  value_kind text CHECK (value_kind IN ('measured','estimated','forecast','derived')),
  plausible_min numeric,
  plausible_max numeric,
  method_ref text NULL,
  farmer_visible boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.env_property_master TO authenticated;
GRANT ALL ON public.env_property_master TO service_role;
ALTER TABLE public.env_property_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_property_master_read" ON public.env_property_master
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "env_property_master_service_write" ON public.env_property_master
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.env_property_master (property_code, display_name, unit, value_kind, plausible_min, plausible_max, farmer_visible) VALUES
  ('AIR_TEMP','Air temperature','°C','measured',-60,60,true),
  ('AIR_TEMP_MAX','Maximum air temperature','°C','measured',-60,60,true),
  ('AIR_TEMP_MIN','Minimum air temperature','°C','measured',-60,60,true),
  ('RH','Relative humidity','%','measured',0,100,true),
  ('DEW_POINT','Dew point','°C','derived',-60,60,false),
  ('RAIN','Rainfall','mm','measured',0,2000,true),
  ('RAIN_PROB','Rain probability','%','forecast',0,100,true),
  ('WIND_2M','Wind speed at 2 m','m/s','derived',0,140,false),
  ('WIND_10M','Wind speed at 10 m','m/s','measured',0,140,false),
  ('SOLAR_RAD','Solar radiation','MJ/m2/day','estimated',0,45,false),
  ('SUNSHINE_HOURS','Sunshine hours','h','measured',0,14,false),
  ('PRESSURE','Atmospheric pressure','hPa','measured',800,1100,false),
  ('SOIL_TEMP_5CM','Soil temperature at 5 cm','°C','measured',-20,70,false),
  ('SOIL_MOISTURE_ROOTZONE','Root-zone soil moisture','%vol','estimated',0,60,false),
  ('LEAF_WETNESS','Leaf wetness duration (measured)','h','measured',0,24,false),
  ('NDVI','NDVI','index','measured',-1,1,false),
  ('ET0','Reference evapotranspiration','mm/day','derived',0,15,false),
  ('ETC','Crop evapotranspiration','mm/day','derived',0,20,false),
  ('VPD','Vapour pressure deficit','kPa','derived',0,8,false),
  ('LWD_EST','Estimated leaf wetness duration','h','derived',0,24,false),
  ('GDD_DAILY','Daily growing degree days','°C·d','derived',0,40,false),
  ('GDD_CUM','Cumulative growing degree days','°C·d','derived',0,6000,false),
  ('HEAT_STRESS_DH','Heat stress degree-hours','°C·h','derived',0,500,false),
  ('COLD_STRESS_DH','Cold stress degree-hours','°C·h','derived',0,500,false),
  ('FROST_RISK','Frost risk','index01','derived',0,1,false),
  ('SPRAY_SCORE','Spray suitability','index01','derived',0,1,false),
  ('ROOT_DEPLETION','Root-zone depletion','mm','derived',0,400,false),
  ('TAW','Total available water','mm','derived',0,500,false),
  ('RAW_THRESHOLD','Readily available water threshold','mm','derived',0,400,false),
  ('WATER_DEFICIT','Water deficit','mm','derived',0,50,false),
  ('HARVEST_WINDOW','Harvest window suitability','index01','derived',0,1,false),
  ('TRAFFICABILITY','Field trafficability','index01','derived',0,1,false),
  ('EVENT_HEATWAVE','Heat wave days','days','derived',0,30,false),
  ('EVENT_COLDWAVE','Cold wave days','days','derived',0,30,false),
  ('EVENT_DRY_SPELL','Dry spell days','days','derived',0,120,false),
  ('EVENT_HOT_NIGHT','Hot night days','days','derived',0,30,false);

-- 3) env_observations (partitioned) --------------------------------------
CREATE TABLE public.env_observations (
  obs_id bigint GENERATED ALWAYS AS IDENTITY,
  land_id uuid NULL,
  cell_key text NULL,
  -- immutable key used for the dedup unique index (expressions are not
  -- permitted in unique indexes on partitioned tables)
  entity_key text GENERATED ALWAYS AS (COALESCE(land_id::text, cell_key)) STORED,
  property_code text NOT NULL REFERENCES public.env_property_master(property_code),
  valid_time timestamptz NOT NULL,
  issue_time timestamptz NOT NULL,
  horizon_hours int GENERATED ALWAYS AS ((EXTRACT(EPOCH FROM (valid_time - issue_time))/3600)::int) STORED,
  value numeric NOT NULL,
  u_std numeric NULL,
  dist_kind text DEFAULT 'normal',
  raw_value numeric NULL,
  raw_unit text NULL,
  source_id uuid NOT NULL REFERENCES public.env_source_registry(source_id),
  qc_level smallint DEFAULT 0,
  qc_flags text[] DEFAULT '{}',
  confidence numeric NULL,
  obs_version int DEFAULT 1,
  prior_version bigint NULL,
  revision_reason text NULL,
  superseded_by bigint NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (obs_id, valid_time),
  CHECK (land_id IS NOT NULL OR cell_key IS NOT NULL)
) PARTITION BY RANGE (valid_time);

CREATE UNIQUE INDEX env_obs_dedup_uidx ON public.env_observations
  (entity_key, property_code, valid_time, source_id, issue_time);
CREATE INDEX env_obs_cell_idx ON public.env_observations
  (cell_key, property_code, valid_time DESC);
CREATE INDEX env_obs_land_idx ON public.env_observations
  (land_id, property_code, valid_time DESC) WHERE superseded_by IS NULL;

GRANT SELECT ON public.env_observations TO authenticated;
GRANT ALL ON public.env_observations TO service_role;
ALTER TABLE public.env_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_observations_read" ON public.env_observations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "env_observations_service_write" ON public.env_observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- monthly partition maintenance
CREATE OR REPLACE FUNCTION public.ensure_env_partitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  i int;
  p_start date;
  p_end date;
  p_name text;
BEGIN
  FOR i IN 0..3 LOOP
    p_start := date_trunc('month', now())::date + (i || ' month')::interval;
    p_end   := (p_start + interval '1 month')::date;
    p_name  := format('env_observations_%s', to_char(p_start, 'YYYYMM'));
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = p_name AND n.nspname = 'public'
    ) THEN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.env_observations FOR VALUES FROM (%L) TO (%L)',
        p_name, p_start, p_end
      );
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', p_name);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', p_name);
    END IF;
  END LOOP;
END;
$fn$;

SELECT public.ensure_env_partitions();

SELECT cron.schedule(
  'ensure-env-partitions-monthly',
  '0 3 1 * *',
  $$SELECT public.ensure_env_partitions();$$
);

-- 4) sci_method_registry --------------------------------------------------
CREATE TABLE public.sci_method_registry (
  method_id text NOT NULL,
  version text NOT NULL,
  method_kind text CHECK (method_kind IN ('equation','threshold_set','coefficient_table','event_definition','phenology_model','qc_procedure')),
  equation_ref text,
  authoritative_source text NOT NULL,
  inputs jsonb DEFAULT '[]'::jsonb,
  outputs jsonb DEFAULT '[]'::jsonb,
  params jsonb DEFAULT '{}'::jsonb,
  sensitivity jsonb NULL,
  applicable_crops text[] DEFAULT '{}',
  geographic_scope text[] DEFAULT '{IN}',
  valid_from date DEFAULT current_date,
  valid_to date NULL,
  review_status text DEFAULT 'approved' CHECK (review_status IN ('draft','agronomist_review','approved','deprecated')),
  reviewed_by uuid NULL,
  review_notes text NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (method_id, version)
);
GRANT SELECT ON public.sci_method_registry TO authenticated;
GRANT ALL ON public.sci_method_registry TO service_role;
ALTER TABLE public.sci_method_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sci_method_registry_read" ON public.sci_method_registry
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sci_method_registry_service_write" ON public.sci_method_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.sci_method_registry (method_id, version, method_kind, equation_ref, authoritative_source, params) VALUES
 ('ET0_FAO56_PM','1.0','equation','FAO-56 Eq.6, Allen et al. 1998','FAO Irrigation & Drainage Paper 56','{"albedo":0.23,"G_daily":0,"angstrom_a":0.25,"angstrom_b":0.50,"wind_10_to_2_factor":0.748}'::jsonb),
 ('ET0_HARGREAVES','1.0','equation','Hargreaves–Samani 1985; FAO-56 Eq.52','FAO-56','{"k":0.0023,"t_offset":17.8}'::jsonb),
 ('VPD_TETENS','1.0','equation','Tetens; FAO-56 Eq.11–12','FAO-56','{"a":0.6108,"b":17.27,"c":237.3}'::jsonb),
 ('GDD_MODIFIED','1.0','equation','Modified GDD (cap Tmax at upper, floor Tmin at base)','NDSU/standard agronomic practice','{}'::jsonb),
 ('LWD_RH_THRESHOLD','1.0','equation','RH-threshold leaf wetness; wet hour when RH>=87%; extend by rain hours and dew-point depression <2°C','Sentelhas et al. leaf wetness literature','{"rh_wet_pct":87,"dpd_wet_c":2}'::jsonb),
 ('HEAT_STRESS_FLOWERING','1.0','threshold_set','Degree-hours above crop seed-set threshold during flowering','Liu et al. 2023 Plant Communications 4:100629','{"rice_c":37.2,"wheat_c":27.3,"maize_c":37.9,"cotton_c":35.0,"generic_c":35.0}'::jsonb),
 ('WHEAT_TERMINAL_HEAT','1.0','threshold_set','Grain-fill mean Tmax>31°C = terminal heat; ~3-4% yield loss per +1°C','ICAR / peer-reviewed wheat terminal heat literature','{"grainfill_mean_max_c":31}'::jsonb),
 ('SPRAY_SUITABILITY','1.0','threshold_set','Composite spray window','WSU AgWeatherNet / Kestrel Delta-T guidance','{"wind_ok_ms":[1.4,3.6],"wind_block_ms":4.5,"deltaT_ok_c":[2,8],"deltaT_block_c":10,"rh_min_pct":45,"rh_max_pct":90,"temp_max_c":30,"rain_free_hours":2,"rain_prob_block_pct":60}'::jsonb),
 ('SOIL_WATER_BALANCE_FAO56','1.0','equation','FAO-56 Ch.8: Dr,i = Dr,i-1 - (P-RO) - I + ETc + DP; RAW=p*TAW; TAW=(FC-WP)*Zr','FAO-56','{"p_default":0.5}'::jsonb),
 ('SAXTON_RAWLS_PTF','1.0','equation','Pedotransfer FC/WP from sand/clay/OM','Saxton & Rawls 2006 SSSAJ','{}'::jsonb),
 ('KC_NDVI_ADJUST','1.0','equation','Kc_adj = clamp(Kc_stage*(0.3+1.2*NDVI_rel), Kc_ini, Kc_max)','FAO-56 Kc framework + remote-sensing Kc literature','{"a":0.3,"b":1.2}'::jsonb),
 ('KC_FAO56_TABLE12','1.0','coefficient_table','Stage Kc (ini/mid/end)','FAO-56 Table 12','{"rice":{"ini":1.05,"mid":1.20,"end":0.90},"wheat":{"ini":0.30,"mid":1.15,"end":0.40},"maize":{"ini":0.30,"mid":1.20,"end":0.60},"cotton":{"ini":0.35,"mid":1.18,"end":0.60},"soybean":{"ini":0.40,"mid":1.15,"end":0.50},"sugarcane":{"ini":0.40,"mid":1.25,"end":0.75},"chickpea":{"ini":0.40,"mid":1.00,"end":0.35},"tomato":{"ini":0.60,"mid":1.15,"end":0.80}}'::jsonb),
 ('FROST_COMPOSITE','1.0','threshold_set','Tmin vs crop threshold amplified by clear sky, calm wind, low dew point','FAO frost protection guidance','{"wind_calm_ms":2,"cloud_clear_pct":30,"dpd_amplify_c":5}'::jsonb),
 ('CONFIDENCE_MODEL','1.0','equation','confidence=0.35*agreement+0.20*freshness+0.25*leadtime+0.20*skill; precip lead multiplier 0.8','Platform confidence model per NAEFS/ensemble practice','{"w_agreement":0.35,"w_freshness":0.20,"w_leadtime":0.25,"w_skill":0.20,"sigma_ref":{"AIR_TEMP":2,"RH":10,"WIND_2M":2},"leadtime_factors":{"d0_1":1.0,"d2_3":0.85,"d4_7":0.65,"d8p":0.4},"precip_multiplier":0.8,"neutral_skill":0.7}'::jsonb),
 ('GDD_BASE_TEMPS','1.0','coefficient_table','Crop GDD base/upper temps','FAO/ICAR/Bange 2022/Brown Crop Science','{"rice":{"base":10,"upper":35},"wheat":{"base":5,"upper":32},"maize":{"base":10,"upper":30},"cotton":{"base":15.6,"upper":32},"soybean":{"base":10,"upper":32},"chickpea":{"base":4.79,"upper":40},"tomato":{"base":6,"upper":35}}'::jsonb),
 ('SOIL_TYPE_EFFECTIVE_RAIN','1.0','coefficient_table','Soil-type effective-rainfall factors currently hardcoded in supabase/functions/weather/index.ts (SOIL_FACTORS, ~line 1103) — registry row so a later prompt can re-point code','FAO effective rainfall guidance; existing platform values preserved','{"black":0.60,"black_cotton":0.60,"vertisol":0.60,"red":0.75,"laterite":0.75,"alfisol":0.75,"sandy":0.85,"sandy_loam":0.85,"entisol":0.85,"alluvial":0.70,"loamy":0.70,"inceptisol":0.70,"clay":0.55,"clayey":0.55,"default":0.70}'::jsonb);

INSERT INTO public.sci_method_registry (method_id, version, method_kind, equation_ref, authoritative_source, params, review_status) VALUES
 ('GDD_BASE_TEMPS_PENDING','1.0','coefficient_table','Unverified bases pending DSSAT/CROPGRO calibration','ICAR pending','{"sugarcane":{"base":10,"upper":38},"pigeonpea":{"base":8.5,"upper":38}}'::jsonb,'agronomist_review');

INSERT INTO public.sci_method_registry (method_id, version, method_kind, equation_ref, authoritative_source, params, geographic_scope) VALUES
 ('EVENT_HEATWAVE_IMD','1.0','event_definition','IMD plains criteria: Tmax>=40 AND departure>=4.5 (severe>=6.4) OR absolute>=45 (severe>=47); >=2 consecutive days','IMD official heat wave criteria','{"tmax_min_c":40,"departure_c":4.5,"severe_departure_c":6.4,"absolute_c":45,"severe_absolute_c":47,"min_days":2}'::jsonb,'{IN-plains}');

-- 5) env_derivation_run ---------------------------------------------------
CREATE TABLE public.env_derivation_run (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id text NOT NULL,
  method_version text NOT NULL,
  executed_at timestamptz DEFAULT now(),
  engine_source_id uuid REFERENCES public.env_source_registry(source_id),
  params_hash text,
  land_id uuid NULL,
  cell_key text NULL,
  status text DEFAULT 'ok',
  FOREIGN KEY (method_id, method_version) REFERENCES public.sci_method_registry(method_id, version)
);
GRANT SELECT ON public.env_derivation_run TO authenticated;
GRANT ALL ON public.env_derivation_run TO service_role;
ALTER TABLE public.env_derivation_run ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_derivation_run_read" ON public.env_derivation_run
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "env_derivation_run_service_write" ON public.env_derivation_run
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6) env_obs_lineage ------------------------------------------------------
CREATE TABLE public.env_obs_lineage (
  derived_obs_id bigint NOT NULL,
  input_obs_id bigint NOT NULL,
  run_id uuid REFERENCES public.env_derivation_run(run_id),
  sensitivity numeric NULL,
  PRIMARY KEY (derived_obs_id, input_obs_id)
);
GRANT SELECT ON public.env_obs_lineage TO authenticated;
GRANT ALL ON public.env_obs_lineage TO service_role;
ALTER TABLE public.env_obs_lineage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_obs_lineage_read" ON public.env_obs_lineage
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "env_obs_lineage_service_write" ON public.env_obs_lineage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7) weather_cell_bias ----------------------------------------------------
CREATE TABLE public.weather_cell_bias (
  cell_key text NOT NULL,
  source_id uuid NOT NULL REFERENCES public.env_source_registry(source_id),
  property_code text NOT NULL REFERENCES public.env_property_master(property_code),
  rolling_bias numeric DEFAULT 0,
  rolling_mae numeric NULL,
  sample_n int DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (cell_key, source_id, property_code)
);
GRANT SELECT ON public.weather_cell_bias TO authenticated;
GRANT ALL ON public.weather_cell_bias TO service_role;
ALTER TABLE public.weather_cell_bias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weather_cell_bias_read" ON public.weather_cell_bias
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "weather_cell_bias_service_write" ON public.weather_cell_bias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8) risk_episodes --------------------------------------------------------
CREATE TABLE public.risk_episodes (
  episode_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  land_id uuid NOT NULL,
  risk_code text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('onset','rising','peak','declining','ended')),
  started_at timestamptz NOT NULL,
  phase_updated_at timestamptz DEFAULT now(),
  ended_at timestamptz NULL,
  peak_value numeric NULL,
  current_value numeric NULL,
  evidence_obs_ids bigint[] DEFAULT '{}',
  confidence numeric NULL,
  tenant_id uuid NULL
);
CREATE UNIQUE INDEX risk_episodes_active_uidx ON public.risk_episodes (land_id, risk_code)
  WHERE phase <> 'ended';
CREATE INDEX risk_episodes_tenant_idx ON public.risk_episodes (tenant_id, risk_code);
GRANT SELECT ON public.risk_episodes TO authenticated;
GRANT ALL ON public.risk_episodes TO service_role;
ALTER TABLE public.risk_episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk_episodes_read" ON public.risk_episodes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "risk_episodes_service_write" ON public.risk_episodes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9) land_weather_state additive columns ----------------------------------
ALTER TABLE public.land_weather_state
  ADD COLUMN IF NOT EXISTS et0_method text,
  ADD COLUMN IF NOT EXISTS et0_pm numeric,
  ADD COLUMN IF NOT EXISTS lwd_est_hours numeric,
  ADD COLUMN IF NOT EXISTS heat_stress_dh numeric,
  ADD COLUMN IF NOT EXISTS cold_stress_dh numeric,
  ADD COLUMN IF NOT EXISTS spray_score numeric,
  ADD COLUMN IF NOT EXISTS spray_window jsonb,
  ADD COLUMN IF NOT EXISTS frost_risk_score numeric,
  ADD COLUMN IF NOT EXISTS kc_static numeric,
  ADD COLUMN IF NOT EXISTS kc_ndvi_adj numeric,
  ADD COLUMN IF NOT EXISTS etc_mm numeric,
  ADD COLUMN IF NOT EXISTS taw_mm numeric,
  ADD COLUMN IF NOT EXISTS raw_mm numeric,
  ADD COLUMN IF NOT EXISTS root_depletion_mm numeric,
  ADD COLUMN IF NOT EXISTS harvest_window_score numeric,
  ADD COLUMN IF NOT EXISTS u_std_et0 numeric;

-- 10) weather_field_master new rows (existing 5 untouched) -----------------
INSERT INTO public.weather_field_master (field_code, unit, description, supplied_by, is_active)
SELECT v.field_code, v.unit, v.description, 'canonicalState.derived', true
FROM (VALUES
  ('et0','mm/day','Reference evapotranspiration (FAO-56)'),
  ('vpd','kPa','Vapour pressure deficit'),
  ('gdd_cumulative','°C·d','Cumulative growing degree days'),
  ('lwd_est','h','Estimated leaf wetness duration'),
  ('spray_score','index01','Spray suitability score'),
  ('frost_risk','index01','Frost risk score'),
  ('heat_stress_dh','°C·h','Heat stress degree-hours'),
  ('water_deficit','mm','Root-zone water deficit'),
  ('root_depletion','mm','Root-zone depletion'),
  ('irrigation_urgency','index01','Irrigation urgency score')
) AS v(field_code, unit, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.weather_field_master w WHERE w.field_code = v.field_code
);