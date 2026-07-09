
# Forensic finding — why the wrong observations show

The land‑specific chat has a hard SSOT for each turn: `land_id → crop_code, growth_stage, DAS, biological_state`. The clarification UI must only show symptoms that belong to that (crop, stage, DAS) cell.

Two independent paths in the pipeline collapse those 4 dimensions down to `intent_code` only, and re‑emit ALL crops' observations as candidates for the current turn. That's what puts wrong symptoms on screen.

## Evidence (grep + DB + latest edge log `trace_mrdcv2my_90bz8x`)

DB shape of `public.intent_observation_mapping` (SSOT):
```
intent_code, crop_code, growth_stage, das_min, das_max,
observation_code, assertion_strength, confidence_rank, is_active
```
Sample rows for `EMERGENCE_FAILURE` include: `brinjal_obs_flower_drop`, `chilli_obs_first_picking`, `cotton.boll_opening_visible`, `onion_obs_split_bulb`, `sugarcane.plant_emergence_low`, `rice.obs_rice_no_emergence` … i.e. **6+ crops share the same intent bucket**.

Runtime today:

1. `utils/observation-mapping-cache.ts::loadObservationMapping()` selects only `intent_code, observation_code, assertion_strength, confidence_rank` — it **drops** `crop_code`, `growth_stage`, `das_min`, `das_max`. It then groups by `intent_code` alone. `getObservationsForIntent(intent)` returns the union across all crops/stages/DAS.
2. `decision/observation-code-mapper.ts::mapToObservationCodes()` (line ~294) calls `getObservationsForIntent(intentCode)` and pushes every returned code into the turn's observation set as INFERRED evidence. For a RICE land + intent `EMERGENCE_FAILURE` at DAS=31 stage=transplanting, this injects brinjal / chilli / cotton / onion / sugarcane observation codes.
3. `agents/orchestrator.ts` line 8033 (`OBS_TO_HYP_GAP_ROUTER`) uses the same unscoped cache and stores `candidate_options=12` on `__observationCandidateCodes`. Latest log confirms:
   `[OBS_TO_HYP_GAP_ROUTER] intent=EMERGENCE_FAILURE candidate_options=12 rule_fallback=suppressed`
   Those 12 include non‑rice codes.
4. Downstream, the injected cross‑crop observations pollute:
   - the hypothesis anchor scan (`queryAnchorHypotheses`) → extra hypotheses that only die later via IMPOSSIBLE_CROP,
   - the observation ledger and `ConversationState.inferred` (memory‑relevant to the OBSERVATION_STATE_CONTRACT),
   - and any UI surface that hydrates from the "candidate observations" bag.

The correct crop/stage/DAS scoping already exists — but only in `decision/iom-gate.ts::loadIOMAllowed` (used by `hypothesis-clarification-builder`). The two hot paths above bypass it.

# Fix — one contract, one scope‑aware cache, no agronomy in code

## 1. Make the cache scope‑aware (single change, DB‑driven)

`supabase/functions/ai-agriculture-chat/utils/observation-mapping-cache.ts`

- Extend the paged SELECT to include `crop_code, growth_stage, das_min, das_max`.
- Store rows per intent as a list, not a pre‑unioned set:
  ```
  Map<intent_code, IOMRow[]>
  ```
- Replace `getObservationsForIntent(intentCode)` with:
  ```
  getObservationsForIntent(intentCode, {
    crop_code:    string | null,
    growth_stage: string | null,
    das:          number | null,
  }): IntentMappingEntry
  ```
  The filter runs entirely on cached rows (no DB round‑trip):
  - `crop_code ∈ { cropCode.toLowerCase(), 'all', 'universal' }`
  - `growth_stage ∈ { normalizeStageForDB(stage), 'all' }` (delegate cross‑stage equivalence to `runtime/stage-family-shim.ts` + `crop_stage_graph` — no new synonym map)
  - `das == null OR (das_min ≤ das ≤ das_max)`
  - Order: `assertion_strength` (LITERAL > STRONG_HYPOTHESIS > DIFFERENTIAL) then `confidence_rank` asc; dedupe by `observation_code`, keeping the best row.
- `modal_affected_part` recomputed from the filtered subset (same modal logic).
- Log line stays greppable: `[OBS_MAPPING_CACHE] loaded iom_rows=… intents=…` plus a per‑lookup `[OBS_MAPPING_SCOPE] intent=… crop=… stage=… das=… returned=…`.

Fail‑closed: if the filtered result is empty the function returns `{ observation_codes: [], modal_affected_part: null, source_rows: 0 }`. **No fallback to unscoped union, ever.**

## 2. Pass the SSOT context at both call sites

`supabase/functions/ai-agriculture-chat/decision/observation-code-mapper.ts`

- Extend `mapToObservationCodes(semantic, scope?)` with an optional scope `{ crop_code, growth_stage, das }`. Callers already have `canonicalContext` / `biological_state`; wire it through. When scope is absent, log `[OBS_MAPPING_CACHE_MISS] reason=no_scope` and skip intent expansion (do NOT emit unscoped codes).

`supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (line ~8033, `OBS_TO_HYP_GAP_ROUTER`)

- Read scope from the already frozen locked biological state:
  ```
  { crop_code: landContext.current_crop,
    growth_stage: bioStage,
    das: resolvedDAS }
  ```
- Call `getObservationsForIntent(intentCode, scope)`.
- Either consume `__observationCandidateCodes` (feed into the clarification response as observation options) or delete the write. Today it is written and never read; that dead‑write is what surfaces cross‑crop codes in the audit log even when the UI ignores them. Deleting keeps the surgical footprint minimal.

Every other caller of the cache (search shows only these two) is now automatically scope‑correct.

## 3. Keep the outer clarification contract unchanged

`buildHypothesisClarificationOptions` → `loadIOMAllowed` already does the same scoping via a live SQL query. After the fix, both the cache‑backed and DB‑backed paths return the same crop/stage/DAS‑correct set. This restores the invariant that the UI symptom picker for a rice/transplanting/DAS=31 land can only offer rice observations valid for that cell.

## 4. Regression tests (Deno test runner)

`supabase/functions/ai-agriculture-chat/tests/observation-mapping-cache-scope_test.ts` (new)

- Load fake IOM rows across `rice, cotton, brinjal, onion, sugarcane, all` for one intent.
- Assert `getObservationsForIntent('EMERGENCE_FAILURE', { crop_code:'rice', growth_stage:'nursery', das:15 })` returns only `crop_code ∈ {'rice','all','universal'}` rows AND `das_min ≤ 15 ≤ das_max`.
- Assert cross‑crop pollution never appears.
- Parametrise across 5 crops.

`supabase/functions/ai-agriculture-chat/tests/hypothesis-clarification-scope_test.ts` (new)

- Mock supabase to return the same rows for `intent_observation_mapping`, `observation_master`, `observation_translations`, `hypothesis_conditions`, `hypothesis_master`.
- Run `buildHypothesisClarificationOptions` for `(rice, transplanting, 31)` and assert output `observation_code`s all belong to rice (or `all`), never brinjal/cotton/onion/sugarcane.

## Technical details

Files touched (5):
- `supabase/functions/ai-agriculture-chat/utils/observation-mapping-cache.ts` — scope‑aware refactor
- `supabase/functions/ai-agriculture-chat/decision/observation-code-mapper.ts` — accept + pass scope
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` — pass scope to line 8033, remove or wire `__observationCandidateCodes`
- `supabase/functions/ai-agriculture-chat/tests/observation-mapping-cache-scope_test.ts` — new
- `supabase/functions/ai-agriculture-chat/tests/hypothesis-clarification-scope_test.ts` — new

Do NOT touch:
- DB rows (no migrations)
- `iom-gate.ts` (already correct)
- `hypothesis-clarification-builder.ts` (already correct)
- Any agronomy rule, hypothesis, or observation code
- LLM prompts / narration

Guarantees:
- No hardcoded crop / stage / DAS lists in TypeScript; every filter dimension comes from `intent_observation_mapping` columns.
- Fail‑closed: unscoped or ambiguous calls return `[]` instead of a cross‑crop union.
- No LLM path, no rule engine change.
- Every crop, pest, disease, nutrient, and stress category benefits automatically because the filter is dimensional, not per‑domain.

## Expected effect on the log

For the same query on a rice/transplanting/DAS=31 land you should see:

```
[OBS_MAPPING_SCOPE] intent=EMERGENCE_FAILURE crop=rice stage=transplanting das=31 returned=0
[OBS_TO_HYP_GAP_ROUTER] intent=EMERGENCE_FAILURE candidate_options=0 rule_fallback=suppressed
[OBSERVATION_REQUIRED_PROMOTE_SKIPPED] reason=diagnostic_escalation_no_iom_or_rules
```
…which correctly asks the farmer to add a photo/observation instead of showing brinjal/onion/cotton symptoms.

For a query on a rice/nursery/DAS=10 land you'll see:

```
[OBS_MAPPING_SCOPE] intent=EMERGENCE_FAILURE crop=rice stage=nursery das=10 returned=6
[HYP_CLARIFICATION] options=6 keys=[obs_rice_no_emergence,obs_rice_patchy_emergence,germination_failure,delayed_germination,seed_not_germinated,poor_germination]
```
— only rice, only germination‑stage, DAS‑valid symptoms. That is what the UI will render.
