INSERT INTO public.system_config (config_key, config_value, description) VALUES
  ('evidence_weight_assertion_literal', '1.0'::jsonb, 'Evidence weight for assertion_strength=LITERAL'),
  ('evidence_weight_assertion_strong_hypothesis', '0.75'::jsonb, 'Evidence weight for assertion_strength=STRONG_HYPOTHESIS'),
  ('evidence_weight_assertion_differential', '0.45'::jsonb, 'Evidence weight for assertion_strength=DIFFERENTIAL'),
  ('evidence_weight_assertion_default', '0.45'::jsonb, 'Evidence weight for unknown/null assertion_strength'),
  ('evidence_weight_rank_decay', '0.05'::jsonb, 'Per-rank multiplicative decay applied to confidence_rank'),
  ('evidence_weight_diagnostic_boost', '1.25'::jsonb, 'Boost applied when observation_master.is_diagnostic = true'),
  ('evidence_weight_source_farmer_confirmed', '1.0'::jsonb, 'Evidence weight for farmer-confirmed observations'),
  ('evidence_weight_source_farmer_stated', '0.95'::jsonb, 'Evidence weight for farmer-stated observations'),
  ('evidence_weight_source_vision', '0.85'::jsonb, 'Evidence weight for vision-derived observations'),
  ('evidence_weight_source_sensor', '0.9'::jsonb, 'Evidence weight for sensor-derived observations'),
  ('evidence_weight_source_inferred_peer', '0.6'::jsonb, 'Evidence weight for IOM-inferred peer observations'),
  ('evidence_weight_source_default', '0.6'::jsonb, 'Evidence weight for unknown observation sources'),
  ('evidence_iom_fallback_max_inject', '12'::jsonb, 'Max observations injected by the zero-observation intent fallback')
ON CONFLICT (config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description,
      updated_at   = now();