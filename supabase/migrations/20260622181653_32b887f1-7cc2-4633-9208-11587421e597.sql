
CREATE OR REPLACE VIEW public.v_ai_drop_attribution_90d AS
SELECT
  LOWER(COALESCE(metadata->>'crop_context', 'unknown'))     AS crop_context,
  COALESCE(metadata->>'orchestrator_type', 'unknown')        AS response_type,
  COALESCE(metadata->>'response_source', 'unknown')          AS response_source,
  COALESCE(metadata->>'funnel_largest_drop', 'unknown')      AS drop_stage,
  COUNT(*)                                                   AS turns,
  COUNT(*) FILTER (
    WHERE COALESCE((metadata->>'rules_applied')::int, 0) > 0
  )                                                          AS rules_matched_turns,
  COUNT(metadata->'decision_brain_data'->'primary_decision'->>'rule_id')
                                                             AS primary_decision_turns,
  COALESCE(SUM((metadata->>'funnel_largest_drop_count')::int), 0)
                                                             AS rules_lost_at_drop_stage
FROM public.ai_chat_messages
WHERE role = 'assistant'
  AND created_at > now() - interval '90 days'
GROUP BY 1,2,3,4;

REVOKE ALL ON public.v_ai_drop_attribution_90d FROM anon, authenticated;
GRANT SELECT ON public.v_ai_drop_attribution_90d TO service_role;

COMMENT ON VIEW public.v_ai_drop_attribution_90d IS
  'WS13 Wave E: per-crop, per-response-type, per-drop-stage attribution of the match-to-decision pipeline. Service-role only.';
