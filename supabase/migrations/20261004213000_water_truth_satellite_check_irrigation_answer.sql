-- =============================================================================
-- Proactive alerts — satellite water check, harvest-aware advice, alert expiry,
-- "I watered this field" — data and RPC for proactive-evaluator v130,
-- weather (rain truth) and proactive-question-seed (irrigation_answer).
-- 2026-10-04
--
-- FOR REVIEW. Nothing here deletes a row. Every statement stands alone (no
-- session state, no temp tables) so each can be run, or skipped, on its own in
-- the SQL runner. Statements 1, 2, 3 and 9 are wiring; 4–8 are agronomic or
-- wording decisions and are listed separately so each can be approved alone.
--
-- Finding → statement
--   F-1  The soil-water bucket said "dry" on every land (30 of 30 at the
--        ceiling) and nothing checked it against the satellite moisture layers
--        that already exist (NDMI in v_ndvi_decision_grade, MNDWI in
--        satellite_water_layers).                                  → 1, 2, 3
--   F-2  Alerts for "today" stayed on screen for 7 days (expires_at = now +
--        alert_expiry_days for every rule).                         → 4, 8
--   F-3  At grain filling, 22 days before harvest, the advice was how to set up
--        alternate wetting and drying "1–2 weeks after transplanting"; the
--        approved pre-harvest watering rule was never linked.       → 5, 6
--   F-4  The irrigation card said the soil moisture "has run out" in
--        textbook words.                                            → 7
--   F-5  The bucket had no irrigation input: 0 IRRIGATION_APPLIED events in the
--        database, and no writer for them.                          → 9
-- =============================================================================


-- 1) SAT_WATER_CORROBORATION@1.0 — limits for the satellite check on the
--    soil-water bucket (env-derived.ts satelliteWaterVerdict). Applying this
--    row is the agronomist's approval of these limits; without it the
--    evaluator gives no satellite verdict (0) and rules behave as before.
--      ndmi_change_min            0.02  NDMI change between two passes treated
--                                        as noise below this (field-mean NDMI
--                                        from Sentinel-2 L2A B8A/B11). Tunable.
--      max_pass_gap_days          30    two passes further apart are not compared
--      min_evidence_rank          1     v_ndvi_decision_grade evidence: low or better
--      surface_water_index_min    0     MNDWI >= 0 marks open water (Xu 2006);
--                                        tested on the pass's 90th percentile
--      surface_water_max_age_days 10    an older open-water pass is not used
INSERT INTO public.sci_method_registry
  (method_id, version, method_kind, equation_ref, authoritative_source, inputs, outputs, params,
   applicable_crops, geographic_scope, review_status, review_notes)
VALUES (
  'SAT_WATER_CORROBORATION', '1.0', 'threshold_set',
  'Satellite check on the FAO-56 root-zone bucket: verdict 1 when field-mean NDMI fell by >= ndmi_change_min between the two newest passes; -1 when it rose by >= ndmi_change_min or MNDWI p90 >= surface_water_index_min on a recent pass; else 0',
  'NDMI (Gao 1996) canopy water index and MNDWI (Xu 2006) open-water index from Sentinel-2 L2A, as stored by kisanshaktiai_ndvi_pipeline; noise floor and windows set by the agronomist',
  '{"required": ["ndmi", "ndmi_previous", "pass_gap_days"], "optional": ["surface_water_p90", "surface_water_date"]}'::jsonb,
  '{"water_sat_agree": "1 | 0 | -1"}'::jsonb,
  '{"ndmi_change_min": 0.02, "max_pass_gap_days": 30, "min_evidence_rank": 1, "surface_water_index_min": 0, "surface_water_max_age_days": 10}'::jsonb,
  '{}', '{IN}', 'approved',
  '2026-10-04: added with proactive-evaluator v130. Review ndmi_change_min against field checks after one season.'
)
ON CONFLICT (method_id, version) DO NOTHING;


-- 2) IRRIGATION_TRIGGER_FAO56 fires only when the satellite does not
--    contradict the bucket (water_sat_agree 1 or 0). Idempotent.
UPDATE public.proactive_rules
SET conditions = jsonb_set(
      conditions, '{all}',
      (conditions->'all') || '[{"op": "gte", "path": "derived.water_sat_agree", "value": 0}]'::jsonb),
    updated_at = now()
WHERE rule_code = 'IRRIGATION_TRIGGER_FAO56'
  AND NOT (conditions->'all') @> '[{"path": "derived.water_sat_agree"}]'::jsonb;


-- 3) IRRIGATION_CHECK_FIELD — the bucket says dry, the satellite says the crop
--    is not drying (water_sat_agree = -1): ask the farmer to check the soil
--    instead of telling them to water. English only: the app and the
--    enrichment step write the farmer's language. Graph link copied from
--    IRRIGATION_TRIGGER_FAO56 so the same advice rows apply.
INSERT INTO public.proactive_rules
  (rule_code, crop_code, stage_applicable, alert_category, priority, condition_type, conditions,
   title_en, message_template_en, scientific_source, forecast_horizon_days, probability_threshold,
   cooldown_hours, is_active)
SELECT
  'IRRIGATION_CHECK_FIELD', 'all', '{}', 'irrigation', 'medium', 'compound',
  jsonb_build_object(
    'all', '[{"op": "not_null", "path": "derived.raw_mm"},
             {"op": "gte_field", "path": "derived.root_depletion", "field": "derived.raw_mm"},
             {"op": "eq", "path": "derived.water_sat_agree", "value": -1}]'::jsonb,
    'metadata', (t.conditions->'metadata') || '{"method": "SOIL_WATER_BALANCE_FAO56@1.0+SAT_WATER_CORROBORATION@1.0"}'::jsonb),
  'Check the soil before watering',
  'Our water estimate says this field is drying, but the latest satellite picture does not show the crop drying. Feel the soil near the roots before you give water.',
  'sci_method_registry:SOIL_WATER_BALANCE_FAO56@1.0 + SAT_WATER_CORROBORATION@1.0',
  2, 0.75, 24, true
FROM public.proactive_rules t
WHERE t.rule_code = 'IRRIGATION_TRIGGER_FAO56'
  AND NOT EXISTS (SELECT 1 FROM public.proactive_rules WHERE rule_code = 'IRRIGATION_CHECK_FIELD');


-- 4) The irrigation message says "within 1-2 days": its alert should live two
--    days, not end at midnight (v130 expiry = end of the IST day that is
--    forecast_horizon_days ahead).
UPDATE public.proactive_rules
SET forecast_horizon_days = 2, updated_at = now()
WHERE rule_code = 'IRRIGATION_TRIGGER_FAO56' AND coalesce(forecast_horizon_days, 0) = 0;


-- 5) Near harvest, link the region's pre-harvest watering rule to the rice
--    water-stress cause ("last watering about 15 days before the expected
--    harvest, drain 7–10 days before"). The rule is servable, method 'any',
--    region IN-MH, stages grain_filling / maturity. Shown only in the last 30
--    days before harvest.
INSERT INTO public.hypothesis_rule_mapping (hypothesis_id, rule_id, priority, context_notes)
SELECT 'HYP_RICE_DROUGHT_001', 'RICE_IRRIG_DRAIN_PREHARVEST_MH_DRAFT_001', 1,
       'Near harvest: last watering about 15 days before harvest, then drain'
WHERE NOT EXISTS (
  SELECT 1 FROM public.hypothesis_rule_mapping
  WHERE hypothesis_id = 'HYP_RICE_DROUGHT_001' AND rule_id = 'RICE_IRRIG_DRAIN_PREHARVEST_MH_DRAFT_001');

UPDATE public.decision_rules
SET days_to_harvest_max = 30
WHERE rule_id = 'RICE_IRRIG_DRAIN_PREHARVEST_MH_DRAFT_001' AND days_to_harvest_max IS NULL;


-- 6) Alternate wetting and drying is a set-up routine (field tube, re-flood
--    cycle) that starts after transplanting. Do not offer it in the last 30
--    days before harvest.
UPDATE public.decision_rules
SET days_to_harvest_min = 30
WHERE rule_id = 'RICE_IRRIG_AWD_001' AND days_to_harvest_min IS NULL;


-- 7) Irrigation card in the farmer's words (native speaker to read once).
--    Before: "Irrigation needed" / "Soil water is depleted — irrigate within 1-2 days."
UPDATE public.proactive_rules
SET title_en = 'Time to water',
    title_mr = 'पाणी द्यायची वेळ',
    title_hi = 'पानी देने का समय',
    message_template_en = 'The soil in this field is drying out. Give water in the next 1–2 days.',
    message_template_mr = 'या शेतातील जमीन कोरडी पडत आहे. येत्या १–२ दिवसांत पाणी द्या.',
    message_template_hi = 'इस खेत की मिट्टी सूख रही है। अगले 1–2 दिन में पानी दें।',
    updated_at = now()
WHERE rule_code = 'IRRIGATION_TRIGGER_FAO56';


-- 8) APPLIED 2026-10-04 WITH A CORRECTION — read before re-running.
--    forecast_horizon_days defaults to 0, so 7 active rules that are not
--    "today" alerts (PRO_NDVI_DROP, PRO_NDVI_STRESS, DISEASE_EPISODE_DECLINING,
--    PRO_SC_EARTHING, PRO_SC_RED_ROT, PRO_SC_SHOOT_BORER, PRO_SC_SMUT) also read
--    0. 8a moved 37 of their live alerts to "end of creation day"; those 37 were
--    restored to created_at + 7 days before 8b ran, and 8b expired only
--    ENV_NO_SPRAY_TODAY (67), DISEASE_EPISODE_ONSET (19),
--    IRRIGATION_TRIGGER_FAO56 (10) and ENV_SPRAY_WINDOW_GOOD (5).
--    Run statement 10 BEFORE re-running 8 anywhere else.
-- 8) Live alerts of rules with a forecast horizon end at the end of that IST
--    day (same rule as evaluator v130 for new alerts). 8a moves expires_at
--    earlier where it is later; 8b sets the ones already past it to EXPIRED.
--    Covers the "do not spray today" cards from 30 Sep / 1 Oct and the good
--    spraying window of 29 Sep. Soft change only.
UPDATE public.proactive_alerts a
SET expires_at = ((date_trunc('day', a.created_at AT TIME ZONE 'Asia/Kolkata')
                   + make_interval(days => r.forecast_horizon_days + 1)) AT TIME ZONE 'Asia/Kolkata'),
    updated_at = now()
FROM public.proactive_rules r
WHERE r.rule_code = a.rule_id
  AND r.forecast_horizon_days IS NOT NULL AND r.forecast_horizon_days >= 0
  AND a.status IN ('PENDING', 'DELIVERED', 'SEEN')
  AND a.expires_at > ((date_trunc('day', a.created_at AT TIME ZONE 'Asia/Kolkata')
                       + make_interval(days => r.forecast_horizon_days + 1)) AT TIME ZONE 'Asia/Kolkata');

UPDATE public.proactive_alerts
SET status = 'EXPIRED', updated_at = now()
WHERE status IN ('PENDING', 'DELIVERED', 'SEEN') AND expires_at < now();


-- 9) record_irrigation — the only writer of IRRIGATION_APPLIED, called by
--    proactive-question-seed (action irrigation_answer) with the service role.
--    The farmer's tap means "I watered this field fully", so the applied (net)
--    depth is the root-zone depletion the estimate held: the bucket goes back
--    to field capacity. With no depletion on record the event is still written
--    (it marks the water state as known) but carries no depth, and the derive
--    skips it with IRRIG_EVENT_MALFORMED rather than guessing one.
CREATE OR REPLACE FUNCTION public.record_irrigation(
  p_land_id uuid,
  p_observed_date date DEFAULT CURRENT_DATE,
  p_alert_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid; v_farmer uuid; v_schedule uuid;
  v_depl numeric; v_taw numeric; v_metric_date date;
  v_payload jsonb;
BEGIN
  SELECT tenant_id, farmer_id INTO v_tenant, v_farmer FROM public.lands WHERE id = p_land_id;
  IF v_farmer IS NULL THEN
    RAISE EXCEPTION 'land % not found', p_land_id;
  END IF;
  IF p_observed_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'observed_date % is in the future', p_observed_date;
  END IF;

  SELECT id INTO v_schedule
    FROM public.crop_schedules
   WHERE land_id = p_land_id AND is_active
   ORDER BY created_at DESC LIMIT 1;

  SELECT metric_date, root_depletion_mm, taw_mm INTO v_metric_date, v_depl, v_taw
    FROM public.land_weather_state
   WHERE land_id = p_land_id AND root_depletion_mm IS NOT NULL
   ORDER BY metric_date DESC, computed_at DESC
   LIMIT 1;

  v_payload := jsonb_build_object(
    'observed_date', p_observed_date,
    'channel', 'farmer_confirm',
    'basis', 'full_watering_refills_root_zone',
    'alert_id', p_alert_id);
  IF v_depl IS NOT NULL AND v_depl > 0 THEN
    v_payload := v_payload || jsonb_build_object(
      'applied_depth_mm', round(v_depl, 2),
      'depletion_metric_date', v_metric_date,
      'taw_mm', v_taw);
  END IF;

  INSERT INTO public.crop_lifecycle_events (tenant_id, farmer_id, land_id, schedule_id, event_type, payload, actor)
  VALUES (v_tenant, v_farmer, p_land_id, v_schedule, 'IRRIGATION_APPLIED', v_payload, v_farmer);

  RETURN v_payload;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_irrigation(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_irrigation(uuid, date, uuid) TO service_role;


-- 10) The column default (0) is not an authored "today". These 7 active rules
--     describe a state or risk that lasts beyond the day; give them the same
--     7 days alert_expiry_days already gives them, so evaluator v130's
--     horizon-based expiry changes nothing for them. Horizon 0 then means
--     "today / right now" only for the rules that say so: ENV_NO_SPRAY_TODAY,
--     PRO_WEATHER_FROST, PRO_WEATHER_HEATWAVE, PRO_WEATHER_HEAVY_RAIN,
--     WATERLOGGING_GUARD_HEAVY_RAIN. A new rule should set its own horizon.
UPDATE public.proactive_rules
SET forecast_horizon_days = 7, updated_at = now()
WHERE rule_code IN ('PRO_NDVI_DROP', 'PRO_NDVI_STRESS', 'DISEASE_EPISODE_DECLINING',
                    'PRO_SC_EARTHING', 'PRO_SC_RED_ROT', 'PRO_SC_SHOOT_BORER', 'PRO_SC_SMUT')
  AND coalesce(forecast_horizon_days, 0) = 0;
