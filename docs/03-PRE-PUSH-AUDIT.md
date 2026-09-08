# Pre-push audit — hardcoded agronomy, crop-agnosticism, language-agnosticism (2026-09-08)

Scope: every file in this bundle, scanned line by line (comments excluded) for crop names, product / active-ingredient names, stage names, doses or thresholds with units, Indic-script literals and language words; then read for logic that would only be true for one crop, one language or one region.

## Verdict
Three findings in my own new code — all fixed in this revision. Nothing else in the bundle encodes agronomy; every remaining list is a taxonomy (phases, clocks, task types from the DB CHECK constraint, input kinds), a unit vocabulary, or a structural bound. Ready to push.

## Findings and fixes
| # | Where | Finding | Severity | Fix |
|---|---|---|---|---|
| 1 | `llm-candidates.ts` `policyAllowsInput` | Used invented farming-policy aliases (`organic`, `natural`, `conventional`) and a different rule for `organic_fertilizer` than `evidence-pack.ts` — two gates could disagree on the same farmer. | P1 (governance consistency) | Mirrors `evidence-pack.ts` exactly: `organic_only` · `organic_fertilizer` = integrated · `fertilizer_pesticide` = synthetic_allowed. Test asserts both files share the vocabulary. |
| 2 | `llm-candidates.ts` harvest-relative windows | `harvestDas = max(das_max)` of the graph — for a crop whose graph declares a POST_HARVEST stage (sugarcane: 365–380) the "stop irrigation 15 days before harvest" anchor drifted onto post-harvest. | P1 (agronomic correctness) | Anchor = the schedule's own harvest task (baseline derives it from variety duration or the graph); graph end only as fallback. |
| 3 | `src/pages/Schedule.tsx` toast | New i18n key with an English `defaultValue` → English text shown to non-English farmers. | P1 (language-agnostic) | Reuses the existing, already-translated `schedule.farmer_task.translation_pending` (en/hi/mr present). |
| 4 | `llm-candidates.ts` second-opinion prompt | "for India" as a fixed string. | P2 | Jurisdiction passed from resolved inputs (state, region code, country prefix). |
| 5 | `llm-candidates.ts` phase description in the prompt | "flowering-stage", "grain moisture", "threshing" — cereal-flavoured phrasing in an otherwise generic phase ladder. | P3 | Reworded to crop-neutral terms (reproductive-stage, the crop's own harvest indicator, primary processing). |

## What was scanned and found clean
- `index.ts`, `evidence-pack.ts`, `validate-schedule.ts`, `narrate-pending.ts`, both migrations: no crop / product / stage / dose literal.
- `narrate.ts`: only `en` as the source-language branch and 13 Unicode script ranges — script detection is language-agnostic by construction.
- `baseline-generator.ts` (one line changed by this bundle): the pre-existing transplant-clock logic keys off DB `clock_reference` values; a stage-code suffix fallback (`_NURSERY` / `_TRANSPLANTING`) exists from an earlier version — a naming-convention dependence, not agronomy; noted, unchanged.
- Farmer-facing template strings ("Only if:", "Apply:", "Why:", "Wait N days…", "Equivalent product quantity:") are English **source** text like every DB rule's `action_text`, rewritten by narration with numeric-fidelity and script gates — the repo's established language design.

## Why the remaining constants are not agronomy
`PRE_SEASON_MAX_DAYS = 60` (structural bound; the graph's own `das_min` governs when declared), `MAX_PROPOSALS = 60`, chunk sizes, timeouts, `DOSE_UNITS` (unit spellings), `CHEMICAL_KINDS` / `DOSED_KINDS` (input taxonomy), `PHASES` / `CLOCKS` (calendar taxonomy), `DOMAIN_TASK_TYPE` (maps to the DB CHECK enumeration), priority/weather-dependence heuristics (structural: applications are weather-sensitive). None chooses a crop, a product, a dose, a stage name or a language.

## Crop-agnostic by construction — checked
Stage graph, clocks, negative-day admission, cycles (plant/ratoon), fertilizer/irrigation/rules, regulatory status, product equivalents, variety duration — every one read from the DB per crop; the model is asked only for domains the DB left empty and only in a structured shape gated by the same tables.

## Language-agnostic by construction — checked
Farmer language enters only as a parameter (`generation_language`); narration verifies by Unicode script share for all 13 declared languages; the app renders untranslated tasks with localized stage labels and an already-translated pending message.
