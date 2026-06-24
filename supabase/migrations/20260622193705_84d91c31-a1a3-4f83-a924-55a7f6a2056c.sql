CREATE OR REPLACE VIEW public.v_ai_clarification_attribution_90d AS
WITH base AS (
  SELECT m.id, m.session_id, m.created_at,
    COALESCE(lower(m.metadata->>'crop_context'),'unknown') AS crop_context,
    m.metadata->>'orchestrator_type' AS response_type,
    COALESCE((m.metadata->>'rules_applied')::int,0) AS rules_fired,
    m.metadata->'decision_brain_data' AS dbd,
    ((m.metadata->'decision_brain_data'->'analysis')->>'top_confidence')::numeric AS top_conf,
    COALESCE(jsonb_array_length(m.metadata->'decision_brain_data'->'competing_hypotheses'),0) AS n_competing,
    (m.metadata->'decision_brain_data')->>'strategy' AS strategy,
    lower(COALESCE(m.metadata->>'escalation_reason','')) AS esc_reason,
    m.metadata->>'clarification_origin' AS wave_f_origin,
    COALESCE(m.metadata->>'clarification_site','untagged') AS clarification_site,
    COALESCE(
      m.metadata->>'clarification_site_disposition',
      CASE m.metadata->>'clarification_site'
        WHEN 'orch.hard_gate_option_reminder'      THEN 'INTENTIONAL_FOLLOWUP'
        WHEN 'orch.stage_clarification'            THEN 'INTENTIONAL_GATE'
        WHEN 'orch.identify_location_invariant'    THEN 'INTENTIONAL_GATE'
        WHEN 'orch.g2_context_completeness'        THEN 'INTENTIONAL_GATE'
        WHEN 'orch.diagnosis_first_options'        THEN 'INTENTIONAL_DIFFERENTIAL'
        WHEN 'decision.diagnosis_first_generator'  THEN 'INTENTIONAL_DIFFERENTIAL'
        WHEN 'orch.multimatch_competition'         THEN 'INTENTIONAL_DIFFERENTIAL'
        WHEN 'orch.diagnostic_state_next_question' THEN 'INTENTIONAL_DIFFERENTIAL'
        WHEN 'orch.dynamic_options'                THEN 'INTENTIONAL_FOLLOWUP'   -- WAVE M reclassification
        WHEN 'orch.mandatory_fallback_observations' THEN 'DEFECT_SUSPECT'
        WHEN 'orch.nlu_low_confidence'             THEN 'DEFECT_SUSPECT'
        WHEN 'orch.intent_lock_all_filtered'       THEN 'DEFECT_SUSPECT'
        ELSE 'UNKNOWN'
      END
    ) AS disposition
  FROM ai_chat_messages m
  WHERE m.role='assistant' AND m.created_at > now() - interval '90 days'
),
classified AS (
  SELECT b.*,
    CASE
      WHEN b.response_type <> 'CLARIFICATION_QUESTION' THEN 'non_clarification'
      WHEN b.disposition = 'INTENTIONAL_DIFFERENTIAL' THEN 'hypothesis_differential'
      WHEN b.disposition = 'INTENTIONAL_FOLLOWUP'     THEN 'intentional_followup'
      WHEN b.disposition = 'INTENTIONAL_GATE'         THEN 'intentional_gate'
      WHEN b.wave_f_origin IS NOT NULL AND b.wave_f_origin NOT IN ('', 'pre_brain_clarification') THEN b.wave_f_origin
      WHEN b.esc_reason LIKE '%emergency%' THEN 'emergency_triage'
      WHEN b.strategy = 'differential' OR b.n_competing > 1 THEN 'hypothesis_differential'
      WHEN b.rules_fired = 0 THEN 'pre_rule_clarification'
      WHEN b.rules_fired > 0 AND b.dbd IS NULL THEN 'pre_brain_clarification'
      WHEN b.rules_fired > 0 AND b.top_conf IS NOT NULL AND b.top_conf < 0.5 THEN 'post_match_low_confidence'
      WHEN b.rules_fired > 0 AND b.n_competing > 0 THEN 'multi_match_competition'
      WHEN b.rules_fired > 0 THEN 'post_match_clarification'
      ELSE 'unclassified'
    END AS clarification_origin
  FROM base b
)
SELECT crop_context, response_type, clarification_origin, disposition, clarification_site,
       COUNT(*) AS turns,
       COUNT(*) FILTER (WHERE rules_fired > 0) AS rules_matched_turns,
       COUNT(*) FILTER (WHERE dbd IS NOT NULL) AS reached_decision_brain,
       ROUND(AVG(top_conf), 3) AS avg_top_confidence,
       MIN(created_at) AS first_seen,
       MAX(created_at) AS last_seen
FROM classified
GROUP BY crop_context, response_type, clarification_origin, disposition, clarification_site
ORDER BY turns DESC;