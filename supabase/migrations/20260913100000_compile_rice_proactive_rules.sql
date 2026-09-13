-- 2026-09-13 — Compile the rice proactive rules that have been SILENT since day one.
--
-- FINDING (verified live): proactive_rules holds 212 active rules. Only 34 are in the compiled
-- {"all":[{op,path,value}]} format that the evaluator's env-derived engine reads; the other 178
-- (all 33 pest rules, 43 of 59 disease rules, all harvest / fertilizer-window / nutrition rules)
-- are in a legacy flat format ({"temp_min":25,"humidity_min":80,...}) that no code path evaluates
-- as intended. Result over the last 30 days: 0 alerts from any legacy rule. The farmer's pest
-- and disease early-warning layer has never fired.
--
-- This migration recompiles the rice rules whose legacy thresholds map ONE-TO-ONE onto fact
-- paths the engine already computes (weather.temp / humidity / wind / tmin_forecast_night,
-- derived.rain_24h, forecast.tmax_mean_5d). Every number below is the rule's OWN legacy value —
-- nothing is invented. Rules whose legacy condition names a fact the engine does not have
-- (a 7-day rain forecast, grain moisture, a district GLH sighting) are NOT compiled here and are
-- listed at the end. The legacy JSON is preserved under conditions.legacy_source for audit.
-- Only `conditions` and `updated_at` change; nothing is deleted.

-- Brown planthopper build-up: warm, humid, still air under a dense canopy (tillering → flowering).
update public.proactive_rules set conditions = jsonb_build_object(
  'all', jsonb_build_array(
    jsonb_build_object('op','gte','path','weather.temp','value',25),
    jsonb_build_object('op','lte','path','weather.temp','value',30),
    jsonb_build_object('op','gte','path','weather.humidity','value',80),
    jsonb_build_object('op','lte','path','weather.wind','value',10)),
  'metadata', jsonb_build_object('engine','env-intelligence','compiler','manual-2026-09-13','compiled_from','proactive_legacy','legacy_condition_type','weather'),
  'legacy_source', conditions), updated_at = now()
where rule_code = 'RICE_PROACTIVE_BPH_BUILDUP_001' and not (conditions ? 'all');

-- Sheath blight: hot, humid (tillering → booting). Legacy also required canopy_closed=true, which
-- the stage gate already implies from tillering onward; no canopy fact path exists to compile it.
update public.proactive_rules set conditions = jsonb_build_object(
  'all', jsonb_build_array(
    jsonb_build_object('op','gte','path','weather.temp','value',28),
    jsonb_build_object('op','lte','path','weather.temp','value',32),
    jsonb_build_object('op','gte','path','weather.humidity','value',85)),
  'metadata', jsonb_build_object('engine','env-intelligence','compiler','manual-2026-09-13','compiled_from','proactive_legacy','note','canopy_closed dropped: implied by stage gate'),
  'legacy_source', conditions), updated_at = now()
where rule_code = 'RICE_PROACTIVE_SHEATH_BLIGHT_001' and not (conditions ? 'all');

-- Neck blast (critical): high humidity with cool nights at booting → flowering.
update public.proactive_rules set conditions = jsonb_build_object(
  'all', jsonb_build_array(
    jsonb_build_object('op','gte','path','weather.humidity','value',85),
    jsonb_build_object('op','gte','path','weather.tmin_forecast_night','value',22),
    jsonb_build_object('op','lte','path','weather.tmin_forecast_night','value',28)),
  'metadata', jsonb_build_object('engine','env-intelligence','compiler','manual-2026-09-13','compiled_from','proactive_legacy'),
  'legacy_source', conditions), updated_at = now()
where rule_code = 'RICE_PROACTIVE_NECK_BLAST_001' and not (conditions ? 'all');

-- False smut: warm, very humid, with rain at booting → flowering.
update public.proactive_rules set conditions = jsonb_build_object(
  'all', jsonb_build_array(
    jsonb_build_object('op','gte','path','weather.temp','value',25),
    jsonb_build_object('op','lte','path','weather.temp','value',30),
    jsonb_build_object('op','gte','path','weather.humidity','value',85),
    jsonb_build_object('op','gte','path','derived.rain_24h','value',5)),
  'metadata', jsonb_build_object('engine','env-intelligence','compiler','manual-2026-09-13','compiled_from','proactive_legacy'),
  'legacy_source', conditions), updated_at = now()
where rule_code = 'RICE_PROACTIVE_FALSE_SMUT_001' and not (conditions ? 'all');

-- Bacterial leaf blight after wind-driven rain (tillering → booting).
update public.proactive_rules set conditions = jsonb_build_object(
  'all', jsonb_build_array(
    jsonb_build_object('op','gte','path','derived.rain_24h','value',20),
    jsonb_build_object('op','gte','path','weather.humidity','value',70),
    jsonb_build_object('op','gte','path','weather.wind','value',15)),
  'metadata', jsonb_build_object('engine','env-intelligence','compiler','manual-2026-09-13','compiled_from','proactive_legacy'),
  'legacy_source', conditions), updated_at = now()
where rule_code = 'RICE_PROACTIVE_BLB_RAIN_001' and not (conditions ? 'all');

-- Lodging: heavy rain with strong wind from booting to maturity.
update public.proactive_rules set conditions = jsonb_build_object(
  'all', jsonb_build_array(
    jsonb_build_object('op','gte','path','derived.rain_24h','value',30),
    jsonb_build_object('op','gte','path','weather.wind','value',35)),
  'metadata', jsonb_build_object('engine','env-intelligence','compiler','manual-2026-09-13','compiled_from','proactive_legacy'),
  'legacy_source', conditions), updated_at = now()
where rule_code = 'RICE_PROACTIVE_LODGING_RISK_001' and not (conditions ? 'all');

-- Heat at flowering (spikelet sterility). Legacy: Tmax ≥ 35 for 2 consecutive days. The engine
-- exposes forecast.tmax_mean_5d; a 5-day mean ≥ 35 is a STRICTER proxy (fires less readily).
update public.proactive_rules set conditions = jsonb_build_object(
  'all', jsonb_build_array(
    jsonb_build_object('op','gte','path','forecast.tmax_mean_5d','value',35)),
  'metadata', jsonb_build_object('engine','env-intelligence','compiler','manual-2026-09-13','compiled_from','proactive_legacy','note','5-day mean Tmax used as a stricter proxy for 2 consecutive days ≥35'),
  'legacy_source', conditions), updated_at = now()
where rule_code = 'RICE_PROACTIVE_HEAT_FLOWERING_001' and not (conditions ? 'all');

-- NOT compiled (no fact path exists for the legacy condition — needs data, not code):
--   RICE_PROACTIVE_DROUGHT_RISK_001   (7-day rain forecast, soil moisture %)
--   RICE_PROACTIVE_TUNGRO_VECTOR_001  (district-level green leafhopper sighting)
--   RICE_PROACTIVE_HARVEST_READY_001  (grain moisture %, yellow-grain %) — the schedule already carries the harvest card
--   RICE_PROACTIVE_GUNDHI_FLOWERING_001 (stage-only; scouting at flowering already exists on the schedule)
-- And 171 legacy rules for other crops remain uncompiled — same treatment, crop by crop, after review.

-- Verify (read-only): expect 7 rows with compiler = manual-2026-09-13
--   select rule_code, conditions->'metadata'->>'compiler' from proactive_rules where conditions->'metadata'->>'compiler'='manual-2026-09-13';
