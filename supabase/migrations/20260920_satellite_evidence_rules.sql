-- =====================================================================
-- Satellite evidence rules for the EXISTING proactive evaluator (2026-09-20)
-- Project: qfklkkzxemsbeniyugiz          Repo: kisanshakti-ai-v1
--
-- These are DATA rows for the env-intelligence rule engine that already
-- runs in supabase/functions/proactive-evaluator (env-derived.ts). They
-- read the `ndvi.*` data paths the evaluator v127 patch exposes from
-- v_ndvi_decision_grade and ndvi_intelligence, and combine them with the
-- weather/soil derived state the engine already computes. No new engine,
-- no new table, no code path: the evaluator picks these up on its next run.
--
-- Every rule carries the same evidence gate: newest optical pass must be
-- fresh (view freshness window) and have at least MEDIUM spatial support
-- (evidence_rank >= 2 = EPC >= 5 with purity not demoted). A stale or
-- unsupported satellite value never raises an alert.
--
-- Crop-agnostic (crop_code NULL); stage_applicable NULL = all stages.
-- Templates: English only, as the existing pattern — enrichment.ts renders
-- Marathi/Hindi from the English template plus the symbolic trigger data,
-- and useProactiveAlerts falls back to message_en. Placeholders used
-- ({{land}}, {{ndvi_age_days}}, {{pass_gap_days}}) are provided by
-- buildTemplateVars in the v127 patch.
--
-- Idempotent: ON CONFLICT (rule_code) DO UPDATE. No rows deleted.
-- Requires: proactive_rules.rule_code UNIQUE (existing seeds rely on it).
-- =====================================================================

-- 1. Behind the surrounding crop --------------------------------------
-- Parcel NDVI is >= 1.5 robust MAD below the crop ring around it on the
-- same pass. Neighbours share the weather, so this isolates the field's
-- own condition from the season. Watch-level: ask the farmer to look.
insert into public.proactive_rules
  (rule_code, condition_type, alert_category, priority, crop_code, stage_applicable, cooldown_hours, is_active,
   title_en, message_template_en, action_template_en, scientific_source, conditions)
values
  ('SAT_BEHIND_SURROUNDINGS_001', 'satellite', 'crop_stress', 'LOW', null, null, 120, true,
   'Field looks behind nearby crop',
   'On the last clear satellite view ({{ndvi_age_days}} days ago) {{land}} looked weaker than the crop around it. Weather was the same for both, so the difference is in the field itself.',
   'Walk the field and look for weak patches, water shortage or pest damage. If you see something, send a photo from that spot.',
   'Parcel-vs-context robust z (ndvi_intelligence.parcel_context_robust_z); Sitokonstantinou et al. 2020 for the EPC>=8 support anchor',
   jsonb_build_object(
     'all', jsonb_build_array(
       jsonb_build_object('op','gte','path','ndvi.is_fresh','value',1),
       jsonb_build_object('op','gte','path','ndvi.evidence_rank','value',2),
       jsonb_build_object('op','eq','path','ndvi.context_present','value',1),
       jsonb_build_object('op','lte','path','ndvi.cohort_z','value',-1.5)),
     'metadata', jsonb_build_object('engine','env-intelligence','method','satellite_cohort_anomaly','compiler','manual-2026-09-20',
                                    'observed_or_predicted','observed')))
on conflict (rule_code) do update set
  condition_type=excluded.condition_type, alert_category=excluded.alert_category, priority=excluded.priority,
  cooldown_hours=excluded.cooldown_hours, is_active=excluded.is_active, title_en=excluded.title_en,
  message_template_en=excluded.message_template_en, action_template_en=excluded.action_template_en,
  scientific_source=excluded.scientific_source, conditions=excluded.conditions, updated_at=now();

-- 2. Canopy moisture falling while soil water is depleted -----------------
-- NDMI (B8A/B11) fell by >= 0.05 between the two newest clear passes
-- (<= 15 days apart) AND the FAO-56 water balance says root-zone depletion
-- has reached readily-available water (derived.root_depletion >= raw_mm).
-- Two independent sources agreeing -> irrigation warning.
insert into public.proactive_rules
  (rule_code, condition_type, alert_category, priority, crop_code, stage_applicable, cooldown_hours, is_active,
   title_en, message_template_en, action_template_en, scientific_source, conditions)
values
  ('SAT_CANOPY_MOISTURE_DROP_001', 'satellite', 'irrigation', 'MEDIUM', null, null, 72, true,
   'Crop moisture is dropping',
   'The satellite moisture signal for {{land}} fell over the last {{pass_gap_days}} days, and the soil water balance shows the root zone has used up its easily available water.',
   'Check the field for wilting or curling leaves. If water is available, irrigate soon; if it rained recently, wait one day and check again.',
   'NDMI (Gao 1996) on Sentinel-2 B8A/B11; FAO Irrigation and Drainage Paper 56 readily-available-water depletion trigger',
   jsonb_build_object(
     'all', jsonb_build_array(
       jsonb_build_object('op','gte','path','ndvi.is_fresh','value',1),
       jsonb_build_object('op','gte','path','ndvi.evidence_rank','value',2),
       jsonb_build_object('op','lte','path','ndvi.pass_gap_days','value',15),
       jsonb_build_object('op','gte','path','ndvi.ndmi_drop','value',0.05),
       jsonb_build_object('op','gte_field','path','derived.root_depletion','field','derived.raw_mm')),
     'metadata', jsonb_build_object('engine','env-intelligence','method','satellite_moisture_x_water_balance','compiler','manual-2026-09-20',
                                    'observed_or_predicted','observed')))
on conflict (rule_code) do update set
  condition_type=excluded.condition_type, alert_category=excluded.alert_category, priority=excluded.priority,
  cooldown_hours=excluded.cooldown_hours, is_active=excluded.is_active, title_en=excluded.title_en,
  message_template_en=excluded.message_template_en, action_template_en=excluded.action_template_en,
  scientific_source=excluded.scientific_source, conditions=excluded.conditions, updated_at=now();

-- 3. Leaf greenness falling while vigour holds --------------------------
-- Red-edge NDRE dropped >= 0.04 while NDVI dropped <= 0.03 between the two
-- newest passes: chlorophyll is going before canopy mass does — the
-- earliest satellite-visible nutrient signal. Watch-level: check leaf colour.
insert into public.proactive_rules
  (rule_code, condition_type, alert_category, priority, crop_code, stage_applicable, cooldown_hours, is_active,
   title_en, message_template_en, action_template_en, scientific_source, conditions)
values
  ('SAT_LEAF_GREENNESS_DROP_001', 'satellite', 'nutrient', 'LOW', null, null, 168, true,
   'Leaves losing green colour',
   'Over the last {{pass_gap_days}} days the satellite saw the leaves of {{land}} lose green colour while the crop cover itself held. This often shows before the plant looks weak.',
   'Look at the older leaves: yellowing from the tip inward points to nitrogen shortage. Send a close-up photo of a leaf before deciding on any fertiliser.',
   'Red-edge chlorophyll sensitivity (Gitelson & Merzlyak 1994; Sentinel-2 B05/B8A NDRE)',
   jsonb_build_object(
     'all', jsonb_build_array(
       jsonb_build_object('op','gte','path','ndvi.is_fresh','value',1),
       jsonb_build_object('op','gte','path','ndvi.evidence_rank','value',2),
       jsonb_build_object('op','lte','path','ndvi.pass_gap_days','value',15),
       jsonb_build_object('op','gte','path','ndvi.ndre_drop','value',0.04),
       jsonb_build_object('op','lte','path','ndvi.drop','value',0.03)),
     'metadata', jsonb_build_object('engine','env-intelligence','method','satellite_red_edge_divergence','compiler','manual-2026-09-20',
                                    'observed_or_predicted','observed')))
on conflict (rule_code) do update set
  condition_type=excluded.condition_type, alert_category=excluded.alert_category, priority=excluded.priority,
  cooldown_hours=excluded.cooldown_hours, is_active=excluded.is_active, title_en=excluded.title_en,
  message_template_en=excluded.message_template_en, action_template_en=excluded.action_template_en,
  scientific_source=excluded.scientific_source, conditions=excluded.conditions, updated_at=now();

-- 4. Forecast says growth will slow ------------------------------------
-- The pipeline's fail-closed temporal forecast (>= 3 quality passes) puts
-- even its HIGH bound below today's value, 3+ days out. Predicted, so
-- watch-level only; the message says it is a forecast.
insert into public.proactive_rules
  (rule_code, condition_type, alert_category, priority, crop_code, stage_applicable, cooldown_hours, is_active,
   title_en, message_template_en, action_template_en, scientific_source, conditions)
values
  ('SAT_FORECAST_DECLINE_001', 'satellite', 'crop_stress', 'LOW', null, null, 168, true,
   'Growth may slow in the coming days',
   'Based on the last few clear satellite views, growth in {{land}} is expected to slow over the next one to two weeks. This is a forecast, not something seen yet.',
   'Keep an eye on the field this week. Check water and look for any change in leaf colour; if you notice something, send a photo.',
   'ndvi_intelligence predicted rows (weighted linear trend, interval-bounded, fail-closed below 3 observations)',
   jsonb_build_object(
     'all', jsonb_build_array(
       jsonb_build_object('op','gte','path','ndvi.is_fresh','value',1),
       jsonb_build_object('op','gte','path','ndvi.evidence_rank','value',2),
       jsonb_build_object('op','gte','path','ndvi.forecast_days_ahead','value',3),
       jsonb_build_object('op','lt_field','path','ndvi.forecast_high','field','ndvi.value')),
     'metadata', jsonb_build_object('engine','env-intelligence','method','satellite_temporal_forecast','compiler','manual-2026-09-20',
                                    'observed_or_predicted','predicted')))
on conflict (rule_code) do update set
  condition_type=excluded.condition_type, alert_category=excluded.alert_category, priority=excluded.priority,
  cooldown_hours=excluded.cooldown_hours, is_active=excluded.is_active, title_en=excluded.title_en,
  message_template_en=excluded.message_template_en, action_template_en=excluded.action_template_en,
  scientific_source=excluded.scientific_source, conditions=excluded.conditions, updated_at=now();

-- =====================================================================
-- VERIFICATION (read-only)
-- =====================================================================
-- select rule_code, alert_category, priority, cooldown_hours, is_active,
--        conditions->'metadata'->>'engine' as engine, jsonb_array_length(conditions->'all') as predicates
--   from proactive_rules where rule_code like 'SAT_%' order by 1;
--   -- expect 4 rows, engine = env-intelligence, predicates 4/5/5/4
--
-- After the next evaluator run:
-- select rule_id, count(*), max(created_at) from proactive_alerts
--  where rule_id like 'SAT_%' group by 1;
-- select land_id, rule_code, fired, reasoning from proactive_evaluation_log
--  where rule_code like 'SAT_%' order by created_at desc limit 20;
