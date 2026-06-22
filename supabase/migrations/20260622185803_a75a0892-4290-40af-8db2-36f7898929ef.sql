
DROP VIEW IF EXISTS public.v_ai_clarification_attribution_90d;

CREATE VIEW public.v_ai_clarification_attribution_90d AS
WITH base AS (
  SELECT
    m.id,
    m.session_id,
    m.created_at,
    COALESCE(LOWER(m.metadata->>'crop_context'), 'unknown') AS crop_context,
    m.metadata->>'orchestrator_type'  AS response_type,
    COALESCE((m.metadata->>'rules_applied')::int, 0) AS rules_fired,
    m.metadata->'decision_brain_data' AS dbd,
    (m.metadata->'decision_brain_data'->'analysis'->>'top_confidence')::numeric AS top_conf,
    COALESCE(jsonb_array_length(m.metadata->'decision_brain_data'->'competing_hypotheses'), 0) AS n_competing,
    m.metadata->'decision_brain_data'->>'strategy'      AS strategy,
    LOWER(COALESCE(m.metadata->>'escalation_reason','')) AS esc_reason,
    LOWER(COALESCE(m.metadata->>'clarification_reason','')) AS clar_reason,
    m.metadata->'agents_used' AS agents_used,
    m.metadata->>'clarification_origin' AS wave_f_origin
  FROM public.ai_chat_messages m
  WHERE m.role = 'assistant'
    AND m.created_at > now() - interval '90 days'
), classified AS (
  SELECT
    b.*,
    CASE
      WHEN b.response_type <> 'CLARIFICATION_QUESTION' THEN 'non_clarification'
      -- Wave F tag wins when present (new traffic)
      WHEN b.wave_f_origin IS NOT NULL AND b.wave_f_origin <> '' THEN b.wave_f_origin
      -- Retroactive classification for historical traffic
      WHEN b.esc_reason LIKE '%emergency%' THEN 'emergency_triage'
      WHEN b.strategy = 'differential' OR b.n_competing > 1 THEN 'hypothesis_differential'
      WHEN b.rules_fired = 0 AND b.dbd IS NULL THEN 'pre_rule_clarification'
      WHEN b.rules_fired = 0 THEN 'pre_rule_clarification'
      WHEN b.rules_fired > 0 AND b.dbd IS NULL THEN 'pre_brain_clarification'
      WHEN b.rules_fired > 0 AND b.top_conf IS NOT NULL AND b.top_conf < 0.5 THEN 'post_match_low_confidence'
      WHEN b.rules_fired > 0 AND b.n_competing > 0 THEN 'multi_match_competition'
      WHEN b.rules_fired > 0 THEN 'post_match_clarification'
      ELSE 'unclassified'
    END AS clarification_origin
  FROM base b
)
SELECT
  crop_context,
  response_type,
  clarification_origin,
  COUNT(*) AS turns,
  COUNT(*) FILTER (WHERE rules_fired > 0) AS rules_matched_turns,
  COUNT(*) FILTER (WHERE dbd IS NOT NULL) AS reached_decision_brain,
  ROUND(AVG(top_conf)::numeric, 3) AS avg_top_confidence,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen
FROM classified
GROUP BY 1, 2, 3
ORDER BY turns DESC;

REVOKE ALL ON public.v_ai_clarification_attribution_90d FROM anon, authenticated;
GRANT SELECT ON public.v_ai_clarification_attribution_90d TO service_role;
