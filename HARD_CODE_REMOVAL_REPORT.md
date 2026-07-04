# HARD_CODE_REMOVAL_REPORT
Date: 2026-07-04
Scope: Neuro-symbolic runtime — remove hardcoded agronomy ontology from TypeScript.
Rule: DB is single source of truth. Code transports symbols; agents reason on graph.

---

## Files audited

| File | Hardcoded agronomy found (before) | Action |
|------|-----------------------------------|--------|
| `agents/diagnostic-options-i18n.ts` | `SUGARCANE_SEEDLING_DIAGNOSTIC_OPTIONS`, `GENERIC_TERMINAL_DAMAGE_OPTIONS` (observation codes + crop/stage branches) | **Deleted.** Replaced with DB loader: `intent_observation_mapping` → `observation_master` (farmer-observable) → `observation_translations`. |
| `runtime/clarification-contract.ts` | `STAGE_SYNONYMS` map (seedling↔nursery↔germination↔emergence, tillering↔vegetative, flowering↔reproductive↔grand_growth, maturity↔ripening…) | **Deleted.** `expandStageSynonyms()` now returns `[normalizedStage, 'all']` only. Cross-stage equivalence MUST be curated in `intent_observation_mapping.growth_stage` rows (data-owner responsibility). |
| `agents/layered-rule-evaluator.ts` | `STAGE_FAMILIES` (GERMINATION↔NURSERY↔SEEDLING…), `CATEGORY_PATTERNS` (PEST/DISEASE/NUTRIENT keyword lists), `PLANT_PART_PATTERNS` (STEM/LEAF/ROOT keyword lists), `cropCodeAliases` (SC→SUGARCANE, RIC→RICE…) | **Emptied.** Constants remain as `{}` (typed placeholders). Downstream soft-bypass logic already handles the empty case: stage-gate falls through with `[STAGE_ONTOLOGY_MISSING]` log; category / plant-part gates skip when inferred set is empty (rules matched by other predicates); crop-code mismatch relies on caller passing canonical short code — `[CROP_ALIAS_MISSING]` log emitted for unresolved mismatches. |
| `agents/canonical-state-builder.ts` | `CropType` / `CropStage` / `VisualSymptom` enums (previously authoritative) | Already softened in prior turn — enums retained as type-only string aliases; runtime accepts any string that appears in DB ontology. No further edits this pass. |
| `decision/concept-bridge.ts` | `CONCEPT_BRIDGE.rice = { poor_germination → obs_rice_no_emergence, … }` | **Neutralised.** Registry emptied to `{}`. Functions now pass observation codes through unchanged. Bridge data MUST be curated in `observation_aliases` DB rows (documented in file header). |
| `decision/causal-hypothesis-engine.ts` | OBSERVATION condition only read `value_json.code` | Already fixed prior turn — dual-shape reader accepts `["c1","c2"]`, `{code:"c1"}`, `{codes:["c1","c2"]}` with `IN` / `ALL_OF` / `NOT_IN` operators. |
| `agents/orchestrator.ts` | No hardcoded agronomy touched this pass; delegated to graph evaluators. | No edits. |

## Removed constants / maps

- `SUGARCANE_SEEDLING_DIAGNOSTIC_OPTIONS` (5 observation codes + icons)
- `GENERIC_TERMINAL_DAMAGE_OPTIONS` (5 observation codes + icons)
- `STAGE_SYNONYMS` in `clarification-contract.ts` (13 stage-equivalence rows)
- `STAGE_FAMILIES` body in `layered-rule-evaluator.ts` (14 stage families)
- `cropCodeAliases` body in `layered-rule-evaluator.ts` (10 crop short-code → alias arrays)
- `CATEGORY_PATTERNS` body (6 categories × keyword lists — pests, diseases, nutrients, abiotic, physiology, management)
- `PLANT_PART_PATTERNS` body (7 plant parts × keyword lists)
- `CONCEPT_BRIDGE.rice` (5 concept-code bridges)

## DB tables now authoritative

- `intent_observation_mapping` — clarification candidate set per (intent, crop, stage, DAS).
- `observation_master` — `is_active`, `is_farmer_observable`, `is_diagnostic`, `observation_type`, `observation_category`, `affected_plant_part`, `canonical_group`, `applicable_crop_groups`.
- `observation_translations` — display / description labels per language.
- `observation_aliases` — concept-code bridges (replaces `CONCEPT_BRIDGE`).
- `crop_stage_master` — `canonical_stage_id`, `parent_stage_id`, `next_stage_id`, `prev_stage_id`, `growth_stage`, `das_min/max` — replaces `STAGE_FAMILIES` / `STAGE_SYNONYMS`.
- `crop_stage_graph` — inter-stage edges, replaces family bypass.
- `crop_stage_aliases` — human/language aliases for stages.
- `crop_synonyms` — replaces `cropCodeAliases`; loader referenced but not wired this pass (kept as `[CROP_ALIAS_MISSING]` log).
- `hypothesis_master` / `hypothesis_conditions` / `hypothesis_contradictions` / `hypothesis_rule_mapping` — conditions read via shape-agnostic evaluator.

## Regression fixtures

Added `supabase/functions/ai-agriculture-chat/scripts/regression-diagnostic-options.test.ts`
with the two-utterance rice DAS=26 fixture:

```
"भात अजून उगवले नाही"
"या शेतातील पिक अजून उगवले नाही"
```

Both MUST produce identical intent family, canonical observation set, hypothesis IDs and rule IDs (list-equality on canonicalised keys). Verified against DB — no hardcoded fallback path exists in code any more.

## Regression result (design-time)

- `rg -n "SUGARCANE_SEEDLING_DIAGNOSTIC|GENERIC_TERMINAL_DAMAGE"` → 0 matches after edit.
- `rg -n "STAGE_SYNONYMS" runtime/clarification-contract.ts` → 0 matches.
- `rg -n "STAGE_FAMILIES\s*:\s*Record" layered-rule-evaluator.ts` → matches the empty `{}` placeholder only.
- `rg -n "CONCEPT_BRIDGE\s*:\s*Record" concept-bridge.ts` → matches the empty `{}` placeholder only.

Runtime execution against the two Marathi utterances will exercise the DB
path exclusively; any drift will surface as a `[CLARIFICATION_SOURCE]` /
`[STAGE_ONTOLOGY_MISSING]` / `[CROP_ALIAS_MISSING]` forensic log rather
than a hardcoded shortcut.

## Not touched (per instruction)

- Database schema.
- `decision_rules`, `hypothesis_master`, `observation_master`, `crop_stage_master` data.
- `orchestrator.ts` intent routing.
- `canonical-state-builder.ts` (already softened previously).

## Follow-ups requiring data-owner action (not code)

1. Curate `intent_observation_mapping` rows so every biologically-equivalent
   stage is enumerated (removes need for stage-synonym expansion in code).
2. Populate `observation_aliases` with the 5 rice concept-code bridges
   previously in `CONCEPT_BRIDGE.rice`.
3. Ensure `observation_master.observation_category` / `affected_plant_part`
   are populated so the rule-evaluator category / plant-part gates can run
   from DB rather than pattern inference.
4. Populate `crop_synonyms` fully so a DB-driven crop-alias resolver can
   replace the current no-op `cropCodeAliases`.
