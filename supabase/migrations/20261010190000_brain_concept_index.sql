-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- BRANCH: decision-brain-update
-- PATH : supabase/migrations/20261010190000_brain_concept_index.sql
-- STATUS: FOR REVIEW — NOT APPLIED.
--
-- TARGET FLOW STEP 1 (shadow mode) — "pgvector and trigram search return the candidate
-- codes from the database".
--
-- WHAT THIS ADDS (all new objects; no existing table, row, rule or function is changed):
--   1. brain_concept_source  (view)  — every farmer-facing phrase the database already holds for an
--      observation or an intent: observation_aliases (active), observation_translations.display_text,
--      intent_translations.display_text and .question_text. Nothing is typed in by hand.
--   2. brain_concept_index   (table) — one row per (kind, code, language, phrase) with its meaning
--      vector. Filled by brain_concept_index_refresh() and embedded by the brain-concept-indexer
--      edge function. Rows are never deleted: a phrase that leaves its source is set is_active=false.
--   3. brain_concept_index_refresh() — syncs the table from the view (insert new, reactivate, deactivate).
--      brain_concept_index_store_embeddings() — writes a batch of vectors (used by the indexer function).
--   4. brain_concept_search()  — hybrid search: meaning (pgvector, cosine) + spelling (pg_trgm
--      word_similarity), merged with Reciprocal Rank Fusion (k = 60, the same constant as
--      _shared/ragRetrieval.ts). Metadata (is_active, is_farmer_observable, categories) is joined LIVE
--      from observation_master / observation_intent_master, so the index never goes stale on them.
--   5. brain_concept_shadow_log (table) — one row per chat turn while the shadow flag is on: what the
--      search WOULD have offered next to what the brain actually decided. Read-only evidence; the
--      farmer's answer is never changed by it.
--   6. Model registry: catalog row gemini:gemini-embedding-2, its price, and route brain.embed
--      (feature 'chat'). The edge functions read the model ONLY from this route — no model name in code.
--      The model's request format (dimensions, task-instruction templates) lives in
--      ai_model_catalog.api_contract.embedding, so swapping the model is a data change.
--   7. feature_flags row brain_concept_shadow — created DISABLED with no targets (off for everyone).
--   8. vault secret brain_concept_indexer_key + get_sweep_key() allow-list entry, so the indexer can be
--      called from SQL (net.http_post) — same convention as the schedule and rag-eval sweeps.
--
-- VECTOR SIZE: 768 (gemini-embedding-2 recommended size; auto-normalised by the model). A different
--   model must also produce 768 values, and the index must be re-embedded with it (vectors from two
--   models are not comparable; brain_concept_search only compares rows embedded by p_model).
--
-- RUN: whole file in one go, or statement by statement — every statement stands alone and is
--   idempotent (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING). No session state.
-- UNDO (if ever wanted): set feature_flags.brain_concept_shadow is_enabled=false — the chat stops
--   calling the search at once. The new tables can stay; nothing reads them except these functions.
-- ═══════════════════════════════════════════════════════════════════════════


-- 1) phrase normaliser — the one rule used for the index AND for the farmer's text
CREATE OR REPLACE FUNCTION public.brain_concept_normalize(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')));
$$;


-- 2) source view — farmer-facing phrases already in the database
CREATE OR REPLACE VIEW public.brain_concept_source AS
  SELECT 'observation'::text AS concept_kind, a.canonical_code AS concept_code,
         coalesce(nullif(btrim(a.language), ''), 'und') AS language, btrim(a.alias_text) AS surface_text,
         'observation_aliases'::text AS source_table, a.alias_code AS source_key
  FROM public.observation_aliases a
  WHERE a.active AND nullif(btrim(a.alias_text), '') IS NOT NULL
  UNION ALL
  SELECT 'observation', t.observation_code, coalesce(nullif(btrim(t.language_code), ''), 'und'), btrim(t.display_text),
         'observation_translations', t.id::text
  FROM public.observation_translations t
  WHERE nullif(btrim(t.display_text), '') IS NOT NULL
  UNION ALL
  SELECT 'intent', it.intent_code, coalesce(nullif(btrim(it.language_code), ''), 'und'), btrim(it.display_text),
         'intent_translations.display_text', it.id::text
  FROM public.intent_translations it
  WHERE nullif(btrim(it.display_text), '') IS NOT NULL
  UNION ALL
  SELECT 'intent', it.intent_code, coalesce(nullif(btrim(it.language_code), ''), 'und'), btrim(it.question_text),
         'intent_translations.question_text', it.id::text
  FROM public.intent_translations it
  WHERE nullif(btrim(it.question_text), '') IS NOT NULL;


-- 3) the index table
CREATE TABLE IF NOT EXISTS public.brain_concept_index (
  id                 bigserial PRIMARY KEY,
  concept_kind       text NOT NULL CHECK (concept_kind IN ('observation', 'intent')),
  concept_code       text NOT NULL,
  language           text NOT NULL,
  surface_text       text NOT NULL CHECK (length(btrim(surface_text)) > 0),
  surface_normalized text NOT NULL,
  source_table       text NOT NULL,
  source_key         text,
  is_active          boolean NOT NULL DEFAULT true,
  embedding          extensions.vector(768),
  embedding_model    text,
  embedded_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brain_concept_index_phrase_uniq UNIQUE (concept_kind, concept_code, language, surface_normalized),
  CONSTRAINT brain_concept_index_embedding_pair CHECK ((embedding IS NULL) = (embedding_model IS NULL))
);

COMMENT ON TABLE public.brain_concept_index IS
  'Target-flow step 1: farmer-facing phrases for observations and intents with their meaning vectors. Source = view brain_concept_source; filled by brain_concept_index_refresh(); embedded by edge function brain-concept-indexer using the model on route brain.embed. Rows are never deleted.';

CREATE INDEX IF NOT EXISTS brain_concept_index_embedding_hnsw
  ON public.brain_concept_index USING hnsw (embedding extensions.vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS brain_concept_index_normalized_trgm
  ON public.brain_concept_index USING gin (surface_normalized public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS brain_concept_index_code_idx
  ON public.brain_concept_index (concept_kind, concept_code);

CREATE INDEX IF NOT EXISTS brain_concept_index_to_embed_idx
  ON public.brain_concept_index (id) WHERE is_active AND embedding IS NULL;

ALTER TABLE public.brain_concept_index ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.brain_concept_index FROM anon, authenticated;


-- 4) refresh: sync the table from the view. Inserts new phrases, reactivates returning ones,
--    deactivates phrases that left their source. Never deletes, never touches embeddings of kept rows.
CREATE OR REPLACE FUNCTION public.brain_concept_index_refresh()
RETURNS TABLE (inserted integer, reactivated integer, deactivated integer, active_total integer, to_embed integer)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ins integer := 0;
  v_react integer := 0;
  v_deact integer := 0;
BEGIN
  WITH src AS (
    SELECT DISTINCT ON (s.concept_kind, s.concept_code, s.language, public.brain_concept_normalize(s.surface_text))
           s.concept_kind, s.concept_code, s.language, s.surface_text,
           public.brain_concept_normalize(s.surface_text) AS surface_normalized, s.source_table, s.source_key
    FROM public.brain_concept_source s
    ORDER BY s.concept_kind, s.concept_code, s.language, public.brain_concept_normalize(s.surface_text), s.source_table, s.source_key
  ), ins AS (
    INSERT INTO public.brain_concept_index
      (concept_kind, concept_code, language, surface_text, surface_normalized, source_table, source_key)
    SELECT concept_kind, concept_code, language, surface_text, surface_normalized, source_table, source_key FROM src
    ON CONFLICT (concept_kind, concept_code, language, surface_normalized) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_ins FROM ins;

  UPDATE public.brain_concept_index i
     SET is_active = true, updated_at = now()
   WHERE NOT i.is_active
     AND EXISTS (SELECT 1 FROM public.brain_concept_source s
                  WHERE s.concept_kind = i.concept_kind AND s.concept_code = i.concept_code
                    AND s.language = i.language
                    AND public.brain_concept_normalize(s.surface_text) = i.surface_normalized);
  GET DIAGNOSTICS v_react = ROW_COUNT;

  UPDATE public.brain_concept_index i
     SET is_active = false, updated_at = now()
   WHERE i.is_active
     AND NOT EXISTS (SELECT 1 FROM public.brain_concept_source s
                      WHERE s.concept_kind = i.concept_kind AND s.concept_code = i.concept_code
                        AND s.language = i.language
                        AND public.brain_concept_normalize(s.surface_text) = i.surface_normalized);
  GET DIAGNOSTICS v_deact = ROW_COUNT;

  RETURN QUERY
    SELECT v_ins, v_react, v_deact,
           (SELECT count(*)::integer FROM public.brain_concept_index WHERE is_active),
           (SELECT count(*)::integer FROM public.brain_concept_index WHERE is_active AND embedding IS NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.brain_concept_index_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_concept_index_refresh() TO service_role;


-- 4b) store a batch of vectors: p_rows = [{"id": <brain_concept_index.id>, "embedding": "[v1,…,v768]"}, …].
--     Called by the brain-concept-indexer edge function, one batch per call (no per-row round trips).
CREATE OR REPLACE FUNCTION public.brain_concept_index_store_embeddings(p_rows jsonb, p_model text)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  IF p_model IS NULL OR btrim(p_model) = '' THEN
    RAISE EXCEPTION 'brain_concept_index_store_embeddings: p_model is required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN 0;
  END IF;
  UPDATE public.brain_concept_index i
     SET embedding = (r.value->>'embedding')::extensions.vector(768),
         embedding_model = p_model,
         embedded_at = now(),
         updated_at = now()
    FROM jsonb_array_elements(p_rows) AS r(value)
   WHERE i.id = (r.value->>'id')::bigint;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_concept_index_store_embeddings(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_concept_index_store_embeddings(jsonb, text) TO service_role;


-- 5) hybrid search. p_query_embedding may be NULL (spelling leg only). Only rows embedded by p_model
--    take part in the meaning leg. Inactive observations / intents are dropped by the live joins.
CREATE OR REPLACE FUNCTION public.brain_concept_search(
  p_query_text      text,
  p_query_embedding extensions.vector(768),
  p_model           text,
  p_kinds           text[] DEFAULT NULL,
  p_limit           integer DEFAULT 20,
  p_leg_limit       integer DEFAULT 60,
  p_rrf_k           integer DEFAULT 60
) RETURNS TABLE (
  concept_kind         text,
  concept_code         text,
  rrf                  double precision,
  sem_rank             integer,
  sem_score            double precision,
  sem_text             text,
  lex_rank             integer,
  lex_score            double precision,
  lex_text             text,
  is_farmer_observable boolean,
  category             text
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
SET hnsw.ef_search = 100
SET hnsw.iterative_scan = 'relaxed_order'
SET pg_trgm.word_similarity_threshold = 0.3
AS $$
  WITH q AS (
    SELECT public.brain_concept_normalize(p_query_text) AS qn
  ), sem_raw AS (
    SELECT i.concept_kind, i.concept_code, i.surface_text,
           (1 - (i.embedding OPERATOR(extensions.<=>) p_query_embedding))::double precision AS s
    FROM public.brain_concept_index i
    WHERE p_query_embedding IS NOT NULL
      AND i.embedding IS NOT NULL AND i.is_active AND i.embedding_model = p_model
      AND (p_kinds IS NULL OR i.concept_kind = ANY (p_kinds))
    ORDER BY i.embedding OPERATOR(extensions.<=>) p_query_embedding
    LIMIT greatest(p_leg_limit, 1) * 3
  ), sem AS (
    SELECT b.*, row_number() OVER (ORDER BY b.s DESC, b.concept_kind, b.concept_code)::integer AS r
    FROM (SELECT DISTINCT ON (concept_kind, concept_code) concept_kind, concept_code, surface_text, s
          FROM sem_raw ORDER BY concept_kind, concept_code, s DESC) b
    ORDER BY b.s DESC
    LIMIT greatest(p_leg_limit, 1)
  ), lex_raw AS (
    SELECT i.concept_kind, i.concept_code, i.surface_text,
           word_similarity(i.surface_normalized, q.qn)::double precision AS s
    FROM public.brain_concept_index i, q
    WHERE length(q.qn) > 0 AND i.is_active
      AND (p_kinds IS NULL OR i.concept_kind = ANY (p_kinds))
      AND i.surface_normalized <% q.qn
  ), lex AS (
    SELECT b.*, row_number() OVER (ORDER BY b.s DESC, b.concept_kind, b.concept_code)::integer AS r
    FROM (SELECT DISTINCT ON (concept_kind, concept_code) concept_kind, concept_code, surface_text, s
          FROM lex_raw ORDER BY concept_kind, concept_code, s DESC) b
    ORDER BY b.s DESC
    LIMIT greatest(p_leg_limit, 1)
  ), fused AS (
    SELECT coalesce(sem.concept_kind, lex.concept_kind) AS concept_kind,
           coalesce(sem.concept_code, lex.concept_code) AS concept_code,
           (coalesce(1.0 / (p_rrf_k + sem.r), 0) + coalesce(1.0 / (p_rrf_k + lex.r), 0))::double precision AS rrf,
           sem.r AS sem_rank, sem.s AS sem_score, sem.surface_text AS sem_text,
           lex.r AS lex_rank, lex.s AS lex_score, lex.surface_text AS lex_text
    FROM sem FULL OUTER JOIN lex
      ON lex.concept_kind = sem.concept_kind AND lex.concept_code = sem.concept_code
  )
  SELECT f.concept_kind, f.concept_code, f.rrf, f.sem_rank, f.sem_score, f.sem_text,
         f.lex_rank, f.lex_score, f.lex_text,
         CASE WHEN f.concept_kind = 'observation' THEN om.is_farmer_observable END,
         CASE WHEN f.concept_kind = 'observation' THEN om.observation_category ELSE oim.intent_category END
  FROM fused f
  LEFT JOIN public.observation_master om
         ON f.concept_kind = 'observation' AND om.observation_code = f.concept_code
  LEFT JOIN public.observation_intent_master oim
         ON f.concept_kind = 'intent' AND oim.intent_code = f.concept_code
  WHERE (f.concept_kind = 'observation' AND om.is_active IS TRUE)
     OR (f.concept_kind = 'intent' AND oim.is_active IS TRUE)
  ORDER BY f.rrf DESC, f.concept_kind, f.concept_code
  LIMIT greatest(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.brain_concept_search(text, extensions.vector, text, text[], integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_concept_search(text, extensions.vector, text, text[], integer, integer, integer) TO service_role;


-- 6) shadow log — what the search would have offered vs what the brain decided
CREATE TABLE IF NOT EXISTS public.brain_concept_shadow_log (
  id                 bigserial PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),
  run_kind           text NOT NULL DEFAULT 'chat' CHECK (run_kind IN ('chat', 'eval', 'probe')),
  trace_id           text,
  session_id         text,
  farmer_id          uuid,
  tenant_id          uuid,
  language           text,
  query_text         text NOT NULL,
  script_class       text,
  status             text NOT NULL CHECK (status IN ('ok', 'skipped', 'error')),
  status_detail      text,
  embedding_model    text,
  embed_ms           integer,
  search_ms          integer,
  candidates         jsonb NOT NULL DEFAULT '[]'::jsonb,
  brain_intent       text,
  brain_observations text[],
  response_type      text
);

COMMENT ON TABLE public.brain_concept_shadow_log IS
  'Target-flow step 1 shadow evidence: per chat turn, the concept candidates brain_concept_search would offer next to the intent and observations the brain actually used. Never read by the chat answer path.';

CREATE INDEX IF NOT EXISTS brain_concept_shadow_log_created_idx ON public.brain_concept_shadow_log (created_at DESC);
CREATE INDEX IF NOT EXISTS brain_concept_shadow_log_trace_idx ON public.brain_concept_shadow_log (trace_id);

ALTER TABLE public.brain_concept_shadow_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.brain_concept_shadow_log FROM anon, authenticated;


-- 7) model registry — embedding model, its price and the brain.embed route
INSERT INTO public.ai_model_catalog
  (model_key, provider, api_model_id, status, input_modalities, api_contract, source_url, notes, change_reason)
VALUES
  ('gemini:gemini-embedding-2', 'gemini', 'gemini-embedding-2', 'active', ARRAY['text'],
   '{"token_param":"max_tokens","temperature":"omit","reasoning_efforts":[],"embedding":{"api":"gemini_batch_embed","dimensions":768,"batch_limit":100,"query_template":"task: search result | query: {text}","document_template":"title: none | text: {text}"}}'::jsonb,
   'https://ai.google.dev/gemini-api/docs/embeddings',
   'Embedding model (not a chat model): route it only on embedding tasks such as brain.embed. GA 2026-04-22, 100+ languages, 128-3072 dims (768 recommended, auto-normalised), task given as a text instruction (task_type parameter not supported). api_contract.embedding holds the request format read by embedForTask() in _shared/embeddingProvider.ts.',
   'decision brain target flow step 1: concept retrieval (2026-10-10)')
ON CONFLICT (model_key) DO NOTHING;

INSERT INTO public.ai_model_pricing
  (model_name, input_cost_per_1k, output_cost_per_1k, currency, effective_from, is_active, notes, source_url)
SELECT 'gemini:gemini-embedding-2', 0.0002, 0, 'USD', DATE '2026-10-10', true,
       'Text input $0.20 per 1M tokens, standard paid tier (batch tier $0.10). Embeddings have no output tokens.',
       'https://ai.google.dev/gemini-api/docs/pricing'
WHERE NOT EXISTS (SELECT 1 FROM public.ai_model_pricing WHERE model_name = 'gemini:gemini-embedding-2' AND is_active);

INSERT INTO public.ai_task_route (task_key, description, required_modalities, params, is_active, feature_key, change_reason)
VALUES
  ('brain.embed',
   'Decision Brain concept retrieval — meaning vectors for the farmer question and for the concept index (ai-agriculture-chat agents/concept-retriever.ts, edge function brain-concept-indexer). Embedding models only; all steps must produce 768 values.',
   ARRAY['text'], '{}'::jsonb, true, 'chat',
   'decision brain target flow step 1: concept retrieval (2026-10-10)')
ON CONFLICT (task_key) DO NOTHING;

INSERT INTO public.ai_task_route_step (task_key, step_no, model_key)
VALUES ('brain.embed', 1, 'gemini:gemini-embedding-2')
ON CONFLICT (task_key, model_key) DO NOTHING;


-- 8) shadow flag — created OFF for everyone
INSERT INTO public.feature_flags (flag_name, description, is_enabled, rollout_percentage, flag_status)
SELECT 'brain_concept_shadow',
       'Decision Brain target-flow step 1 in SHADOW mode: run concept retrieval next to each chat turn and write brain_concept_shadow_log. Never changes the farmer''s answer.',
       false, 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE flag_name = 'brain_concept_shadow');


-- 8b) ops key for the brain-concept-indexer function — the repo's sweep-key convention
--     (20260908193339, 20260921120200): a random vault secret that get_sweep_key() hands only to
--     service_role callers, so the index can be refreshed / embedded / evaluated from SQL
--     (net.http_post) without anyone holding the service-role key. The allow-list below is the
--     union of the live list (schedule_narrate_key, schedule_reconciler_key), the repo's
--     rag_eval_key, and the new brain_concept_indexer_key — no existing name is dropped.
CREATE OR REPLACE FUNCTION public.get_sweep_key(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE v text;
BEGIN
  IF p_name IS NULL OR p_name NOT IN ('schedule_narrate_key', 'schedule_reconciler_key', 'rag_eval_key', 'brain_concept_indexer_key') THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sweep_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sweep_key(text) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'brain_concept_indexer_key') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'brain_concept_indexer_key',
      'Bearer key for ops calls (SQL net.http_post) to the brain-concept-indexer edge function');
  END IF;
END $$;


-- 9) verify (read-only)
SELECT 'view_rows' AS check_name, count(*)::text AS value FROM public.brain_concept_source
UNION ALL SELECT 'route', task_key || ' active=' || is_active FROM public.ai_task_route WHERE task_key = 'brain.embed'
UNION ALL SELECT 'route_step', task_key || ' -> ' || model_key FROM public.ai_task_route_step WHERE task_key = 'brain.embed'
UNION ALL SELECT 'flag', flag_name || ' enabled=' || is_enabled FROM public.feature_flags WHERE flag_name = 'brain_concept_shadow'
UNION ALL SELECT 'ops_key', CASE WHEN public.get_sweep_key('brain_concept_indexer_key') IS NOT NULL THEN 'present' ELSE 'MISSING' END;
