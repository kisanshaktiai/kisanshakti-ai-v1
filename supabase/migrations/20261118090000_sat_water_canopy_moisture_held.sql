-- =============================================================================
-- SAT_WATER_CORROBORATION 1.1 — "canopy moisture held" limits for
-- proactive-evaluator v131 (env-derived.ts canopyMoistureHeldNumbers).
-- 2026-11-18
--
-- FOR REVIEW. One statement, idempotent, no session state, nothing deleted.
-- Applying this row is the agronomist's approval of the four new limits.
-- Until it is applied, v131 reads the 1.0 row (no held_* keys) and behaves
-- exactly as v130.
--
-- Finding: 1,050 IRRIGATION alerts in 45 days (0 pushed, 0 acted on). The
-- root-zone bucket of 29 of 31 lands sat at "empty" because no watering had
-- ever been recorded (0 IRRIGATION_APPLIED events). Takale mala (drip
-- sugarcane) has been "empty" since 2026-09-04 while its NDMI over 11 clear
-- passes stayed 0.275–0.301.
--
-- New limits (engineering start values; re-fit against field checks):
--   held_lookback_days        90   baseline window starts this many days
--                                  before the newest pass
--   held_exclude_recent_days  21   ...and ends this many days before it
--   held_min_baseline_passes   2   supported passes needed in that window
--   held_max_shortfall      0.03   baseline best NDMI − recent NDMI at or
--                                  below this = canopy moisture held
--                                  (pass-to-pass noise on Takale: SD 0.008)
-- Verdict -1 applies only when the water state is UNVERIFIED; rule rows
-- route -1 to IRRIGATION_CHECK_FIELD ("check the soil before watering").
-- Replay on 2026-11-18 live data: 9 lands move from "time to water" to
-- "check the soil"; Kodoli Mala (shortfall 0.126) and Shinghan Mal (0.311),
-- both field-confirmed stress, keep "time to water".
--
-- ROLLBACK (no delete): UPDATE public.sci_method_registry
--   SET review_status = 'deprecated' WHERE method_id = 'SAT_WATER_CORROBORATION' AND version = '1.1';
--   The evaluator then reads 1.0 again on its next run.
-- =============================================================================

INSERT INTO public.sci_method_registry
  (method_id, version, method_kind, equation_ref, authoritative_source, inputs, outputs, params,
   applicable_crops, geographic_scope, review_status, review_notes)
VALUES (
  'SAT_WATER_CORROBORATION', '1.1', 'threshold_set',
  'Satellite check on the FAO-56 root-zone bucket: verdict -1 when MNDWI p90 >= surface_water_index_min on a recent pass; -1 when the water state is unverified and (best NDMI in [newest - held_lookback_days, newest - held_exclude_recent_days], at least held_min_baseline_passes passes) - (mean NDMI of the newest two passes) <= held_max_shortfall; otherwise 1 when field-mean NDMI fell by >= ndmi_change_min between the two newest passes, -1 when it rose by >= ndmi_change_min, else 0',
  'NDMI (Gao 1996) canopy water index and MNDWI (Xu 2006) open-water index from Sentinel-2 L2A, as stored by kisanshaktiai_ndvi_pipeline; noise floor and windows set by the agronomist',
  '{"required": ["ndmi", "ndmi_previous", "pass_gap_days"], "optional": ["surface_water_p90", "surface_water_date", "ndmi_history", "water_state_verified"]}'::jsonb,
  '{"water_sat_agree": "1 | 0 | -1"}'::jsonb,
  '{"ndmi_change_min": 0.02, "max_pass_gap_days": 30, "min_evidence_rank": 1, "surface_water_index_min": 0, "surface_water_max_age_days": 10, "held_lookback_days": 90, "held_exclude_recent_days": 21, "held_min_baseline_passes": 2, "held_max_shortfall": 0.03}'::jsonb,
  '{}', '{IN}', 'approved',
  '2026-11-18: added with proactive-evaluator v131 (canopy moisture held). 1.0 params carried over unchanged. Re-fit held_max_shortfall against field checks after 4 labelled weeks.'
)
ON CONFLICT (method_id, version) DO NOTHING;
