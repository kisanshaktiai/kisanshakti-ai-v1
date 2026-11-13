-- 2026-11-13 — core field practices become dated operations of the static crop schedule.
--
-- Seed treatment, the nursery bed, puddling and gap filling are stored as general advice rules
-- (trigger_class OBSERVATION on a generic condition code), so the schedule never showed them as
-- work to do; they surfaced only as "watch for ... if seen" lines on scouting cards.
-- schedule_role = 'operation' marks a rule as a stage operation of the static schedule and
-- schedule_stage names its crop stage. trigger_class and every other column are unchanged, so
-- every other consumer of these rules behaves as before.
-- Additive columns + targeted UPDATEs by rule_id. No row is deleted. No session state.

ALTER TABLE public.decision_rules
  ADD COLUMN IF NOT EXISTS schedule_role text,
  ADD COLUMN IF NOT EXISTS schedule_stage text;

ALTER TABLE public.decision_rules DROP CONSTRAINT IF EXISTS decision_rules_schedule_role_chk;
ALTER TABLE public.decision_rules ADD CONSTRAINT decision_rules_schedule_role_chk
  CHECK (schedule_role IS NULL OR schedule_role IN ('operation'));

COMMENT ON COLUMN public.decision_rules.schedule_role IS
  'operation = the static crop schedule shows this rule as a dated stage operation, whatever its trigger_class. NULL = no schedule role.';
COMMENT ON COLUMN public.decision_rules.schedule_stage IS
  'Crop stage (crop_stage_master.growth_stage) the schedule operation belongs to. Used only with schedule_role.';

UPDATE public.decision_rules SET schedule_role = 'operation', schedule_stage = 'nursery'
 WHERE rule_id IN ('RICE_DISEASE_SEED_TREATMENT_001', 'RICE_MGT_NURSERY_BED_001');
UPDATE public.decision_rules SET schedule_role = 'operation', schedule_stage = 'land_preparation'
 WHERE rule_id = 'RICE_SOIL_LAND_PREP_PUDDLING_001';
-- "Survey field 7-10 days after transplanting ... complete by 15 DAT"
UPDATE public.decision_rules SET schedule_role = 'operation', schedule_stage = 'transplant_establishment',
       stage_offset_days_min = 7, stage_offset_days_max = 15
 WHERE rule_id = 'RICE_MGT_GAP_FILLING_001';
