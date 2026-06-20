ALTER TABLE public.observation_master
  ALTER COLUMN canonical_group SET NOT NULL;

ALTER TABLE public.observation_master
  DROP CONSTRAINT IF EXISTS observation_master_canonical_group_allowed;

ALTER TABLE public.observation_master
  ADD CONSTRAINT observation_master_canonical_group_allowed
  CHECK (canonical_group IN (
    '01_physiology','01_stage','02_disease','02_stage_awareness',
    '03_pest','04_disease','04_irrigation',
    '05_nutrient','05_nutrition','05_soil',
    '06_abiotic','06_irrigation','06_soil','06_stress','06_weed',
    '07_diagnosis','07_monitoring','07_soil','07_stage',
    '08_management','08_remote_sensing','08_stress','08_weed',
    '09_general',
    '10_stress_weather','10_weather',
    '11_economics','11_harvest','11_remote_sensing','11_weather',
    '12_management','12_safety',
    '13_diagnosis',
    '15_deficiency','15_soil','15_stage',
    '16_stress',
    '17_management'
  ));