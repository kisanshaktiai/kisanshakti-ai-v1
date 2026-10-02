-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- PATH : supabase/migrations/20260927100000_ai_registry_call_site_routes.sql
-- STATUS: FOR REVIEW ONLY — NOT APPLIED.
-- DEPENDS ON: 20260925120000_ai_model_registry.sql, 20260926100000_ai_registry_retire_gemini_2_5.sql,
--             20260926140000_ai_route_brain_explain_reasoning.sql (all applied live).
-- APPLY ORDER: BEFORE deploying the 2026-09-27 "AI model SSOT — all call sites" edge-function
--             code. The new code names task brain.format; without this migration that call answers
--             route_missing and the chat answer falls back to the deterministic template.
--
-- PURPOSE — registry rows the call-site migration needs. NO model changes: every route keeps
-- exactly the models the code used on 2026-09-26, so the deploy changes WHERE the model name
-- comes from, not WHICH model answers. (Switching to gpt-6-luna is a separate, optional
-- migration: 20260927110000_ai_registry_gpt6_luna_trial.sql.)
--
--   §1 NEW route brain.format — formatRecommendationsWithLLM (agents/llm-response-formatter.ts),
--      the chat answer writer. Until now it had its own hardcoded tiers
--      OpenAI AI_MODELS.openai.default → Gemini AI_MODELS.gemini.default → Lovable
--      AI_MODELS.lovable.default = gpt-5.6-luna → gemini-3.5-flash-lite → google/gemini-3.8-flash.
--      Same three models, same order. params {"reasoning_effort": "low"} — the ONE deliberate
--      deviation from parity: the old formatter sent no reasoning effort, so gpt-5.6-luna ran at its
--      default `medium` and timed out at the 8 s cap (the same finding that gave brain.explain
--      `low` in 20260926140000). `low` is accepted by every step model (route guard checks it).
--      It gets its own route (not brain.explain) so each job can be given its own model later.
--   §2 community.caption required_modalities text → text+image. community-caption-suggest sends
--      the farmer's photo; the seed declared text only, so the route guard would have accepted a
--      text-only model for an image task. Its model (lovable gemini-3-flash-preview) accepts images.
--   §3 brain.explain description — the answer writer now has brain.format; brain.explain serves the
--      explainer (explainerLLM) and llm-response-generator.ts.
--   §4 vision.photo_chat deactivated — its only caller, photo/photo-analyzer.ts, was dead code (no
--      importer; replaced by photo/perception-engine.ts, task vision.diagnose) and is deleted by
--      the same code change. The row is kept (never deleted), is_active = false.
--   vision.diagnose is NOT changed: still inactive with no steps, and the perception engine stays
--      disabled (system_config.vision_diagnosis_policy.enabled = false). To enable photo diagnosis
--      later: add steps to vision.diagnose, set it active, and enable the policy.
--
-- SQL runner: no session state between statements; re-runnable (every statement is guarded).
-- Nothing is deleted.
-- ═══════════════════════════════════════════════════════════════════════════


-- §0 PREFLIGHT ──────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.ai_task_route') IS NULL OR to_regclass('public.ai_task_route_step') IS NULL THEN
    RAISE EXCEPTION 'call_site_routes preflight failed: registry tables missing — apply 20260925120000_ai_model_registry.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_model_catalog WHERE model_key = 'openai:gpt-5.6-luna' AND status = 'active') THEN
    v_missing := v_missing || 'active catalog row openai:gpt-5.6-luna';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_model_catalog WHERE model_key = 'gemini:gemini-3.5-flash-lite' AND status = 'active') THEN
    v_missing := v_missing || 'active catalog row gemini:gemini-3.5-flash-lite (apply 20260926100000 first)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_model_catalog WHERE model_key = 'lovable:google/gemini-3.8-flash' AND status = 'active') THEN
    v_missing := v_missing || 'active catalog row lovable:google/gemini-3.8-flash (apply 20260926100000 first)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_model_catalog WHERE model_key = 'lovable:google/gemini-3-flash-preview'
                 AND input_modalities @> ARRAY['image']) THEN
    v_missing := v_missing || 'catalog row lovable:google/gemini-3-flash-preview accepting image';
  END IF;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'call_site_routes preflight failed: %', array_to_string(v_missing, '; ');
  END IF;
END
$preflight$;


-- §1 brain.format ────────────────────────────────────────────────────────────
-- INSERT … SELECT … WHERE NOT EXISTS (not ON CONFLICT): stays re-runnable after 20261001100000 makes
-- ai_task_route.feature_key NOT NULL (Postgres checks NOT NULL before conflict resolution).
INSERT INTO public.ai_task_route (task_key, description, required_modalities, is_active, params, change_reason)
SELECT 'brain.format',
       'Write the chat answer from Decision Brain output in the farmer''s language — ai-agriculture-chat agents/llm-response-formatter.ts formatRecommendationsWithLLM',
       ARRAY['text'], true, '{"reasoning_effort": "low"}'::jsonb,
       'AI model SSOT call sites (2026-09-27): reproduces the formatter''s former hardcoded tiers (AI_MODELS openai → gemini → lovable); reasoning low so gpt-5.6-luna answers inside the 8 s cap'
 WHERE NOT EXISTS (SELECT 1 FROM public.ai_task_route WHERE task_key = 'brain.format');

-- Converge an existing brain.format row (e.g. created by an earlier draft of this migration) to the same setting.
UPDATE public.ai_task_route
   SET params = params || '{"reasoning_effort": "low"}'::jsonb,
       change_reason = 'brain.format reasoning low so gpt-5.6-luna answers inside the 8 s cap (2026-10-02)'
 WHERE task_key = 'brain.format'
   AND NOT (params ? 'reasoning_effort');

INSERT INTO public.ai_task_route_step (task_key, step_no, model_key)
VALUES ('brain.format', 1, 'openai:gpt-5.6-luna'),
       ('brain.format', 2, 'gemini:gemini-3.5-flash-lite'),
       ('brain.format', 3, 'lovable:google/gemini-3.8-flash')
ON CONFLICT (task_key, step_no) DO NOTHING;


-- §2 community.caption sends an image ────────────────────────────────────────
UPDATE public.ai_task_route
   SET required_modalities = ARRAY['text', 'image'],
       change_reason = 'community-caption-suggest sends the farmer''s photo (image_url); route must require image input (2026-09-27)'
 WHERE task_key = 'community.caption'
   AND NOT (required_modalities @> ARRAY['image']);


-- §3 brain.explain description ───────────────────────────────────────────────
UPDATE public.ai_task_route
   SET description = 'Explain Decision Brain output in farmer language — ai-agriculture-chat agents/explainer.ts (explainerLLM) and agents/llm-response-generator.ts',
       change_reason = 'answer writer moved to its own route brain.format (2026-09-27); description only, steps and params unchanged'
 WHERE task_key = 'brain.explain'
   AND description NOT LIKE '%explainerLLM%';


-- §4 vision.photo_chat — caller deleted ───────────────────────────────────────
UPDATE public.ai_task_route
   SET is_active = false,
       change_reason = 'caller photo/photo-analyzer.ts was dead code and is deleted (2026-09-27); photo analysis runs through vision.diagnose'
 WHERE task_key = 'vision.photo_chat'
   AND is_active = true;


-- VERIFY (read-only) ────────────────────────────────────────────────────────
SELECT 'brain.format chain' AS check_name,
       (SELECT string_agg(step_no || ':' || model_key, ' → ' ORDER BY step_no) FROM public.ai_task_route_step WHERE task_key = 'brain.format') AS got,
       '1:openai:gpt-5.6-luna → 2:gemini:gemini-3.5-flash-lite → 3:lovable:google/gemini-3.8-flash' AS expected
UNION ALL
SELECT 'brain.format active + params', (SELECT is_active::text || ' ' || params::text FROM public.ai_task_route WHERE task_key = 'brain.format'), 'true {"reasoning_effort": "low"}'
UNION ALL
SELECT 'community.caption modalities', (SELECT array_to_string(required_modalities, ',') FROM public.ai_task_route WHERE task_key = 'community.caption'), 'text,image'
UNION ALL
SELECT 'vision.photo_chat active', (SELECT is_active::text FROM public.ai_task_route WHERE task_key = 'vision.photo_chat'), 'false'
UNION ALL
SELECT 'routes / steps in the registry', (SELECT count(*)::text FROM public.ai_task_route) || ' / ' || (SELECT count(*)::text FROM public.ai_task_route_step), '21 / 31';
