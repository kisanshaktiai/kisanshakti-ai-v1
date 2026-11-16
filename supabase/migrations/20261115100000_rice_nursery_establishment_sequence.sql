-- 2026-11-15 — Rice nursery establishment: order of work and seed treatment (agronomy data).
-- STAGING FIRST; apply to production only with the matching ai-smart-schedule deploy. No row deleted.
-- No session state. Evidence: live schedule 4fa451a0-f237-4a4a-8494-cff72e4a6218 (Rice Indrayani,
-- transplanted, Kodoli): day-0 nursery showed scouting before seed treatment, the fungicide seed
-- dressing was missing, and the biofertilizer card said "after the seed dressing" with no dressing.
--
-- Correct practice on nursery day 0 (seed → treatment → sowing):
--   1. certified seed of the variety + seed quantity; float the seed in water, discard what floats
--   2. seed dressing with fungicide (RICE_DISEASE_SEED_TREATMENT_001), dry in shade
--   3. biofertilizer on the dressed seed (RICE_MGT_SEED_BIOFERT_MH_001: Azotobacter + PSB 25 g/kg each)
--   4. sow the treated seed on raised nursery beds (RICE_MGT_NURSERY_SOWING_WINDOW_MH_001)
-- The generator orders steps inside a stage card by decision_rules.sequence_after (existing column).

-- 1. The seed-selection rule ended with "then sow on a raised bed", which put sowing BEFORE seed
--    treatment. Sowing on raised beds is already the subject of RICE_MGT_NURSERY_SOWING_WINDOW_MH_001.
update public.decision_rules
   set action_text = replace(action_text, ', then sow on a raised bed.', '.'), updated_at = now()
 where rule_id = 'RICE_NURSERY_SEED_MH_DRAFT_001'
   and action_text like '%, then sow on a raised bed.%';

-- 2. The fungicide dressing is done after the seed is selected and floated.
update public.decision_rules
   set sequence_after = array['RICE_NURSERY_SEED_MH_DRAFT_001', 'RICE_MGT_SEED_RATE_TP_MH_001'], updated_at = now()
 where rule_id = 'RICE_DISEASE_SEED_TREATMENT_001'
   and coalesce(sequence_after, '{}') = '{}';

-- 3. The biofertilizer is applied TO THE SEED, after the fungicide dressing (its own text says so).
--    application_method marks it a seed treatment (it was filed as organic field feeding).
update public.decision_rules
   set application_method = 'seed_treatment_biofertilizer',
       sequence_after = array['RICE_DISEASE_SEED_TREATMENT_001'], updated_at = now()
 where rule_id = 'RICE_MGT_SEED_BIOFERT_MH_001'
   and application_method is null;

-- 4. Sowing on the raised nursery bed comes after the seed is treated.
update public.decision_rules
   set sequence_after = array['RICE_MGT_SEED_BIOFERT_MH_001'], updated_at = now()
 where rule_id = 'RICE_MGT_NURSERY_SOWING_WINDOW_MH_001'
   and coalesce(sequence_after, '{}') = '{}';

-- 5. Chaar sutri (four-point rice) is a whole-season SYSTEM: husk ash in the nursery, straw at ploughing,
--    gliricidia at puddling, paired-row planting and urea-DAP briquettes at 170 kg/ha. As one dated card it
--    landed on nursery day 0 with a fertilizer dose that would be added ON TOP of the season's NPK
--    programme. It stays active as knowledge (chat, advisory); it is taken off the dated calendar until an
--    agronomist splits it into stage rules that REPLACE the standard programme when the farmer chooses it.
--    requires_field_action is read only by ai-smart-schedule.
update public.decision_rules
   set requires_field_action = false, updated_at = now()
 where rule_id = 'RICE_MGT_CHAAR_SUTRI_MH_001'
   and requires_field_action = true;
