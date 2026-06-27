
# Fix "Tungro for ungerminated rice" — Neuro-Symbolic Decision Brain Repair

One sentence: the correct differentials already live in `intent_observation_mapping` (IOM); we just need to enforce IOM on candidate generation and bridge the extractor's vocabulary to the crop-specific allowlist codes — then close the surrounding gaps (semantic gate column, alias pagination, category map, label leak, confidence model).

## Phase 0 — Read-only investigation (no edits)

Before any edit, confirm each root cause with grep + read-only SQL and capture findings for the PR description.

1. **Grep signatures** to locate the modules (filenames may differ):
   - Semantic gate: `intent_semantic_class_allowlist`, `SEMANTIC_GATE`, `FAIL_OPEN` (known: `decision/semantic-validator.ts` — already uses `intent_code`; verify call sites still align).
   - IOM usage: `intent_observation_mapping`, `confidence_rank`, `assertion_strength` — confirm it is NOT consulted by candidate/diagnosis assembly (only by LLM allow-list validators today).
   - Loader: `observation_aliases`, `.select(`, `.limit(`, `cachedObservationAliases`, `cachedObservationCodes` — confirm no `.range()` pagination.
   - Category map: `mapBundledCategory`, `was OBSERVATION`, `RuleCategory`.
   - Diag-first / label leak: `DIAG_FIRST`, `A blocking rule is active`, `CIB&RC`, `using raw labels`.
   - Confidence: `UnderstandingChecker`, `ConfidenceBridge`, `semantic=`, `DECISION_PROVIDED`.

2. **Read-only SQL** (SELECT only) to capture the numbers cited in the report:
   - Column list on `intent_semantic_class_allowlist`.
   - `allowed_classes` for `GENERAL_CROP_INFO` (expect `disease` present → class gate alone won't block Tungro).
   - IOM rows for `GENERAL_CROP_INFO + rice + das∈[das_min..das_max] for 18` (expect 3 germination differentials).
   - `COUNT(*)` Tungro rows for `GENERAL_CROP_INFO` (expect 0).
   - `observation_master` rows for the 6 codes (expose vocabulary/class split).
   - `COUNT(*)` from `observation_aliases` (expect ~14,023) and `observation_master` active (expect ~1,997).

Output of Phase 0 is captured verbatim into the PR description. No code touched yet.

## Phase 1 — Apply the 8 fixes (small, independently revertable commits, in this order)

### Commit 1 — Fix B (PRIMARY): Enforce IOM on candidate generation
- New helper `decision/iom-gate.ts` exporting `getAllowedObservations(supabase, intent, crop, stage, das)` querying `intent_observation_mapping` with the documented filters and rank-ordering.
- Call it in the candidate/diagnosis assembly path (the clarification generator + hypothesis evaluator candidate paths — exact insertion point confirmed in Phase 0; likely `agents/clarification-generator.ts` R1 path and `decision/hypothesis-evaluator.ts`).
- Hard-filter `rawCandidates` against `allowedSet`; if `safeCandidates` is empty AND `allowed` is non-empty, surface the rank-ordered `allowed` set as the differentials.
- Emit `[IOM_GATE]` trace with intent/crop/stage/das/allowed/dropped.

### Commit 2 — Fix A: Semantic gate column + fail-CLOSED
- `decision/semantic-validator.ts` is already on `intent_code` (good). Change `loadAllowlist` failure path from FAIL_OPEN to FAIL_CLOSED with a `CONSERVATIVE_DEFAULT_CLASSES` set (`physiology`, `phenology`, `general`, `ndvi`, `weather_damage`) and emit a `gate_degraded=true` flag downstream instead of `semanticConfidence=1`.
- Update the FAIL_OPEN early-return to use the conservative set, log `[SEMANTIC_GATE] FAIL_CLOSED`.

### Commit 3 — Fix C: Concept bridge (extractor → crop vocab)
- New `decision/concept-bridge.ts` with `CONCEPT_BRIDGE` map (rice germination family → `obs_rice_*`) and `bridgeToCropVocab(cropCode, code)` helper.
- Apply to each extracted observation BEFORE `getAllowedObservations`/IOM matching.
- PR notes the durable follow-up: data-driven `canonical_group`/`concept_id` resolution (listed under §3 data migrations, not applied).

### Commit 4 — Fix D: Paginate the rule loader
- In the rule loader module, replace single `.select()` with `fetchAllRows(supabase, table, columns, { activeCol, orderCol })` helper using `.range(from, from+999)` loop until short page.
- Apply to `observation_aliases` (activeCol `active`) and `observation_master` (activeCol `is_active`).
- Log `[RuleLoader] aliases=%d obs_codes=%d (paginated)`; expect ≈14023 and ≈1997.
- Optional: exclude `XLAT_*`/`XDESC_*`/`XMASTER_*` machine tokens from the in-memory match set (keep for trigram lookup only if used).

### Commit 5 — Fix E: `mapBundledCategory` family map + non-DIAGNOSIS default
- Extend `CATEGORY_MAP` with `proactive_irrigation` / `proactive_nutrition` → PRESCRIPTION, `proactive_disease`/`proactive_weed` → WARNING, `proactive_monitoring` → OBSERVATION.
- Add `proactive_*` family fallback → WARNING.
- Default for unknown categories → `OBSERVATION` (never `DIAGNOSIS`); remove the misleading "(was OBSERVATION)" log.

### Commit 6 — Fix F: Honor intent contract
- At symptom-path entry, read `observation_intent_master` config; if `clarification_mode === 'DIRECT'` and `max_clarification_rounds === 0`, build a DIRECT advisory from IOM-allowed observations and skip the diagnosis-clarification loop.

### Commit 7 — Fix G: DIAG_FIRST scope + block guardrail-label leakage
- Pass/import `supabase` into the translation function's scope (eliminate `ReferenceError: supabase is not defined`).
- Filter candidate options to exclude guardrail/block rules (`category ∈ {risk_safety, block}` or block-rule id patterns) before building farmer-facing options.
- Add assertion-style guard that strings `"A blocking rule is active"` and `"CIB&RC"` cannot appear in any user-facing field (filter at renderer).

### Commit 8 — Fix H: Confidence model
- Gate failure contributes `semantic = 0.5` + `gate_degraded` flag (never 1.000).
- Class-aware completeness: germination/phenology/physiology observations require establishment fields (sowing method, seed source, depth, irrigation), NOT `affected_part`/`symptom_distribution`/`severity_words`/`time_reference`.
- Response stamping: if `symbolic_confidence === 0` OR `rules_fired === 0`, emit `NO_DECISION` / `INSUFFICIENT_EVIDENCE` (never `DECISION_PROVIDED`); stop additive top-up over a 0% symbolic floor.

## Phase 2 — Acceptance test (golden)

Add a test (`supabase/functions/ai-agriculture-chat/__tests__/golden-rice-germination.test.ts`) asserting for input `{crop=rice, das=18, stage=seedling, ndvi=0.184, intent=GENERAL_CROP_INFO, query="भात अजून उगवले नाही"}`:

- Candidates ⊆ `{obs_rice_no_emergence, obs_rice_patchy_emergence, obs_rice_seedling_damping_off}` after bridge.
- `tungro_yellow_stunt` and any disease-class code absent from farmer-facing output.
- `"A blocking rule is active"` and `"CIB&RC"` never appear in any user-facing field.
- Response is DIRECT advisory (not empty stage fallback, not disease clarification).
- Not `DECISION_PROVIDED` at 0% symbolic; semantic never 1.000 when gate failed.
- Loader log emits ≈14023 aliases and ≈1997 obs codes.

Regression test must still pass:
- A real Tungro-positive scenario (rice at tillering with virus-consistent symptoms) still surfaces Tungro.
- Sugarcane germination + other crops unaffected.

Run after **each** commit so a regression bisects to one fix.

## Phase 3 — PR description checklist

- Grep hits (file:line) for each of A–H and whether they exist here.
- Phase 0 SQL outputs proving B (3 germination rows, 0 tungro) and D (~14023 aliases).
- Before/after of the golden test.
- List anything not located (so a human can point us to it).

## Out of scope / needs human approval

Listed in PR, NOT applied:
1. Data: add `concept_id`/canonical-group bridge aliases linking generic germination family → crop-specific `obs_*` codes (durable Fix C).
2. Data: add `is_active` join guards where aliases/translations resolve (stop the ~586 dead-observation leaks).
3. Data: backfill 75 active codes with missing translations; close en↔mr/hi gap.

## Operating rules in effect

- Verify before edit (re-grep + read-only SQL each fix).
- No DROP/TRUNCATE/bulk UPDATE/ALTER; no schema changes.
- Keep `[BRAIN_TRACE]`/`[SEMANTIC_GATE]`/`[RuleLoader]`/`[mapBundledCategory]` logging style; add `[IOM_GATE]`.
- One commit per fix, golden test after each.

## Technical notes

- `decision/semantic-validator.ts` already references `intent_code` (Fix A's column issue may already be partially patched). The remaining piece is making it FAIL-CLOSED and stop emitting `confidence=1` on the empty-allowlist path.
- The clarification path already has a `farmer-observable-gate.ts` ontology gate (per prior phases) on `clarification-strategy.ts`; the IOM gate is complementary — it filters by intent+stage+DAS relevance, not just "is this a farmer-observable code". Both should run; IOM first (semantic/agronomic relevance), then ontology gate (farmer-observable surface).
- `decision/intent-resolver.ts::resolveIntentToObservations` exists but is orphan code per `CLARIFICATION_DATA_SOURCE_AUDIT.md`. We can either wire it in for Fix B or call IOM directly via the new `iom-gate.ts` helper — the plan chooses the new dedicated helper to keep stage/DAS filtering explicit and avoid the resolver's stale HOTFIX comments.
