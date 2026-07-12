
# Surgical Refactor: Biological Profile as SSOT Input to Phenology Resolver

Addresses the 3 architectural issues raised in review:
1. **Decouple** `resolve_crop_phenology` from `crop_schedules` — resolver must not know where authority originates.
2. **Separate responsibilities** — schedule resolution, biological profile assembly, and phenology resolution are distinct nodes.
3. **NULL ≠ wildcard** — `'any'` is the only universal match; `NULL` means missing data and never matches at runtime.

No agronomic rules change. No TypeScript agronomic logic added. DB remains SSOT.

---

## 1. New SQL (single migration)

Two functions replace the current monolithic one:

### 1a. `public.resolve_biological_profile(p_land_id, p_as_of)` — NEW
Single responsibility: assemble the authoritative biological context for a land, from whatever sources exist today (and tomorrow, by only extending this function).

Returns a single row:
`crop_code, crop_cycle, cultivation_method, establishment_method, production_system, planting_method, variety_id, sowing_date, sowing_source, transplant_date, current_gdd, evidence text[]`

Source precedence (today):
- `crop_schedules` (active row) → `cultivation_method`, `sowing_date`
- `lands.planting_date` > `lands.last_sowing_date` > `crop_schedules.sowing_date`
- `lands.current_crop`, `lands.crop_cycle`, `lands.current_crop_variety_id`, `lands.transplant_date`, `lands.current_gdd`

Future sources (manual override / IoT / AI-inferred / ERP) are added here only — never inside the resolver.

### 1b. `public.resolve_crop_phenology(...)` — REWRITTEN with pure-input signature

```sql
DROP FUNCTION IF EXISTS public.resolve_crop_phenology(uuid, date);

CREATE OR REPLACE FUNCTION public.resolve_crop_phenology(
  p_crop_code           text,
  p_crop_cycle          text,
  p_cultivation_method  text,
  p_variety_id          uuid,
  p_sow_date            date,
  p_transplant_date     date,
  p_current_gdd         numeric,
  p_as_of               date DEFAULT CURRENT_DATE,
  p_land_id             uuid DEFAULT NULL  -- passthrough for evaluate_stage_transitions only
) RETURNS TABLE (... same shape as before ...)
```

Resolver behavior:
- Knows **nothing** about `lands` or `crop_schedules`.
- Computes `das`, `dat`, phenology_index from inputs only.
- `crop_stage_master` match rules — **NULL is no longer a match**:
  - `csm.cultivation_method = p_cultivation_method` (exact), OR
  - `lower(csm.cultivation_method) = 'any'`
  - Rows with `csm.cultivation_method IS NULL` are treated as data-quality issues and **excluded** at runtime.
- ORDER BY (kept as reviewer approved):
  1. exact cultivation match
  2. `'any'`
  3. crop_cycle match
  4. `stage_node_type = 'biological'`
  5. `das_min ASC`
- Prev/next stage lookups use the **same** exclusion rule.
- `evaluate_stage_transitions(p_land_id, ...)` only called when `p_land_id` is provided.

### 1c. `public.resolve_crop_phenology_for_land(p_land_id, p_as_of)` — thin orchestrator
Backwards-compatible wrapper for existing callers. Composes the two nodes:
```
SELECT bp.* INTO ... FROM public.resolve_biological_profile(p_land_id, p_as_of) bp;
RETURN QUERY SELECT * FROM public.resolve_crop_phenology(bp.crop_code, ..., p_as_of, p_land_id);
```
This preserves every existing call site while making the pure resolver reusable.

### 1d. Data-quality view (non-blocking)
```sql
CREATE OR REPLACE VIEW public.v_crop_stage_master_null_method AS
SELECT id, crop_code, stage_code, growth_stage
FROM public.crop_stage_master
WHERE is_active AND cultivation_method IS NULL;
```
Surfaces rows that will no longer match at runtime so the DB team can backfill with `'any'` or an explicit method.

---

## 2. TypeScript changes (minimum surgical)

Files:
- `supabase/functions/ai-agriculture-chat/agents/biological-state.ts`
  - Rename internal type `cultivation_method` carrier to `biological_profile { crop, crop_cycle, cultivation_method, establishment_method, production_system, planting_method, variety_id, stage, ... }`.
  - Keep `cultivation_method` field for backward compat; new fields are optional.
- `supabase/functions/ai-agriculture-chat/utils/stage-knowledge-cache.ts`
  - Match ranking: exact `cultivation_method` > `'any'` > (no match). Remove any NULL-as-wildcard fallback.
- `supabase/functions/ai-agriculture-chat/runtime/phenology-reconciler.ts`
  - Same NULL-exclusion rule; propagate full `biological_profile` instead of a single field.
- `supabase/functions/ai-agriculture-chat/decision/canonical-context-contract.ts`
  - `[CANONICAL_CONTEXT_SRC]` trace surfaces the whole `biological_profile` and `stage_source`.
- Update top-of-file CHANGE LOG blocks per project rule.

No other files touched. No graph nodes rewritten.

---

## 3. Updated data flow

```text
Land Context
     │
     ▼
resolve_biological_profile()      ← ONLY node that reads crop_schedules/lands
     │  biological_profile
     ▼
resolve_crop_phenology(profile)   ← pure, reusable, crop-agnostic
     │  BiologicalState
     ▼
Canonical Context (carries biological_profile)
     │
     ▼
Observation Resolver → Intent → Hypothesis Graph → Decision Rules
     │
     ▼
Unified Gate → Safety Gates → LLM Formatter
```

---

## 4. Regression guarantees

- `resolve_crop_phenology_for_land(land_id, as_of)` returns the same shape and semantics as today's `resolve_crop_phenology(land_id, as_of)` for all existing call sites.
- Rice DAS 34 + Direct Seeded → `RICE_DSR_EARLY_VEGETATIVE`.
- Rice DAS 34 + Transplanted → `RICE_TRANSPLANTING`.
- Rows in `crop_stage_master` with `cultivation_method IS NULL` will stop matching — surfaced via the data-quality view for backfill. This is intentional per reviewer's Problem 3.

---

## 5. Deliverables order

1. `supabase--migration` with: new `resolve_biological_profile`, rewritten pure `resolve_crop_phenology`, wrapper `resolve_crop_phenology_for_land`, data-quality view. Migration also updates any internal callers to use the wrapper name.
2. After migration approval: TS edits to the 4 files above (biological_profile propagation, NULL-exclusion in cache/reconciler, canonical context trace, CHANGE LOG updates).
3. Verification traces:
   - `[BIO_PROFILE_SRC] cultivation_method=direct_seeded source=crop_schedules`
   - `[PHENOLOGY_RESOLVE] method=direct_seeded stage=RICE_DSR_EARLY_VEGETATIVE order=exact`
   - `[CANONICAL_CONTEXT_SRC] biological_profile={...}`
