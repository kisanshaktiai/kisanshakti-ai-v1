-- 2026-11-13 — rice schedule: three data corrections found by auditing a generated schedule.
-- Targeted UPDATEs only. No row is deleted. No session state. Prior versions stay in the rule snapshots.

-- 1. First top-dressing date. The Maharashtra split schedule names only the stage ("tillering"),
--    so the dose landed on the stage's first day, 10 days after transplanting. The crop guideline
--    row for tillering already states "First N top dressing at 21 DAT". Tillering starts 10 days
--    after transplanting, so the tillering splits carry stage_offset_days = 11.
UPDATE public.fertilizer_recommendation_master f
   SET split_schedule = (
     SELECT jsonb_agg(CASE WHEN lower(e->>'stage') = 'tillering' THEN e || jsonb_build_object('stage_offset_days', 11) ELSE e END ORDER BY ord)
       FROM jsonb_array_elements(f.split_schedule::jsonb) WITH ORDINALITY AS x(e, ord))
 WHERE f.id = '12b58d80-6eae-433d-a6a7-f6fb943f376f'
   AND jsonb_typeof(f.split_schedule::jsonb) = 'array';

-- 2. A Maharashtra nursery rule quoted Punjab and Tamil Nadu seed rates. The Maharashtra seed rate
--    is its own rule (RICE_MGT_SEED_RATE_TP_MH_001); this rule keeps only its region-neutral practice.
UPDATE public.decision_rules
   SET action_text = 'Use certified seed of a variety recommended for your district. Float the seed in water and discard what floats, then sow on a raised bed.'
 WHERE rule_id = 'RICE_NURSERY_SEED_MH_DRAFT_001';

-- 3. Two observation rules describe symptoms on a standing rice crop (stunted patches, white leaf
--    tips) but were also filed under land preparation, where there is no crop to observe.
UPDATE public.decision_rules
   SET stage_applicable = array_remove(stage_applicable, 'land_preparation')
 WHERE rule_id IN ('RICE_PEST_ROOT_NEMATODE_PSEUDOMONAS_TNAU_001', 'RICE_PEST_WHITE_TIP_NEMATODE_SEED_TNAU_001');
