
# Wave-S (Revised) — Canonical Vocabulary Consolidation, Not Parallelization

## Why this revision

The previous Wave-S draft would have created `observation_canonical` and `observation_vocabulary_alias` as **net-new** stores, leaving the project with **5 parallel vocabulary tables** instead of consolidating the 3 it already has. A fresh forensic check of the live DB confirms the auditor's claim:

- `public.observation_master` — **2,540 rows**, already has `observation_code` (unique), `semantic_class` (10 values: disease, pest, nutrient, phenology, weed, physiology, weather_damage, management, …), `observation_category` (57 values), `description`, `is_active`, `severity_level`, `canonical_group`, `affected_plant_part`, `applicable_crop_groups`, `is_farmer_observable`.
- `public.observation_aliases` — **2,919 rows**, code→code only (no free-text, no language, no confidence).
- `public.observation_translations` — **5,145 rows**, code→display-text (outbound only, en/hi/mr).

Net-new fields actually missing on `observation_master`: **`polarity`** and **`applies_to_stages`**. Everything else proposed is duplication.

The real failure mode (260 orphaned discriminators, 117 unfireable hypotheses, soft full-scope fallback leaking treatment) is a **data-integrity + wiring problem**, not a missing-schema problem.

## Goal

End Wave-S with **one** canonical observation registry (`observation_master`), **one** alias store (extended `observation_aliases`), an **orphan gap tracker**, all 260 orphan tokens reconciled, and the hypothesis gate converted from soft fallback to hard invariant ("no diagnosis → no treatment").

## Scope (in order)

### 1. Extend `observation_master` in place
Migration adds two columns — no new table:
- `polarity text` CHECK in (`positive`, `negative`, `neutral`), default `neutral`.
- `applies_to_stages text[]` default `'{}'::text[]`, GIN-indexed.

Backfill `polarity` deterministically from existing `semantic_class` / `observation_category` (disease/pest/weather_damage/weed → `negative`; phenology/management → `neutral`; explicit "healthy"/"vigorous" categories → `positive`). No agronomic logic in code — derivation is a single SQL UPDATE driven only by existing columns.

### 2. Extend `observation_aliases` in place (do not create a parallel table)
Migration adds:
- `alias_text text` (nullable; lets us store free-text/vernacular phrases alongside the existing code-pair rows).
- `alias_normalized text GENERATED ALWAYS AS (lower(btrim(coalesce(alias_text, alias_code)))) STORED`.
- `language text NOT NULL DEFAULT 'und'`.
- `source text NOT NULL DEFAULT 'legacy'` CHECK in (`legacy`, `rule_token`, `hypothesis_token`, `observation_master`, `farmer_utterance`, `curated`, `backfill`).
- `confidence numeric(4,3) NOT NULL DEFAULT 1.000`.
- `active boolean NOT NULL DEFAULT true`.
- Trigram index on `alias_normalized` (pg_trgm) — actually used by the resolver (LIKE / `%` operator), not just declared.
- Composite unique on `(alias_normalized, language, source)`.

### 3. Add `observation_vocabulary_gaps` (the only genuinely new table)
Lightweight orphan logger. Loader + NLU + rule/hypothesis ingest write any token that fails resolution. Turns the manual orphan hunt into a standing alarm. Upsert-on-conflict to bump `occurrences` and `last_seen_at`.

### 4. Single resolver — TS-side, calling DB
- Consolidate the eight competing TS normalizers behind **one** entrypoint `resolveObservationCanonical(raw, {language})` in `supabase/functions/ai-agriculture-chat/runtime/observation-resolver.ts`.
- It calls a single SQL function `public.resolve_observation_canonical(_raw, _language)` that:
  1. Exact match on `observation_aliases.alias_normalized` (filtered by language with `und` fallback, ordered by confidence).
  2. Falls back to trigram fuzzy match (`alias_normalized % normalized_input`) with a similarity threshold of 0.55 — this is what justifies the GIN/trgm index.
  3. Returns `(canonical_code, match_type, similarity)`.
- On miss, the TS wrapper writes the token to `observation_vocabulary_gaps` (fire-and-forget, never blocks the request).
- Existing normalizers (`code-normalizer.ts`, `crop-code-normalizer.ts`, `entity-normalizer.ts`, `dialect-normalizer.ts`, `observation-code-mapper.ts`, `observation-key-mapper.ts`, `language-normalizer.ts`, `regional-translator.ts`) are reduced to thin shims that delegate to the single resolver; their internal alias tables are dropped over the next two waves.

### 5. Backfill (the step the previous draft skipped)
A single idempotent migration block:
- INSERT INTO `observation_aliases` (`alias_text`, `canonical_code`, `language`, `source`, `confidence`) — backfill from `observation_translations` (5,145 rows, language-tagged, confidence=1.0, source=`observation_master`).
- INSERT all distinct rule-side discriminator tokens found in `decision_rules` + `hypothesis_conditions` that currently resolve to a known canonical code into `observation_aliases` with source=`rule_token` / `hypothesis_token`.
- The remaining **260 unresolved discriminator tokens** are written into `observation_vocabulary_gaps` with `resolved=false`. A follow-up curated SQL (separate insert, reviewed) maps them to either a new canonical row or an existing alias — no agronomy invented in code.
- Collapse the duplicate emergence/germination canonical-group family by updating `observation_master.canonical_group` via a single mapping SQL (mapping is data, not code).

### 6. Harden hypothesis gating — no diagnosis → no treatment
- `decision/unified-decision-gate.ts`: replace the soft "full-scope fallback" with a hard invariant. If `eligible_hypotheses_after_gating.length === 0`, the gate returns `SUPPRESSED_NO_HYPOTHESIS` and writes a `RULE_EMISSION_MISMATCH`-style violation to `ai_safety_violations` (already exists from Wave-R).
- Threshold (`min_hypothesis_confidence`) reads from `hypothesis_master` column — already present from earlier waves — not hardcoded.
- This is the change that actually unblocks the leaking treatment text; Waves T/U/V then refine it but don't gate on it.

### 7. Regression tests
Add `supabase/functions/ai-agriculture-chat/_tests/wave_s_vocabulary_and_gate_test.ts`:
- Resolver returns canonical code for raw farmer text in mr/hi/en across all 10 `semantic_class` values.
- Unknown token writes a row to `observation_vocabulary_gaps`.
- Hard gate: zero eligible hypotheses → response carries no `application_details`/`action_text` and a `SUPPRESSED_NO_HYPOTHESIS` violation is recorded.
- The original failing query `पिक अद्याप उगवले नाही` now resolves to a canonical phenology code (after backfill) and either emits a rule-backed response or clarification — never a treatment with `rules_fired = 0`.

## Out of scope (kept for Waves T/U/V)
- Universal hypothesis ranking engine (T).
- Evidence-gap chip selection refactor (U).
- Diagnostic confidence histogram + hard NO_DIAGNOSIS gate observability (V).
- Deprecating/dropping `observation_translations` (left intact until consumers migrate — read-only).

## Files

**New**
- `supabase/functions/ai-agriculture-chat/runtime/observation-resolver.ts`
- `supabase/functions/ai-agriculture-chat/_tests/wave_s_vocabulary_and_gate_test.ts`

**Modified (thin shim conversions only)**
- `supabase/functions/ai-agriculture-chat/runtime/code-normalizer.ts`
- `supabase/functions/ai-agriculture-chat/runtime/crop-code-normalizer.ts`
- `supabase/functions/ai-agriculture-chat/runtime/observation-code-mapper.ts`
- `supabase/functions/ai-agriculture-chat/runtime/observation-key-mapper.ts`
- `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts` (hard gate)
- `supabase/functions/ai-agriculture-chat/index.ts` (wire gap-logger)

**Migrations (3, in order)**
1. `ALTER observation_master` add `polarity`, `applies_to_stages` + GIN index + backfill `polarity`.
2. `ALTER observation_aliases` add `alias_text`, `alias_normalized` (generated), `language`, `source`, `confidence`, `active` + trigram index + composite unique + `pg_trgm` extension guard; backfill from `observation_translations` and rule/hypothesis tokens.
3. `CREATE observation_vocabulary_gaps` + GRANT + RLS + service-role policy; `CREATE FUNCTION resolve_observation_canonical()` (SECURITY DEFINER, search_path=public, exact+trgm fallback).

## Non-goals (explicit)
- No `observation_canonical` table.
- No new alias table parallel to `observation_aliases`.
- No hardcoded crop / language / agronomic rules in TS.
- No edits to `auth`, `storage`, `realtime`, `supabase_functions`, `vault`.
- No drop/rename of existing public columns or tables in this wave.

## Rollout
Migrations 1→2→3 (each independently reversible), then code changes, then regression tests. Wave-S deploys behind the existing Wave-R safety gate, so any vocabulary regression surfaces as `SUPPRESSED_NO_HYPOTHESIS` rather than leaked treatment text.
