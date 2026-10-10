-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- PATH : supabase/migrations/20260926100000_ai_registry_retire_gemini_2_5.sql
-- STATUS: FOR REVIEW ONLY — NOT APPLIED.
-- DEPENDS ON: 20260925120000_ai_model_registry.sql (applied live 2026-09-25).
--
-- PURPOSE — Remove the Gemini 2.5 family from the AI model registry, matching
-- the same change in supabase/functions/_shared/aiConfig.ts.
--
-- WHY (evidence gathered 2026-09-26):
--   * Gemini API deprecations page: gemini-2.5-flash "No shutdown date
--     announced"; access is limited "to users who have actively used them in
--     the past". The same page listed a 2026-10-16 shutdown until early
--     August 2026, then the date was removed without a changelog entry.
--   * Google Cloud "Model versions and lifecycle" page lists a 2026-10-20
--     retirement for the 2.5 family (as reported 2026-09-24).
--   * Lovable AI docs mark the Gemini 2.5 models "(deprecated)".
--   So the date is unsettled but the direction is not. The earlier seed row
--   recorded shutdown_date 2026-10-16 as fact; that is corrected here.
--
-- SUCCESSORS (Google: "use 3.5 Flash-Lite or 3.8 Flash" for new projects):
--   gemini:gemini-2.5-flash         → gemini:gemini-3.5-flash-lite
--        GA, no shutdown date, $0.30 in / $2.50 out per 1M — same as 2.5 Flash.
--   lovable:google/gemini-2.5-flash → lovable:google/gemini-3.8-flash
--        GA, no shutdown date, Lovable's default chat model. The exact gateway
--        id is inferred from the gateway's google/<model> pattern (Lovable does
--        not publish literal ids) — the first live schedule narration after the
--        code deploy confirms it (crop_schedules.ai_model).
--
-- CONTRACT CORRECTION: Gemini 3 models take no custom temperature (Google:
-- keep the default 1.0; lower values "may lead to unexpected behavior, such as
-- looping") and accept reasoning_effort minimal|low|medium|high (mapped to
-- thinking_level). lovable:google/gemini-3-flash-preview was seeded as
-- temperature 'allowed' with no reasoning efforts; corrected here too.
--
-- EFFECT: none on farmers until edge functions call callAITask() (Phase 2);
-- the live effect of the Gemini swap comes from the aiConfig.ts deploy.
-- Nothing is deleted: route steps are repointed, old models set 'retired'.
-- SQL runner: no session state between statements; re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════


-- §0 PREFLIGHT ──────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.ai_model_catalog') IS NULL OR to_regclass('public.ai_task_route_step') IS NULL
     OR to_regclass('public.ai_model_pricing') IS NULL THEN
    RAISE EXCEPTION 'retire_gemini_2_5 preflight failed: registry tables missing — apply 20260925120000_ai_model_registry.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_model_catalog WHERE model_key = 'gemini:gemini-2.5-flash') THEN
    v_missing := v_missing || 'catalog row gemini:gemini-2.5-flash';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_model_catalog WHERE model_key = 'lovable:google/gemini-2.5-flash') THEN
    v_missing := v_missing || 'catalog row lovable:google/gemini-2.5-flash';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_model_catalog WHERE model_key = 'lovable:google/gemini-3-flash-preview') THEN
    v_missing := v_missing || 'catalog row lovable:google/gemini-3-flash-preview';
  END IF;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'retire_gemini_2_5 preflight failed: %', array_to_string(v_missing, '; ');
  END IF;
END
$preflight$;


-- §1 SUCCESSOR MODELS ───────────────────────────────────────────────────────
INSERT INTO public.ai_model_catalog
  (model_key, provider, api_model_id, status, input_modalities, api_contract, shutdown_date, source_url, notes, change_reason)
VALUES
  ('gemini:gemini-3.5-flash-lite', 'gemini', 'gemini-3.5-flash-lite', 'active', ARRAY['text', 'image'],
   '{"token_param":"max_tokens","temperature":"omit","reasoning_efforts":["minimal","low","medium","high"]}',
   NULL, 'https://ai.google.dev/gemini-api/docs/models',
   'Stable (GA), released 2026-07-21, no shutdown date announced (deprecations page, 2026-09-26). Google recommends it for new projects. Replaces gemini-2.5-flash at the same price.',
   'Gemini 2.5 retirement (2026-09-26): successor for the direct Gemini fallback'),
  ('lovable:google/gemini-3.8-flash', 'lovable', 'google/gemini-3.8-flash', 'active', ARRAY['text', 'image'],
   '{"token_param":"max_tokens","temperature":"omit","reasoning_efforts":["minimal","low","medium","high"]}',
   NULL, 'https://docs.lovable.dev/features/ai',
   'Via Lovable AI Gateway; Lovable''s default chat model. Underlying gemini-3.8-flash is stable (GA), released 2026-09-02, no shutdown date. Gateway id inferred from the google/<model> pattern; confirm on first live call.',
   'Gemini 2.5 retirement (2026-09-26): successor for the Lovable gateway slot')
ON CONFLICT (model_key) DO NOTHING;

UPDATE public.ai_model_catalog
   SET api_contract  = '{"token_param":"max_tokens","temperature":"omit","reasoning_efforts":["minimal","low","medium","high"]}',
       notes         = 'Via Lovable AI Gateway. Preview model; Google lists no shutdown date but names gemini-3.6-flash as its replacement. Gemini 3: keep default temperature; thinking defaults to high.',
       change_reason = 'Gemini 3 contract correction (2026-09-26): no custom temperature; accepts reasoning_effort'
 WHERE model_key = 'lovable:google/gemini-3-flash-preview'
   AND api_contract IS DISTINCT FROM '{"token_param":"max_tokens","temperature":"omit","reasoning_efforts":["minimal","low","medium","high"]}'::jsonb;


-- §2 PRICE (per 1K tokens, USD; verified 2026-09-26). No row for Lovable-gateway
--    models: gateway billing is in Lovable credits, recorded as unknown cost.
INSERT INTO public.ai_model_pricing
  (model_name, input_cost_per_1k, cached_input_cost_per_1k, output_cost_per_1k, currency, effective_from, is_active, source_url, notes)
VALUES
  ('gemini:gemini-3.5-flash-lite', 0.000300, 0.000030, 0.002500, 'USD', DATE '2026-09-26', true,
   'https://ai.google.dev/gemini-api/docs/pricing',
   'Standard paid tier, verified 2026-09-26: $0.30 input (text/image/video/audio), $0.03 context caching (plus storage), $2.50 output per 1M.')
ON CONFLICT (model_name, effective_from) DO NOTHING;


-- §3 REPOINT ROUTE STEPS (step order and every other route setting unchanged)
UPDATE public.ai_task_route_step SET model_key = 'gemini:gemini-3.5-flash-lite'
 WHERE model_key = 'gemini:gemini-2.5-flash';
UPDATE public.ai_task_route_step SET model_key = 'lovable:google/gemini-3.8-flash'
 WHERE model_key = 'lovable:google/gemini-2.5-flash';


-- §4 RETIRE THE 2.5 ROWS (never deleted; the retire guard would refuse while a
--    route still used them, so this runs after §3)
UPDATE public.ai_model_catalog
   SET status                = 'retired',
       replacement_model_key = 'gemini:gemini-3.5-flash-lite',
       shutdown_date         = NULL,
       notes                 = 'Retired from all KisanShakti routes 2026-09-26. Google status on that date: Gemini API page says not deprecated, no shutdown date, access limited to prior users (a 2026-10-16 date was listed until early Aug 2026, then removed); Google Cloud lifecycle page lists 2026-10-20. Developers reported early 404s.',
       change_reason         = 'Gemini 2.5 retirement (2026-09-26): unsettled Google retirement date; replaced by gemini-3.5-flash-lite'
 WHERE model_key = 'gemini:gemini-2.5-flash' AND status <> 'retired';

UPDATE public.ai_model_catalog
   SET status                = 'retired',
       replacement_model_key = 'lovable:google/gemini-3.8-flash',
       shutdown_date         = NULL,
       notes                 = 'Retired from all KisanShakti routes 2026-09-26. Lovable marks Gemini 2.5 "(deprecated)": it keeps working in existing apps but Lovable no longer builds with it. Last confirmed answer in this project: schedule narration 2026-09-22.',
       change_reason         = 'Gemini 2.5 retirement (2026-09-26): Lovable deprecated; replaced by google/gemini-3.8-flash'
 WHERE model_key = 'lovable:google/gemini-2.5-flash' AND status <> 'retired';


-- §5 VERIFY (read-only) ─────────────────────────────────────────────────────
SELECT 'route steps on a Gemini 2.5 model' AS check_name,
       count(*)::text AS got, '0' AS expected
  FROM public.ai_task_route_step WHERE model_key LIKE '%gemini-2.5%'
UNION ALL
SELECT 'route steps (unchanged total)', count(*)::text, '28' FROM public.ai_task_route_step
UNION ALL
SELECT 'steps on gemini:gemini-3.5-flash-lite', count(*)::text, '6'
  FROM public.ai_task_route_step WHERE model_key = 'gemini:gemini-3.5-flash-lite'
UNION ALL
SELECT 'steps on lovable:google/gemini-3.8-flash', count(*)::text, '3'
  FROM public.ai_task_route_step WHERE model_key = 'lovable:google/gemini-3.8-flash'
UNION ALL
SELECT 'Gemini 2.5 catalog rows retired', count(*) FILTER (WHERE status = 'retired')::text || '/' || count(*)::text, '2/2'
  FROM public.ai_model_catalog WHERE model_key IN ('gemini:gemini-2.5-flash', 'lovable:google/gemini-2.5-flash')
UNION ALL
SELECT 'catalog models', count(*)::text, '11' FROM public.ai_model_catalog
UNION ALL
SELECT 'Gemini 3 rows with temperature omit', count(*)::text, '3'
  FROM public.ai_model_catalog
 WHERE model_key IN ('gemini:gemini-3.5-flash-lite', 'lovable:google/gemini-3.8-flash', 'lovable:google/gemini-3-flash-preview')
   AND api_contract->>'temperature' = 'omit'
UNION ALL
SELECT 'price row gemini-3.5-flash-lite', count(*)::text, '1'
  FROM public.ai_model_pricing WHERE model_name = 'gemini:gemini-3.5-flash-lite'
UNION ALL
SELECT 'steps on non-routable models', count(*)::text, '0'
  FROM public.ai_task_route_step s JOIN public.ai_model_catalog c ON c.model_key = s.model_key
 WHERE c.status NOT IN ('active', 'deprecated');
