-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- PATH : supabase/migrations/20260927110000_ai_registry_gpt6_luna_trial.sql
-- STATUS: FOR REVIEW ONLY — NOT APPLIED. OPTIONAL — this is the model switch itself.
-- DEPENDS ON: 20260927100000_ai_registry_call_site_routes.sql applied AND the 2026-09-27
--             "AI model SSOT — all call sites" edge-function code DEPLOYED (ai-agriculture-chat,
--             ai-smart-schedule, ai-general-chat). Before that deploy most chat and schedule
--             calls do not read these routes, so this migration would change only the explainer.
--
-- PURPOSE — make gpt-6-luna the first model for the AI chat and the crop schedule, as a pure
-- database change (no code, no deploy), with the current model kept as the last fallback.
--
-- EVIDENCE (developers.openai.com/api/docs/models/gpt-6-luna, read 2026-09-27):
--   model id gpt-6-luna; Chat Completions supported; max_completion_tokens; reasoning.effort
--   none | low | medium (default) | high | xhigh | max; text + image input.
--   Price in ai_model_pricing (verified 2026-09-25): $0.10 in / $0.01 cached / $0.50 out per 1M,
--   vs gpt-5.6-luna $0.20 / $0.02 / $1.20.
--   The catalog row (seeded 2026-09-25 as 'candidate') already carries that contract:
--   max_completion_tokens, temperature omit, efforts none…max. Not verified here: a live call —
--   the fallback steps below cover a rejection, and ai_model_metrics shows it (error_class
--   contract_rejected / model_retired on openai:gpt-6-luna).
--
-- WHAT CHANGES (step 1 of each route becomes openai:gpt-6-luna; nothing is removed — the model
-- that was step 1 stays in the chain; route guard re-validates every step):
--   brain.nlu            gpt-5.6-luna                          → gpt-6-luna → gpt-5.6-luna                 params reasoning none
--   brain.classify       gpt-5.6-luna → gemini                 → gpt-6-luna → gemini → gpt-5.6-luna        params reasoning low
--   brain.format         gpt-5.6-luna → gemini → lovable       → gpt-6-luna → gemini → lovable → gpt-5.6   params reasoning low
--   brain.explain        gpt-5.6-luna → gemini → lovable       → gpt-6-luna → gemini → lovable → gpt-5.6   params low (unchanged)
--   brain.translate      lovable → gemini → gpt-5.6-luna       → gpt-6-luna → gemini → lovable → gpt-5.6   params reasoning low
--   brain.alert_narrate  lovable 3-flash-preview               → gpt-6-luna → lovable 3-flash-preview      params reasoning low
--   rag.answer           gpt-5.6-luna → gemini                 → gpt-6-luna → gemini → gpt-5.6-luna        params {} (code sends none)
--   rag.normalize        gpt-5.6-luna → gemini                 → gpt-6-luna → gemini → gpt-5.6-luna        params {} (code sends none)
--   schedule.compose     lovable → gpt-5.6-luna → gemini       → gpt-6-luna → lovable → gemini → gpt-5.6   params {} (code sends none)
--
-- WHY THESE REASONING SETTINGS: gpt-6-luna's default effort is `medium` (same as gpt-5.6-luna), and
-- the chat call sites for nlu/classify/format/translate/alert send none of their own (they never
-- did). On 2026-09-26 that default made gpt-5.6-luna time out at 8 s on the explainer and the
-- formatter. A route's effort must be accepted by EVERY model on it (route guard): `low` is the
-- lowest effort that gpt-6-luna, gpt-5.6-luna, Gemini 3.x and the Lovable Gemini models all accept;
-- brain.nlu has only OpenAI models, so it can use `none` (its 300-token budget must not be spent on
-- reasoning). rag.* and schedule.compose already send reasoning none from code (buildAIRequest
-- parity), which gpt-6-luna accepts; Gemini steps simply do not receive it.
--
-- BEHAVIOUR CHANGE (this is the one migration that changes which model answers):
--   * chat understanding/classify/answer/explain/translate/alert, general chat and crop schedule
--     are answered by gpt-6-luna first; translation and the schedule no longer start on the
--     Lovable gateway — OpenAI spend rises, Lovable spend falls; per-token price per call drops
--     vs gpt-5.6-luna (−50 % input, −58 % output);
--   * provider diversity is kept: after a gpt-6-luna failure the next step is a Gemini/Lovable
--     model (a 429 cools the whole OpenAI provider for 5–8 s, so gpt-5.6-luna would be skipped too).
-- ROLLBACK: the block at the end (commented) restores every route exactly.
-- SQL runner: no session state between statements; re-runnable. Nothing is deleted.
-- ═══════════════════════════════════════════════════════════════════════════


-- §0 PREFLIGHT ──────────────────────────────────────────────────────────────
DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_task_route WHERE task_key = 'brain.format') THEN
    RAISE EXCEPTION 'gpt6_luna_trial preflight failed: apply 20260927100000_ai_registry_call_site_routes.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_model_catalog WHERE model_key = 'openai:gpt-6-luna'
                 AND api_contract->>'token_param' = 'max_completion_tokens'
                 AND api_contract->'reasoning_efforts' ? 'none' AND api_contract->'reasoning_efforts' ? 'low') THEN
    RAISE EXCEPTION 'gpt6_luna_trial preflight failed: catalog row openai:gpt-6-luna missing or its contract differs from the OpenAI model page';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_model_pricing WHERE model_name = 'openai:gpt-6-luna' AND is_active) THEN
    RAISE EXCEPTION 'gpt6_luna_trial preflight failed: no active ai_model_pricing row for openai:gpt-6-luna (cost_usd would be null)';
  END IF;
END
$preflight$;


-- §1 catalog: candidate → active ─────────────────────────────────────────────
UPDATE public.ai_model_catalog
   SET status = 'active',
       source_url = 'https://developers.openai.com/api/docs/models/gpt-6-luna',
       notes = 'Active 2026-09-27. OpenAI model page: Chat Completions, max_completion_tokens, reasoning none…max (default medium), text+image input. $0.10/$0.01/$0.50 per 1M (ai_model_pricing).',
       change_reason = 'gpt-6-luna trial: first model for chat and crop schedule routes (2026-09-27)'
 WHERE model_key = 'openai:gpt-6-luna' AND status = 'candidate';


-- §2 steps ──────────────────────────────────────────────────────────────────
-- Routes whose step 1 is gpt-5.6-luna: step 1 → gpt-6-luna, gpt-5.6-luna appended as the last step.
UPDATE public.ai_task_route_step SET model_key = 'openai:gpt-6-luna'
 WHERE step_no = 1 AND model_key = 'openai:gpt-5.6-luna'
   AND task_key IN ('brain.nlu', 'brain.classify', 'brain.format', 'brain.explain', 'rag.answer', 'rag.normalize');

INSERT INTO public.ai_task_route_step (task_key, step_no, model_key)
SELECT r.task_key, (SELECT max(s.step_no) + 1 FROM public.ai_task_route_step s WHERE s.task_key = r.task_key), 'openai:gpt-5.6-luna'
  FROM public.ai_task_route r
 WHERE r.task_key IN ('brain.nlu', 'brain.classify', 'brain.format', 'brain.explain', 'rag.answer', 'rag.normalize')
   AND NOT EXISTS (SELECT 1 FROM public.ai_task_route_step s WHERE s.task_key = r.task_key AND s.model_key = 'openai:gpt-5.6-luna');

-- brain.translate: lovable → gemini → gpt-5.6-luna  ⇒  gpt-6-luna → gemini → lovable → gpt-5.6-luna
UPDATE public.ai_task_route_step SET model_key = 'openai:gpt-6-luna'
 WHERE task_key = 'brain.translate' AND step_no = 1 AND model_key = 'lovable:google/gemini-3.8-flash';
UPDATE public.ai_task_route_step SET model_key = 'lovable:google/gemini-3.8-flash'
 WHERE task_key = 'brain.translate' AND step_no = 3 AND model_key = 'openai:gpt-5.6-luna';
INSERT INTO public.ai_task_route_step (task_key, step_no, model_key)
SELECT 'brain.translate', 4, 'openai:gpt-5.6-luna'
 WHERE NOT EXISTS (SELECT 1 FROM public.ai_task_route_step WHERE task_key = 'brain.translate' AND model_key = 'openai:gpt-5.6-luna');

-- brain.alert_narrate: lovable 3-flash-preview  ⇒  gpt-6-luna → lovable 3-flash-preview
UPDATE public.ai_task_route_step SET model_key = 'openai:gpt-6-luna'
 WHERE task_key = 'brain.alert_narrate' AND step_no = 1 AND model_key = 'lovable:google/gemini-3-flash-preview';
INSERT INTO public.ai_task_route_step (task_key, step_no, model_key)
SELECT 'brain.alert_narrate', 2, 'lovable:google/gemini-3-flash-preview'
 WHERE NOT EXISTS (SELECT 1 FROM public.ai_task_route_step WHERE task_key = 'brain.alert_narrate' AND model_key = 'lovable:google/gemini-3-flash-preview');

-- schedule.compose: lovable → gpt-5.6-luna → gemini  ⇒  gpt-6-luna → lovable → gemini → gpt-5.6-luna
UPDATE public.ai_task_route_step SET model_key = 'openai:gpt-6-luna'
 WHERE task_key = 'schedule.compose' AND step_no = 1 AND model_key = 'lovable:google/gemini-3.8-flash';
UPDATE public.ai_task_route_step SET model_key = 'lovable:google/gemini-3.8-flash'
 WHERE task_key = 'schedule.compose' AND step_no = 2 AND model_key = 'openai:gpt-5.6-luna';
INSERT INTO public.ai_task_route_step (task_key, step_no, model_key)
SELECT 'schedule.compose', 4, 'openai:gpt-5.6-luna'
 WHERE NOT EXISTS (SELECT 1 FROM public.ai_task_route_step WHERE task_key = 'schedule.compose' AND model_key = 'openai:gpt-5.6-luna');


-- §3 reasoning effort for routes whose code sends none ───────────────────────
UPDATE public.ai_task_route
   SET params = params || '{"reasoning_effort":"none"}'::jsonb,
       change_reason = 'gpt-6-luna trial: OpenAI-only route; no reasoning inside the 300-token perception budget (2026-09-27)'
 WHERE task_key = 'brain.nlu' AND params->>'reasoning_effort' IS DISTINCT FROM 'none';

UPDATE public.ai_task_route
   SET params = params || '{"reasoning_effort":"low"}'::jsonb,
       change_reason = 'gpt-6-luna trial: explicit low effort — the model default medium timed out chat calls at 8 s (2026-09-26); low is accepted by every model on the route (2026-09-27)'
 WHERE task_key IN ('brain.classify', 'brain.format', 'brain.translate', 'brain.alert_narrate')
   AND params->>'reasoning_effort' IS DISTINCT FROM 'low';


-- VERIFY (read-only) ────────────────────────────────────────────────────────
SELECT r.task_key,
       string_agg(s.step_no || ':' || s.model_key, ' → ' ORDER BY s.step_no) AS chain,
       r.params::text AS params
  FROM public.ai_task_route r JOIN public.ai_task_route_step s USING (task_key)
 WHERE r.task_key IN ('brain.nlu', 'brain.classify', 'brain.format', 'brain.explain', 'brain.translate',
                      'brain.alert_narrate', 'rag.answer', 'rag.normalize', 'schedule.compose')
 GROUP BY r.task_key, r.params
 ORDER BY r.task_key;
-- expected: every chain starts with 1:openai:gpt-6-luna and contains openai:gpt-5.6-luna.


-- ROLLBACK — one statement per line, run top to bottom if the trial must be undone (order matters:
-- each step frees a model before it is reused on the same route). Restores every route exactly.
-- UPDATE public.ai_task_route SET params = params - 'reasoning_effort', change_reason = 'gpt-6-luna trial rolled back' WHERE task_key IN ('brain.nlu', 'brain.classify', 'brain.translate', 'brain.alert_narrate');
-- (brain.format keeps reasoning low: that is its 20260927100000 setting, not part of this trial.)
-- DELETE FROM public.ai_task_route_step WHERE model_key = 'openai:gpt-5.6-luna' AND (task_key, step_no) IN (('brain.nlu',2),('brain.classify',3),('brain.format',4),('brain.explain',4),('rag.answer',3),('rag.normalize',3),('brain.translate',4),('schedule.compose',4));
-- DELETE FROM public.ai_task_route_step WHERE task_key = 'brain.alert_narrate' AND step_no = 2 AND model_key = 'lovable:google/gemini-3-flash-preview';
-- UPDATE public.ai_task_route_step SET model_key = 'openai:gpt-5.6-luna' WHERE step_no = 1 AND model_key = 'openai:gpt-6-luna' AND task_key IN ('brain.nlu','brain.classify','brain.format','brain.explain','rag.answer','rag.normalize');
-- UPDATE public.ai_task_route_step SET model_key = 'openai:gpt-5.6-luna' WHERE task_key = 'brain.translate' AND step_no = 3 AND model_key = 'lovable:google/gemini-3.8-flash';
-- UPDATE public.ai_task_route_step SET model_key = 'lovable:google/gemini-3.8-flash' WHERE task_key = 'brain.translate' AND step_no = 1 AND model_key = 'openai:gpt-6-luna';
-- UPDATE public.ai_task_route_step SET model_key = 'lovable:google/gemini-3-flash-preview' WHERE task_key = 'brain.alert_narrate' AND step_no = 1 AND model_key = 'openai:gpt-6-luna';
-- UPDATE public.ai_task_route_step SET model_key = 'openai:gpt-5.6-luna' WHERE task_key = 'schedule.compose' AND step_no = 2 AND model_key = 'lovable:google/gemini-3.8-flash';
-- UPDATE public.ai_task_route_step SET model_key = 'lovable:google/gemini-3.8-flash' WHERE task_key = 'schedule.compose' AND step_no = 1 AND model_key = 'openai:gpt-6-luna';
-- (gpt-6-luna may stay 'active'; it is unused once no step names it.) The two DELETEs remove route
-- STEP rows only (configuration; every change is kept in ai_registry_audit_log). No data row is deleted.
