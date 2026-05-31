## Scope

Neuro-symbolic brain routing fix. Strict role separation: LLM = language only; symbolic brain = decisions. No new agronomic rules. No changes to RLS-disabled advisory tables.

## Verified problems (from live audit)

1. LLM emits non-canonical intents (e.g. `INPUT_RECOMMENDATION`) absent from `observation_intent_master` (88 rows).
2. Raw Marathi text leaks into `observations` array.
3. `crop_code` case mismatch: `decision_rules` has `RICE`/`WHEAT` upper, `intent_observation_mapping` has them lower → silent JOIN miss.
4. Sugarcane missing ~47 intents in `intent_observation_mapping` (notably `SPRAY_TIMING_QUERY`, full `FERTILIZER_SCHEDULE` stages).
5. `crop_vocabulary` has almost no Marathi/Hindi fertilizer/spray patterns; existing ones biased to phantom codes (`NUTRITION`, `EDUCATION`).
6. Many `crop_vocabulary.recommended_intent_bias` values do not exist in `observation_intent_master`.
7. Clarification gates still fire on advisory turns; stale `awaiting_clarification` state repeats wrong question.
8. DAS bounds (`crop_age_days_min/max`) not verified in rule loader.

## Code changes (build phase)

### A. `agents/semantic-extractor.ts`
- Add cached `getValidIntentCodes(supabase)` from `observation_intent_master` where `is_active=true`.
- Inject the full code list into LLM classification prompt as hard constraint.
- Validate output → 1 retry with stricter prompt → fallback `GENERAL_CROP_INFO` @ confidence 0.3.
- Log `[IntentValidator] Loaded N canonical intent codes from DB`.

### B. `agents/orchestrator.ts`
1. Add module-level helpers:
   - `isCanonicalObservationCode(s)` → `/^[A-Z][A-Z0-9_]+$/` and length ≤ 80.
   - `filterToCanonicalObservations(arr)` with `[ObservationContract] BLOCKED ...` logging.
   - Apply at 3 boundaries: after NLU assembly, after clarification answer mapping, at audit-log payload assembly.
2. Add `ADVISORY_DIRECT_INTENTS` module-level Set (the 30 verified codes from report) + `isAdvisoryRoute()`.
3. Strengthen DIRECT-mode crop source check (multi-source: landContext, canonicalContext, crop_schedule, cropContextAuthority).
4. At each clarification gate (Zero-Code, Understanding-Completeness, Evidence-Coverage): early-return bypass when `isAdvisoryRoute()` and crop present. Log `[AdvisoryBypass]`.
5. Stale clarification reset: if `clarification_active && isAdvisoryRoute(currentIntent)` and message doesn't match pending options → clear state, set `decision_state='decision_in_progress'`, log `[StaleClarificationReset]`.

### C. `agents/layered-rule-evaluator.ts` (and any other rule loaders)
- Ensure DB query filters by DAS:
  `.or('crop_age_days_min.is.null,crop_age_days_min.lte.<DAS>')`
  `.or('crop_age_days_max.is.null,crop_age_days_max.gte.<DAS>')`
- Use case-insensitive crop match (`.ilike`) until Fix D applied.

### D. Crop code casing
- Pick Option A (data normalize). Migration after read-only verification + user approval:
  ```
  UPDATE decision_rules / intent_observation_mapping / crop_vocabulary
  SET crop_code = UPPER(crop_code) WHERE crop_code <> UPPER(crop_code);
  ```
- Keep code-side `.ilike` as belt-and-suspenders.

## DB migrations (require explicit user approval per fix)

All preceded by the report's read-only verification queries; results shown to user before any UPDATE/INSERT.

- **Fix 3** — `normalize_crop_code_case` (UPPER across 3 tables).
- **Fix 5** — `seed_advisory_vocabulary_mr_hi` (Marathi/Hindi fertilizer, spray, irrigation patterns; fix existing wrong biases).
- **Fix 6** — Orphan `recommended_intent_bias` remap (user provides mapping table; no auto-remap).
- **Fix 4** — Sugarcane intent-observation mapping additions: per-intent agronomist approval; no bulk insert.

## Out of scope

- No new `decision_rules` content.
- No multilingual columns on rules.
- No hardcoded vernacular strings in `.ts`.
- General-chat path untouched.
- 21 RLS-disabled advisory tables untouched.

## Validation after deploy

Run test query "सध्या कोणते खत देवू आणि फवारणी घेवू ?" on sugarcane DAS=154.

Audit-log expectations:
- `intent_label` ∈ {`FERTILIZER_SCHEDULE`, `SPRAY_TIMING_QUERY`, `NUTRIENT_STRESS_SIGNAL`}
- `observations` = canonical codes or `[]`
- `rules_fired` non-empty
- `response_source = DECISION_RULES`
- `validation_passed = true`

Required log markers:
- `[IntentValidator] Loaded 88 canonical intent codes from DB`
- `[ObservationContract] BLOCKED 0 non-canonical entries`
- `[AdvisoryBypass] Skipping clarification gate for advisory intent=FERTILIZER_SCHEDULE`

Regression checks: disease query still clarifies; greeting returns greeting; irrigation routes to `IRRIGATION_QUERY`; cotton "कोणते खत द्यावे?" routes to `FERTILIZER_SCHEDULE` with `crop_code=COTTON`.

## Execution order

1. Code fixes A, B, C (single deploy of `ai-agriculture-chat`).
2. Run read-only verification queries for Fix 3, 5, 6, 4; present results.
3. Apply approved migrations one-by-one.
4. Re-run validation test + regression set.