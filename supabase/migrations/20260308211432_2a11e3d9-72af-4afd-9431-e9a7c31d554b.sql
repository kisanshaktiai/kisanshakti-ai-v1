-- P0 Fix #1: Consolidate 02_disease → 04_disease
UPDATE decision_rules SET canonical_group = '04_disease' WHERE canonical_group = '02_disease';

-- P0 Fix #2: Fix NULL canonical_group (physiology rules → stress_weather)
UPDATE decision_rules SET canonical_group = '10_stress_weather' WHERE canonical_group IS NULL AND category = 'physiology';

-- P0 Fix #3: Replace restricted Chlorpyrifos with safer Chlorantraniliprole in TOP_BORER_004
UPDATE decision_rules 
SET active_ingredient = 'Chlorantraniliprole 18.5% SC',
    dosage_per_acre = 'Chlorantraniliprole 18.5% SC @ 150ml/acre in 200L water',
    updated_at = now()
WHERE rule_id = 'SC_PEST_TOP_BORER_004';

-- P0 Fix #4: Populate missing reason_text for 11 disease rules
UPDATE decision_rules SET reason_text = 'Ring spot fungal infection causes leaf damage reducing photosynthesis and yield.' WHERE rule_id IN ('SC_DISEASE_RING_SPOT_003', 'SC_DISEASE_RING_SPOT_004') AND reason_text IS NULL;
UPDATE decision_rules SET reason_text = 'Eye spot disease causes characteristic lesions reducing leaf area and cane quality.' WHERE rule_id IN ('SC_DISEASE_EYE_SPOT_003', 'SC_DISEASE_EYE_SPOT_004') AND reason_text IS NULL;
UPDATE decision_rules SET reason_text = 'Pokkah boeng is a critical fungal disease causing top rot and stalk collapse if untreated.' WHERE rule_id IN ('SC_DISEASE_POKKAH_BOENG_003', 'SC_DISEASE_POKKAH_BOENG_004') AND reason_text IS NULL;
UPDATE decision_rules SET reason_text = 'Grassy shoot phytoplasma produces grass-like tillers with zero cane formation - total crop loss if spread.' WHERE rule_id IN ('SC_DISEASE_GRASSY_SHOOT_003', 'SC_DISEASE_GRASSY_SHOOT_004') AND reason_text IS NULL;
UPDATE decision_rules SET reason_text = 'Leaf scald bacterial infection spreads through contaminated setts and tools, causing systemic wilt.' WHERE rule_id IN ('SC_DISEASE_LEAF_SCALD_004', 'SC_DISEASE_LEAF_SCALD_005') AND reason_text IS NULL;

-- P0 Fix #5: Delete placeholder/template rule
DELETE FROM decision_rules WHERE rule_id = 'RULE_ID_HERE';