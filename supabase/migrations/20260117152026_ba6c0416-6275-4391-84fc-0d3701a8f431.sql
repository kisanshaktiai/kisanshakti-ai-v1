
-- ═══════════════════════════════════════════════════════════════════════════
-- DECISION RULES ACTION TYPE FIX - Based on ICAR IPM Package Analysis
-- Senior Agronomist Review: January 2026
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- PART 1: FIX PEST DIAGNOSIS RULES (03_pest)
-- Per ICAR: Rules that IDENTIFY/DIAGNOSE pests should be 'diagnosis'
-- =============================================================================

-- All 03_pest rules that describe pest symptoms/identification = diagnosis
UPDATE decision_rules 
SET action_type = 'diagnosis'
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '03_pest'
  AND is_active = true
  AND action_type IN ('MONITOR', 'APPLY_AGRONOMIC_PRACTICE', 'RELEASE_PARASITOIDS');

-- =============================================================================
-- PART 2: FIX DISEASE DIAGNOSIS RULES (04_disease)
-- Per ICAR: Disease identification rules = 'diagnosis'
-- =============================================================================

UPDATE decision_rules 
SET action_type = 'diagnosis'
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '04_disease'
  AND is_active = true
  AND action_type IN ('MONITOR', 'RELEASE_PARASITOIDS');

-- =============================================================================
-- PART 3: FIX TREATMENT RULES (13_treatment)
-- Per ICAR IPM Package:
-- - Cultural/Mechanical control = 'prevention' (IPM Level 1)
-- - Biological control = 'treatment' (IPM Level 2)
-- - Chemical control = 'treatment' or 'urgent_treatment' (IPM Level 3)
-- =============================================================================

-- Cultural practices (hot water treatment, crop management) = prevention
UPDATE decision_rules 
SET action_type = 'prevention', ipm_level = 1
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '13_treatment'
  AND is_active = true
  AND (cause ILIKE '%hot water%' 
       OR cause ILIKE '%hot air%'
       OR cause ILIKE '%integrated crop%'
       OR cause ILIKE '%trichoderma%'
       OR cause ILIKE '%pseudomonas%'
       OR cause ILIKE '%azospirillum%');

-- Monitoring tools (traps) = monitoring
UPDATE decision_rules 
SET action_type = 'monitoring', ipm_level = 1
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '13_treatment'
  AND is_active = true
  AND (cause ILIKE '%trap%' OR cause ILIKE '%monitoring%');

-- Biological control (parasitoids, biocontrol) = treatment with IPM Level 2
UPDATE decision_rules 
SET action_type = 'treatment', ipm_level = 2
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '13_treatment'
  AND is_active = true
  AND (cause ILIKE '%trichogramma%'
       OR cause ILIKE '%cotesia%'
       OR cause ILIKE '%epiricania%'
       OR cause ILIKE '%metarhizium%'
       OR cause ILIKE '%predator%'
       OR cause ILIKE '%parasitoid%'
       OR cause ILIKE '%biocontrol%'
       OR cause ILIKE '%barn owl%');

-- Neem-based = treatment IPM Level 2 (Botanical)
UPDATE decision_rules 
SET action_type = 'treatment', ipm_level = 2
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '13_treatment'
  AND is_active = true
  AND cause ILIKE '%neem%';

-- Integrated borer management = treatment (comprehensive)
UPDATE decision_rules 
SET action_type = 'treatment', ipm_level = 2
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '13_treatment'
  AND is_active = true
  AND cause ILIKE '%integrated%borer%';

-- =============================================================================
-- PART 4: FIX GROWTH STAGE RULES (02_growth_stage)
-- Per ICAR: Stage-specific pest/disease rules that diagnose = diagnosis
-- =============================================================================

-- Stage-specific pest diagnosis rules
UPDATE decision_rules 
SET action_type = 'diagnosis'
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '02_growth_stage'
  AND is_active = true
  AND (cause ILIKE '%borer%' 
       OR cause ILIKE '%rot%'
       OR cause ILIKE '%smut%'
       OR cause ILIKE '%wilt%');

-- =============================================================================
-- PART 5: FIX IPM LEVELS FOR PEST/DISEASE DIAGNOSIS RULES
-- Diagnosis rules don't need IPM level (they identify, not treat)
-- =============================================================================

UPDATE decision_rules 
SET ipm_level = NULL
WHERE crop_code = 'sugarcane' 
  AND action_type = 'diagnosis'
  AND is_active = true;

-- =============================================================================
-- PART 6: SET IPM LEVELS FOR PEST RULES THAT CONTAIN TREATMENT INFO
-- Per ICAR: Rules with full IPM info should have ipm_level based on primary method
-- =============================================================================

-- Major borers (ESB, TSB, ISB) with biocontrol emphasis = IPM Level 2
UPDATE decision_rules 
SET ipm_level = 2
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '03_pest'
  AND is_active = true
  AND (rule_id LIKE '%ESB%' OR rule_id LIKE '%TSB%' OR rule_id LIKE '%ISB%');

-- Pyrilla (strong biocontrol with Epiricania) = IPM Level 2
UPDATE decision_rules 
SET ipm_level = 2
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '03_pest'
  AND is_active = true
  AND cause ILIKE '%pyrilla%';

-- Woolly Aphid (biocontrol) = IPM Level 2
UPDATE decision_rules 
SET ipm_level = 2
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '03_pest'
  AND is_active = true
  AND cause ILIKE '%woolly aphid%';

-- Termites, White Grubs (chemical often needed) = IPM Level 3
UPDATE decision_rules 
SET ipm_level = 3
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '03_pest'
  AND is_active = true
  AND (cause ILIKE '%termite%' OR cause ILIKE '%grub%' OR cause ILIKE '%wireworm%');

-- =============================================================================
-- PART 7: SET IPM LEVELS FOR DISEASE RULES
-- Per ICAR: Most disease management is cultural (IPM Level 1)
-- =============================================================================

-- Red Rot, Smut, RSD, Grassy Shoot = Cultural management primary (IPM Level 1)
UPDATE decision_rules 
SET ipm_level = 1
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '04_disease'
  AND is_active = true
  AND (cause ILIKE '%red rot%' 
       OR cause ILIKE '%smut%'
       OR cause ILIKE '%rsd%'
       OR cause ILIKE '%ratoon stunting%'
       OR cause ILIKE '%grassy shoot%'
       OR cause ILIKE '%leaf scald%'
       OR cause ILIKE '%sett rot%');

-- Fungal leaf diseases (spray may be needed) = IPM Level 2
UPDATE decision_rules 
SET ipm_level = 2
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '04_disease'
  AND is_active = true
  AND (cause ILIKE '%rust%' 
       OR cause ILIKE '%spot%'
       OR cause ILIKE '%pokkah%'
       OR cause ILIKE '%wilt%');

-- Viral diseases = IPM Level 1 (no chemical control)
UPDATE decision_rules 
SET ipm_level = 1
WHERE crop_code = 'sugarcane' 
  AND canonical_group = '04_disease'
  AND is_active = true
  AND (cause ILIKE '%virus%' 
       OR cause ILIKE '%mosaic%'
       OR cause ILIKE '%yellow leaf%');

-- =============================================================================
-- PART 8: NORMALIZE action_type values to lowercase (DB constraint)
-- =============================================================================

UPDATE decision_rules 
SET action_type = LOWER(action_type)
WHERE crop_code = 'sugarcane' AND is_active = true;
