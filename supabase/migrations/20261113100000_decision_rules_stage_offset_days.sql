-- 2026-11-13 — a rule's own timing inside its crop stage, as data.
--
-- The static schedule dated every rule card at the first day of its stage, so on the transplanting
-- day a farmer read "apply blue-green algae" and "run the weeder" beside "plant the seedlings",
-- although each rule's own text says 8-10 and 15 days after planting. The day lived only in prose.
-- stage_offset_days_min / max hold it as numbers: days after the START of the rule's stage.
-- NULL means "at the start of the stage" (today's behaviour), so the change is additive.
--
-- Every value below is copied from that rule's own action_text; nothing is estimated.
-- Additive columns + targeted UPDATEs by rule_id. No row is deleted. No session state.

ALTER TABLE public.decision_rules
  ADD COLUMN IF NOT EXISTS stage_offset_days_min integer,
  ADD COLUMN IF NOT EXISTS stage_offset_days_max integer;

ALTER TABLE public.decision_rules DROP CONSTRAINT IF EXISTS decision_rules_stage_offset_days_chk;
ALTER TABLE public.decision_rules ADD CONSTRAINT decision_rules_stage_offset_days_chk
  CHECK (
    (stage_offset_days_min IS NULL AND stage_offset_days_max IS NULL)
    OR (stage_offset_days_min >= 0 AND (stage_offset_days_max IS NULL OR stage_offset_days_max >= stage_offset_days_min))
  );

COMMENT ON COLUMN public.decision_rules.stage_offset_days_min IS
  'Days after the START of the rule''s crop stage at which the action first falls due (from the rule''s own source text). NULL = at the start of the stage.';
COMMENT ON COLUMN public.decision_rules.stage_offset_days_max IS
  'Last day of the action''s window, in days after the start of the rule''s crop stage. NULL = same day as stage_offset_days_min.';

-- "Keep a 2 cm water layer until 7 days after transplanting"
UPDATE public.decision_rules SET stage_offset_days_min = 0, stage_offset_days_max = 7
 WHERE rule_id = 'RICE_IRRIG_ESTABLISH_MH_DRAFT_001';
-- "apply blue-green algae ... 8 to 10 days after planting, or Azolla ... 10 days after planting"
UPDATE public.decision_rules SET stage_offset_days_min = 8, stage_offset_days_max = 10
 WHERE rule_id = 'RICE_ORG_BGA_AZOLLA_MH_001';
-- "Keep the field weed-free for the first 45 days. Run the rotary or cono weeder from 15 days after transplanting"
UPDATE public.decision_rules SET stage_offset_days_min = 15, stage_offset_days_max = 45
 WHERE rule_id = 'RICE_WEED_CRITICAL_PERIOD_MH_DRAFT_001';

-- Two rules were filed under the nursery stage although their own text is main-field land
-- preparation work, so they appeared on the nursery card and the land-preparation card was empty.
-- "Before transplanting ... bury 3 to 5 tonnes per hectare of green manure ... in the puddle"
UPDATE public.decision_rules SET stage_applicable = ARRAY['land_preparation']::text[]
 WHERE rule_id = 'RICE_ORG_GREEN_MANURE_MH_001';
-- "plough deep and trim the field bunds, and when preparing the land fill in the old burrows"
UPDATE public.decision_rules SET stage_applicable = ARRAY['land_preparation']::text[]
 WHERE rule_id = 'RICE_PEST_RODENT_CULTURAL_MH_001';
