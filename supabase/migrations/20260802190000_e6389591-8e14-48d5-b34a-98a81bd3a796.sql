-- ═══════════════════════════════════════════════════════════════════════════
-- Contradiction-engine schema completion for intent_assertion_pattern
-- ───────────────────────────────────────────────────────────────────────────
-- runtime/contradiction-engine.ts reads four per-assertion compatibility fields
-- (stage_compatibility, crop_compatibility, das_min, das_max) to raise
-- STAGE_MISMATCH / CROP_MISMATCH / DAS_OUT_OF_RANGE contradictions in the
-- pre-navigation graph guard. Those columns never existed on the table, so the
-- SELECT could not fetch them and the three DB-driven contradiction kinds could
-- never fire. This migration adds them.
--
-- SEMANTICS (DB is SSOT — no hardcoded agronomy in TS):
--   • All columns are NULLABLE. NULL / empty ⇒ "not configured for this
--     assertion" ⇒ the corresponding contradiction check is skipped (fail-open),
--     which is exactly the current runtime behaviour. No existing row changes
--     behaviour until an agronomist curates these values.
--   • stage_compatibility / crop_compatibility hold the canonical
--     lower_snake_case stage / crop codes an assertion is biologically
--     compatible with. The literal 'all' means "any" (already honoured by the
--     engine). Values are normalised by the engine, so casing here is tolerant.
--   • das_min / das_max bound the days-since-sowing window the assertion is
--     valid in (inclusive). Either bound may be NULL for an open-ended range.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.intent_assertion_pattern
  ADD COLUMN IF NOT EXISTS stage_compatibility text[],
  ADD COLUMN IF NOT EXISTS crop_compatibility  text[],
  ADD COLUMN IF NOT EXISTS das_min             integer,
  ADD COLUMN IF NOT EXISTS das_max             integer;

COMMENT ON COLUMN public.intent_assertion_pattern.stage_compatibility IS
  'Canonical lower_snake_case growth stages this assertion is compatible with; ''all'' = any; NULL/empty = STAGE_MISMATCH check skipped (contradiction-engine.ts).';
COMMENT ON COLUMN public.intent_assertion_pattern.crop_compatibility IS
  'Canonical lower_snake_case crop codes this assertion is compatible with; ''all'' = any; NULL/empty = CROP_MISMATCH check skipped (contradiction-engine.ts).';
COMMENT ON COLUMN public.intent_assertion_pattern.das_min IS
  'Inclusive lower bound (days since sowing) the assertion is valid in; NULL = open-ended. Used by DAS_OUT_OF_RANGE (contradiction-engine.ts).';
COMMENT ON COLUMN public.intent_assertion_pattern.das_max IS
  'Inclusive upper bound (days since sowing) the assertion is valid in; NULL = open-ended. Used by DAS_OUT_OF_RANGE (contradiction-engine.ts).';
