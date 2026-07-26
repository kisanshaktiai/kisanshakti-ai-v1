INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'clarification_group_priority',
  '{"order":["05_nutrient","06_abiotic","13_diagnosis","17_management","04_disease","03_pest"]}'::jsonb,
  'Ordering priority of hypothesis_master.canonical_group values when building clarification options on a fresh query with no confirmed evidence. Non-pest families are probed first so the option set is not dominated by pests.'
)
ON CONFLICT (config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description = EXCLUDED.description,
      updated_at = now();