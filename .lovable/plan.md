
# Observation Knowledge Layer — Scientific Audit & Remediation

## Confirmed current state (verified by live DB reads this turn)

Farmer-visible clarification chain:

```text
hypothesis_conditions (condition_type='OBSERVATION', code in condition_key)
        ↓
observation_master (2549)   — gate: is_active / is_farmer_observable / can_generate_question
        ↓  960 codes pass the gate
observation_translations    — the only label source (display_text → description_text → en)
        ↓
system_config               — photo option label (observation_key = photo_upload)
```

Measured defects:

| Finding | Measured |
|---|---|
| Active hypotheses with ≥1 farmer-observable observation condition | **62 of 344** (282 can never be discriminated by a clarification card) |
| OBSERVATION condition codes not present in `observation_master` | **33 of 274** distinct codes |
| Duplicate labels (same text, different observation codes) among UI-eligible codes | **72 groups** (e.g. `low_tillering`/`poor_tillering`/`sparse_shoots` → all "कमी फुटवे") |
| Label coverage of the 960 UI-eligible codes | mr 960/960, hi 960/960, **en 731/960** |
| Labels that name a CAUSE, not a symptom (memory rule violation) | mr 54, en 15, hi 4 |
| `observation_differential_questions` | 3 rows, 1 observation, **never read by any edge function** |
| `clarification_fallback_questions` | 8 rows, column-per-language schema — **user decision: retire** |

## Track A — Retire `clarification_fallback_questions`

1. Remove the fallback readers in `runtime/clarification-contract.ts` (`loadFallbackQuestions` + `DIAGNOSIS_GENERIC` second query) and `runtime/observation-selector-contract.ts` (`intent_family` resolution + rescue loader).
2. Replace the rescue path with an `observation_master` + `observation_translations` query scoped by `observation_intent_master.allowed_observation_groups` / `canonical_group`, so the safety net stays DB-driven and single-schema.
3. When no DB-backed option exists, emit `[CLARIFICATION_NO_DB_OPTIONS]` and fall through to the photo option only — never a synthesised string.
4. Migration: drop `public.clarification_fallback_questions` only after the code no longer references it.

## Track B — hypothesis → observation coverage (agronomic gap closure)

1. Produce a coverage report per crop group: hypothesis_id, cause name, condition codes, which are UI-eligible and why the others fail (inactive / not farmer-observable / `can_generate_question=false` / missing from master).
2. Fix the **33 orphan codes** — each is either a typo of an existing code (repoint condition) or a genuinely missing observation (seed into `observation_master` + translations with correct `canonical_group`, `affected_plant_part`, `semantic_class`, discriminator/clarity scores).
3. For hypotheses whose only conditions are non-observable (lab/instrument facts), add at least one pathognomonic **farmer-observable discriminator** condition, weighted, so competition can resolve them in the field.
4. Invariant: any active hypothesis with zero UI-eligible discriminator logs `[HYPOTHESIS_UNDISCRIMINABLE]` at graph boot.

## Track C — Agronomic quality of the 960 farmer-visible labels

Review criteria, applied per label (mr/hi/en):
- **Symptom, not cause** — clear the 54 mr / 15 en / 4 hi cause-leaking labels (no "कमतरता", "रोग", "विषाणू", "deficiency", "blight", "borer" in a symptom label). Cause belongs to `hypothesis_master.cause_name_*`.
- **Field-verifiable** — the farmer must be able to confirm it by looking, without instruments.
- **Plant-part + pattern explicit** — "old lower leaves", "leaf tip", "whole field patches".
- **Rural register** — vernacular farming terms, no ICAR jargon, no ALL_CAPS codes.
- Corrections applied as data updates to `observation_translations` (never TS).

## Track D — Language + duplication integrity

1. Resolve the **72 duplicate-label groups**: either merge the codes (repoint `hypothesis_conditions`, `intent_observation_mapping`, `observation_aliases` to a survivor and deactivate the duplicate) or differentiate the labels so two options on the same card are never textually identical.
2. Backfill the **229 missing English labels** so the en fallback tier is complete.
3. Add a runtime invariant `[CLARIFICATION_LABEL_COLLISION]` when a single card carries two identical display texts.
4. Add a DB-side integrity view listing: UI-eligible codes missing any of en/hi/mr, and duplicate `(language_code, display_text)` pairs — so curators can self-serve after this cycle.

## Execution order

1. Track A (code + drop migration) — removes the competing schema first.
2. Track B step 2 (orphan codes) — unblocks graph resolution.
3. Track D steps 1–2 (dedup + en backfill) — data only.
4. Track C label rewrite pass — data only, agronomist-reviewed batches per crop group.
5. Track B steps 3–4 + Track D step 3 invariants last.

## Technical notes

- No agronomy enters TypeScript at any step; all label/condition changes are `INSERT`/`UPDATE` on `observation_master`, `observation_translations`, `hypothesis_conditions`.
- Code edits are limited to: `runtime/clarification-contract.ts`, `runtime/observation-selector-contract.ts`, `decision/hypothesis-clarification-builder.ts` (invariants only), plus one schema migration to drop the retired table.
- Every touched file under `supabase/functions/ai-agriculture-chat/**` gets its CHANGE LOG block updated.
- `observation_differential_questions` is left in place, unread, pending a separate decision — flagged, not touched.
