-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- PATH : supabase/migrations/20260926140000_ai_route_brain_explain_reasoning.sql
-- STATUS: FOR REVIEW ONLY — NOT APPLIED.
-- DEPENDS ON: 20260925120000_ai_model_registry.sql, 20260926100000_ai_registry_retire_gemini_2_5.sql
--
-- PURPOSE — set reasoning effort for the AI task `brain.explain`, the first
-- call site wired to the SSOT router (agents/llm-response-formatter.ts
-- explainerLLM, commit on 2026-09-26).
--
-- WHY (evidence 2026-09-26, chat trace trace_muib5ioe_2jc6ov, land 30197c15):
--   * The explainer called gpt-5.6-luna with no reasoning_effort. OpenAI's
--     model page: "Reasoning.effort supports: none, low, medium (default),
--     high, xhigh, and max" — so every call ran at `medium`.
--   * Reasoning tokens are generated before visible text and count against
--     max_completion_tokens. Both explanation passes hit the 8 s cap
--     ("OpenAI call failed: TIMEOUT"), and the farmer received a facts-only
--     card. Short critic replies on the same model returned in 3–5 s.
--   * ai_chat_messages shows the same FACTS_ONLY outcome on 2026-09-17, so
--     this predates the Gemini change.
--
-- VALUE: 'low' is the lowest effort every model in the brain.explain chain
-- accepts (gpt-5.6-luna: none|low|…; gemini-3.5-flash-lite and Lovable
-- gemini-3.8-flash: minimal|low|…). The route guard rejects a value any step
-- cannot take. Whether 'low' brings the explanation inside 8 s is measured by
-- the usage ledger (ai_model_metrics.avg_response_time_ms, reasoning_tokens)
-- on the first live turns — not assumed here.
--
-- EFFECT: only callers that go through callAITask('brain.explain') — today
-- the chat explainer. Reversible: set params back to '{}'.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.ai_task_route
   SET params        = params || '{"reasoning_effort":"low"}'::jsonb,
       change_reason = 'brain.explain: explicit reasoning effort (2026-09-26); gpt-5.6-luna default medium made the explainer time out at 8 s'
 WHERE task_key = 'brain.explain'
   AND params->>'reasoning_effort' IS DISTINCT FROM 'low';

-- VERIFY (read-only)
SELECT 'brain.explain reasoning_effort' AS check_name,
       (SELECT params->>'reasoning_effort' FROM public.ai_task_route WHERE task_key = 'brain.explain') AS got,
       'low' AS expected
UNION ALL
SELECT 'brain.explain steps unchanged',
       (SELECT string_agg(step_no || ':' || model_key, ' → ' ORDER BY step_no) FROM public.ai_task_route_step WHERE task_key = 'brain.explain'),
       '1:openai:gpt-5.6-luna → 2:gemini:gemini-3.5-flash-lite → 3:lovable:google/gemini-3.8-flash'
UNION ALL
SELECT 'other routes with params', count(*)::text, '0'
  FROM public.ai_task_route WHERE task_key <> 'brain.explain' AND params <> '{}'::jsonb;
