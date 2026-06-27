# Clarification Ontology Contract — Production Refactor

## Goal

Make `intent_observation_mapping` (IOM) the **only** producer of farmer clarification options. Stop rule metadata (`decision_rules.observable_characteristics`, `conditions_json.observations`), synthetic keys (`CROP_STAGE`, `MANAGEMENT_PLANNING`), diagnosis names (`TUNGRO_YELLOW_STUNT`), and English fallback templates from reaching the UI. Adopt `lower_snake_case` as the platform-wide canonical observation identifier.

## Architectural Contract

```text
Farmer Query → Intent → CanonicalContext → Hypothesis (IDs+confidence ONLY)
                                              │
                                              ▼
        intent_observation_mapping(intent, crop, stage, das)
                                              │  (curated candidate observation_codes)
                                              ▼
              observation_master validation gate (active, farmer_observable)
                                              │
                                              ▼
                          Clarification UI  (label + observation_key)
                                              │
                                              ▼
                Farmer selection → Rule evaluation → Recommendation
```

Ownership (immutable):
- `intent_observation_mapping` — only source of clarification candidates.
- `observation_master` — validator + label/metadata lookup.
- `decision_rules` / `conditions_json` / `observable_characteristics` — internal rule predicates only; never produce UI options.
- Hypothesis engine — emits hypothesis IDs + confidence + intent. Never emits UI options.

## Canonical Symbol Format

`lower_snake_case` (matches DB). All comparisons via a single `canonicalizeObservationKey()` helper. No `.toUpperCase()` on observation codes anywhere in the clarification path.

## Files Modified

### 1. New: `supabase/functions/ai-agriculture-chat/runtime/clarification-contract.ts`
Single enforcement module. Exports:
- `canonicalizeObservationKey(s)` → `lower_snake_case`
- `loadClarificationCandidates({ supabase, intent_code, crop_code, growth_stage, das, language, max=3 })` — does **only**:
  1. Query IOM (intent + crop+'all' + stage synonyms + DAS, ordered by `confidence_rank`).
  2. Inner-join filter against `observation_master` (`is_active=true`, `is_farmer_observable=true` if column present, else `is_active` only).
  3. Load labels via `observation_translations` for `language` (fallback `en`).
  4. Return `Array<{ observation_key: string /* canonical */, label: string, confidence_rank: number }>`.
  5. Return `[]` on any failure. **Never** synthesizes, never humanizes codes.
- `assertClarificationContract(options, ctx)` — drops any option whose key fails canonical/IOM/master gate. Logs `[CONTRACT_VIOLATION]` for each drop.

Complexity: O(k) where k = candidate count for the (intent, crop, stage, das) cell; uses indexed `.in()` filters; no full-table scans.

### 2. `supabase/functions/ai-agriculture-chat/agents/clarification-generator.ts`
- Replace the R1 block (lines 243–329) with a single call to `loadClarificationCandidates(...)`.
- If `resolvedIntent` is missing or IOM returns `[]`, return `{ options: [], response_text: <ack + neutral “please share more about your crop/issue” line>, photo_requested: false }`. **No** fallback to `renderClarificationAsync`.
- Remove `STEP 4`/`STEP 5`/`STEP 6` template fallback for `REFINE_OBSERVATION` (still allowed for `IDENTIFY_CROP`, `IDENTIFY_LOCATION`, `IDENTIFY_DISTRIBUTION`, `IDENTIFY_SEVERITY` scopes which are not observation ontology).

### 3. `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`
- **Delete** the synthetic-observation block (lines 808–825) that promotes `conditions_json.observations` via `obs.toUpperCase()` into `observable_characteristics`.
- Rules with no `observable_characteristics` keep `effectiveObsChars = []`. They still match for internal evaluation; they simply cannot contribute UI options.
- Keep the farmer-observable gate (already present at 891–910) but switch its comparison to `canonicalizeObservationKey()` instead of `.toUpperCase()`.
- Add: hypothesis output type no longer carries any field consumed as a UI option. Mark `observable_characteristics` `@internal`.

### 4. `supabase/functions/ai-agriculture-chat/decision/diagnosis-first-generator.ts`
- Remove direct emission of `observable_characteristics` codes as UI clarification options. When the orchestrator calls into this module for "differentials", route through `loadClarificationCandidates` using the active hypothesis's `intent_code`.
- Delete `humanizeCode()` paths that turn raw codes into labels for UI.

### 5. `supabase/functions/ai-agriculture-chat/agents/clarification-renderer.ts` + `canonical-observation-loader.ts`
- `REFINE_OBSERVATION` scope: short-circuit — return empty options. Renderer is now only used for non-observation scopes (crop/location/distribution/severity). Remove `BASE_TEMPLATES.options` for `DIAGNOSIS` scope.
- `canonical-observation-loader.ts`: keep for non-REFINE scopes; mark `loadObservationKeysFromDB` deprecated for clarification use.

### 6. `supabase/functions/ai-agriculture-chat/runtime/farmer-observable-gate.ts`
- Switch all key comparisons to `canonicalizeObservationKey()` (lower_snake_case). Match `observation_master.observation_code` in its native case.

### 7. `supabase/functions/ai-agriculture-chat/decision/iom-gate.ts`
- Replace `.toUpperCase()` on stored keys (lines ~140, ~200) with canonical lower_snake_case to match `observation_master`. Set `allowedSet` to canonical lowercase.

### 8. `supabase/functions/ai-agriculture-chat/index.ts` (response assembly)
- Final outbound guard: before serializing `options`, run `assertClarificationContract`. If any option drops, the entire option list is dropped and an audit row is written. Prevents any future regression from leaking diagnosis tokens.

## Validation (Rice / Germination scenario)

Trace for `"भात अजून नाही उगवले"`, intent=`EMERGENCE_FAILURE`, crop=`rice`, das=`17`, stage=`seedling`:

1. Hypothesis engine emits `{ intent_code: 'EMERGENCE_FAILURE', candidates: [...IDs] }`.
2. `loadClarificationCandidates` queries IOM → 29 rows → top 3 after master-gate + dedupe: `seed_not_germinated`, `germination_failure`, `obs_rice_no_emergence`.
3. `observation_translations` loads Marathi labels.
4. UI receives `[{ observation_key:'seed_not_germinated', label:'…' }, …]`.
5. `assertClarificationContract` passes; no diagnosis names; no `CROP_STAGE`; no `TUNGRO_YELLOW_STUNT`.

## Scalability

Per-turn DB cost: 1 IOM query (≤30 rows), 1 master validate (`.in(codes)`), 1 translation lookup (`.in(codes)`). All indexed. Memory: O(candidates). No ontology pre-load. Safe for millions of concurrent users.

## Out of Scope

No schema changes. No LLM prompt edits. No frontend changes. No removal of `decision_rules` (still used for rule evaluation after farmer selection).
