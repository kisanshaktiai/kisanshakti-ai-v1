-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- PATH : supabase/migrations/20261004150000_ai_free_tier_first.sql
-- STATUS: FOR REVIEW ONLY — NOT APPLIED.
-- DEPENDS ON: 20260925120000_ai_model_registry.sql,
--             20261001100000_ai_registry_features_and_ledger.sql (applied live 2026-10-04 13:28 UTC),
--             20261003100000_ai_key_pool.sql            (applied live 2026-10-04 13:32 UTC).
--
-- APPLY ORDER — THIS MIGRATION MUST BE APPLIED **BEFORE** THE MATCHING _shared/aiConfig.ts IS
--   DEPLOYED. The new router selects ai_task_route.prefer_free_pool; until the column exists that
--   SELECT fails, fetchAIRegistry throws, and a cold isolate falls back to the hardcoded cold-start
--   emergency model. Applying this first is harmless to the currently deployed router, which does not
--   read the column.
--
-- PURPOSE — "free tier first". Two independent changes, both additive.
--
--   §1 ai_task_route +prefer_free_pool (boolean, NOT NULL, DEFAULT true)
--      The admin switch for free-tier-first routing. When true, the router tries every step of the
--      chain that still has complimentary-token room BEFORE any step that would be billed, keeping the
--      admin's step_no order inside each of those two tiers (stable two-tier sort — it can only move a
--      free step ahead of a billed one). Set it to false on a route where the first model must always
--      answer regardless of cost.
--      DEFAULT true is deliberate: six live routes put a billed provider at step 1 while an OpenAI
--      model with a complimentary pool sits further down the same chain
--        brain.alert_narrate, community.caption, community.moderate, question.seed  (billed, single step
--          — nothing to reorder, the flag has no effect on them)
--        brain.translate    lovable → gemini → openai   (openai promoted to step 1 when it has room)
--        schedule.compose   lovable → openai → gemini    (openai promoted to step 1 when it has room)
--      Routes whose step 1 is already the free-eligible model are unaffected.
--
--   §2 ai_key_slot: enable OpenAI slots 2 and 3.
--      The slots were seeded disabled in 20261003100000 because their secrets did not exist yet. The
--      secrets OPENAI_API_KEY_2 and OPENAI_API_KEY_3 have now been added, so the router may rotate
--      across all three organisations' complimentary pools before it spends anything paid.
--      A slot whose secret is unset or misnamed is skipped by the router (readSlotKey returns ""), so
--      enabling a slot can never break a call — it can only add a key to the rotation.
--      The daily_pool values are NOT changed here. They hold OpenAI's tier 1-2 figures (250,000 for
--      openai_big, 2,500,000 for openai_mini). If these organisations are tier 3-5 the real pools are
--      1,000,000 and 10,000,000, and the router will switch to paid earlier than it needs to. Raising
--      them is a separate one-field change per slot, from the AI API Keys screen or its own migration,
--      and it should only be done once the tier is confirmed on the OpenAI dashboard: a request that
--      crosses the real quota is billed in full, so an over-stated pool costs money while an
--      under-stated one only leaves free tokens unused.
--
-- NO model, route, chain or params change: step rows, modalities and params are untouched, and §1 only
-- adds a column. Nothing is deleted.
-- SQL runner: no session state between statements; re-runnable (every statement is guarded).
-- ═══════════════════════════════════════════════════════════════════════════


-- §0 PREFLIGHT ──────────────────────────────────────────────────────────────
DO $preflight$
BEGIN
  IF to_regclass('public.ai_task_route') IS NULL THEN
    RAISE EXCEPTION 'free_tier_first preflight failed: ai_task_route missing — apply 20260925120000_ai_model_registry.sql first';
  END IF;
  IF to_regclass('public.ai_key_slot') IS NULL OR to_regclass('public.ai_model_group') IS NULL THEN
    RAISE EXCEPTION 'free_tier_first preflight failed: key-pool tables missing — apply 20261003100000_ai_key_pool.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_key_slot WHERE provider = 'openai' AND slot_no IN (2, 3)) THEN
    RAISE EXCEPTION 'free_tier_first preflight failed: openai key slots 2 and 3 are not seeded — apply 20261003100000_ai_key_pool.sql first';
  END IF;
END
$preflight$;


-- §1 ai_task_route.prefer_free_pool ──────────────────────────────────────────
ALTER TABLE public.ai_task_route
  ADD COLUMN IF NOT EXISTS prefer_free_pool boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ai_task_route.prefer_free_pool IS
  'Free tier first. true (default): the router tries the chain steps that still have complimentary-token room (ai_key_slot.daily_pool for the model''s ai_model_group) before the steps that would be billed, keeping step_no order inside each tier. false: the chain is tried in step_no order exactly as set, whatever it costs.';


-- §2 Enable OpenAI key slots 2 and 3 ─────────────────────────────────────────
-- Guarded on is_enabled = false so a re-run writes nothing and adds no audit row.
UPDATE public.ai_key_slot
   SET is_enabled    = true,
       change_reason = 'Free tier first (2026-10-04): OPENAI_API_KEY_2 / _3 secrets added, so the router rotates across all three organisations'' complimentary pools before spending paid balance'
 WHERE provider = 'openai'
   AND slot_no IN (2, 3)
   AND is_enabled = false;


-- VERIFY (read-only) ────────────────────────────────────────────────────────
SELECT 'prefer_free_pool column' AS check_name,
       (SELECT column_default || ' / ' || is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ai_task_route' AND column_name = 'prefer_free_pool') AS got,
       'true / NO' AS expected
UNION ALL
SELECT 'routes preferring the free pool',
       (SELECT count(*) FILTER (WHERE prefer_free_pool) || ' of ' || count(*) FROM public.ai_task_route), '21 of 21'
UNION ALL
SELECT 'enabled openai key slots',
       (SELECT string_agg(slot_no::text, ',' ORDER BY slot_no) FROM public.ai_key_slot WHERE provider = 'openai' AND is_enabled), '1,2,3'
UNION ALL
SELECT 'slot env_var names',
       (SELECT string_agg(env_var, ' ' ORDER BY slot_no) FROM public.ai_key_slot WHERE provider = 'openai'),
       'OPENAI_API_KEY OPENAI_API_KEY_2 OPENAI_API_KEY_3'
UNION ALL
SELECT 'chains that will be reordered when the pool has room',
       (SELECT string_agg(task_key, ' ' ORDER BY task_key) FROM public.ai_task_route r
         WHERE r.prefer_free_pool
           AND (SELECT count(*) FROM public.ai_task_route_step s WHERE s.task_key = r.task_key) > 1
           AND public.ai_model_group_key(
                 (SELECT c.provider FROM public.ai_task_route_step s JOIN public.ai_model_catalog c ON c.model_key = s.model_key WHERE s.task_key = r.task_key AND s.step_no = 1),
                 (SELECT c.api_model_id FROM public.ai_task_route_step s JOIN public.ai_model_catalog c ON c.model_key = s.model_key WHERE s.task_key = r.task_key AND s.step_no = 1)
               ) IS NULL),
       'brain.translate schedule.compose'
UNION ALL
SELECT 'routes / steps unchanged',
       (SELECT count(*)::text FROM public.ai_task_route) || ' / ' || (SELECT count(*)::text FROM public.ai_task_route_step), '21 / 31'
UNION ALL
SELECT 'key-slot audit rows for this change',
       (SELECT count(*)::text FROM public.ai_registry_audit_log WHERE table_name = 'ai_key_slot' AND change_reason LIKE 'Free tier first (2026-10-04)%'), '2';
