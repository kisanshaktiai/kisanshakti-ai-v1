## Forensic Audit — Observation Labels + Post-Selection Decision-Rule Flow

### 1. What I verified against the live DB

**`observation_translations` schema and content**
- Columns: `observation_code, language_code, display_text, description_text, crop_code`.
- Row counts: `en=1287`, `hi=1929`, `mr=1929`. ≥99% have non-empty `description_text` longer than `display_text`.
- All `observation_code` values are stored **lowercase snake_case** (e.g. `rice_lodging`, `chilli_obs_aphid`, `rice_hispa_scraping`). 0 uppercase rows.
- Real field semantics (sampled in mr):

  | code | `display_text` (chip-ready short label) | `description_text` (agronomic note / tooltip) |
  |---|---|---|
  | `rice_lodging` | भात कोलमडले | वारा/पावसानंतर रोप तळाशी झुकले — जास्त नायट्रोजन व कमजोर खोडे |
  | `chilli_obs_aphid` | मिरची मावा | कोवळ्या शेंड्यांवर माव्याच्या वसाहती; मधुस्राव व काळी काजळी, **CMV विषाणूचा वाहक** |
  | `chilli_obs_damping_off` | मिरची रोप गलन (आर्द्र गलन) | नर्सरीत … जमिनीच्या पातळीवर कुजून पडते — **Pythium + Rhizoctonia** |
  | `rice_hispa_scraping` | भात हिस्पा (खरडलेले पट्टे) | पानांवर पांढरे समांतर खरडलेले पट्टे — **Dicladispa armigera** |

  **Conclusion**: `display_text` IS the farmer-friendly chip label. `description_text` is a longer agronomic explanation that frequently contains Latin pathogen names, virus IDs, pesticide hints — appropriate for a tooltip/help line, never for a chip.

**`decision_rules` matching contract**
- Authoritative match field: `conditions_json.observations[]`, also stored **lowercase snake_case** (e.g. `["bph_hopper_burn"]`, `["wbph_infestation"]`).
- `agents/layered-rule-evaluator.ts` (lines 961, 991, 1298, 1388) normalizes BOTH the rule's observations AND the incoming `state.visual_symptoms` via `toUpperCase().replace(/[\s-]/g,'_')` before comparison. So as long as the symbol *reaches* the evaluator, case is not the problem.

**Selection path (frontend → backend → rule engine)**
- Frontend sends: `"<label> [obs_keys:OBSERVATION_KEY]"` (uppercased key).
- `index.ts` extracts via `/\[obs_keys:([^\]]+)\]/`; falls back to `pending_clarification_options_structured[idx].observation_key` then to legacy parallel arrays (lines 1839–1879).
- `orchestrator.ts` `OPTION_SELECTED` (lines 2189–2215) injects the resolved key into `state.visual_symptoms`, `confirmed_observations`, `known_observations`, and `primary_symptom`, then runs `evaluateRulesLayered`. **This pipeline is sound on paper.** The fallback responses observed in the last logs are coming from a different turn (first message, `symptoms=0` before any selection — not a post-selection turn).

### 2. The real bugs (two, both presentation-layer / lookup-layer)

#### BUG A — Inverted `display_text` ↔ `description_text` swap (5 sites)

A "prefer the longer text as farmer-friendly" heuristic was bolted on top of the loaders. Because `description_text` is almost always longer than `display_text`, the branch fires on ~99% of rows and chips render as full sentences containing Latin names — exactly the "wrong wording, not practical farming" the user is reporting.

```ts
const hasGoodDescription = description_text &&
  description_text.length > 10 &&
  description_text.length > (display_text?.length || 0);
// then: pick description_text as the chip label
```

Sites:
- `supabase/functions/ai-agriculture-chat/i18n/observation-label-loader.ts` (`loadObservationLabels`).
- `supabase/functions/ai-agriculture-chat/i18n/translation-loader.ts` (`initializeTranslationCache` SOURCE 1).
- `supabase/functions/ai-agriculture-chat/agents/diagnostic-options-i18n.ts` (~L146).
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (~L715, inside `translateClarificationOptions`).
- `supabase/functions/ai-agriculture-chat/runtime/clarification-contract.ts` — already correct (`display_text || description_text`); keep as-is.

#### BUG B — Case-sensitive lookup against a lowercase table, then LLM "translation" fills the void

`agents/orchestrator.ts:705-712` inside `translateClarificationOptions`:
```ts
const { data } = await supabaseClient
  .from('observation_translations')
  .select('observation_code, display_text, description_text')
  .in('observation_code', codesToLookup)   // ← UPPERCASED codes
  .eq('language_code', lang);
```
DB stores `observation_code` only in lowercase, so `.in()` returns **0 rows**. The function then falls through to its **GPT-4o-mini "translate these codes to rural language" path** (~L737), which hallucinates farmer wording for codes like `EMERGENCE_FAILURE`, `MUD_TUBES_PRESENT`, `WBPH_INFESTATION`. That's the "LLM is translating in realtime" effect the user noticed — and it produces inconsistent, non-practical phrasing every turn.

The same case-sensitivity exists in `diagnostic-options-i18n.ts:138`. `observation-label-loader.ts` already queries both cases (correct), and `clarification-contract.ts` normalizes to lowercase end-to-end (correct).

### 3. Out-of-scope (verified working, do not touch)

- LLM narration of the **response body** via `forceTranslate` — correct by design.
- `OPTION_SELECTED` injection of `visual_symptoms` / `confirmed_observations` / `primary_symptom` into the rule engine — correct.
- Case normalization inside `layered-rule-evaluator.ts` — correct.
- `runtime/clarification-contract.ts` label resolution — correct.
- No DB schema migration needed; data is sound.

### 4. Fix Plan

**Goal**: chips always render the short, farmer-friendly `display_text` in the requested language, sourced deterministically from the DB; `description_text` is exposed only as a secondary tooltip line. The LLM "translate codes" fallback is disabled because it is the source of wrong wording.

1. **Invert the heuristic in all 4 broken sites** so the chip label is the simple priority chain `display_text → description_text → formatted code fallback`. Files:
   - `i18n/observation-label-loader.ts`
   - `i18n/translation-loader.ts`
   - `agents/diagnostic-options-i18n.ts`
   - `agents/orchestrator.ts` (inside `translateClarificationOptions`)

2. **Make `observation_translations` lookups case-insensitive everywhere.** In `orchestrator.ts` `translateClarificationOptions` and `diagnostic-options-i18n.ts`, query with both cases (or normalize codes to lowercase before `.in()`), then case-fold on the read side to map back. This is the proven pattern already used in `i18n/observation-label-loader.ts`.

3. **Disable the GPT-4o-mini "translate codes" fallback** inside `orchestrator.ts.translateClarificationOptions`. Replace with a deterministic chain:
   1. Lowercase the code, look up in `observation_translations` for the requested language.
   2. Fall back to English row.
   3. Fall back to a language-aware code-formatter that DOES NOT title-case for non-English (already implemented in `observation-label-loader.formatCodeAsLabel`).
   When nothing matches, log a `[OBS_LABEL_GAP]` warning so missing rows can be seeded later — never invent wording at runtime.

4. **Preserve dual output for UI**. Keep returning both `display_text` (chip) and `description_text` (secondary detail) in `ObservationLabel` and through `translateClarificationOptions` so the frontend can render the long form as a tooltip/sub-label without truncation.

5. **Add a strip-Latin safety net** for any path that still surfaces `description_text` as a chip label (defensive only): remove `— LatinName`, `(Latin Name)`, and trailing `;`-separated technical clauses before display. This protects against future loader regressions.

6. **Post-selection invariant assertion (no behavior change, log only)**: in `orchestrator.ts` `OPTION_SELECTED`, after building `stateWithQuery`, log `[SELECTION_TRACE] resolved_key=<key> visual_symptoms=<n> primary_symptom=<x>`. This makes the next "fallback after selection" report trivially attributable to a missing key vs. a missing rule.

### 5. Verification

- Repro the failing mr session "या शेतातील पिक अजून उगवले नाही" and select one option.
- Confirm chip text matches `observation_translations.display_text` row-for-row (e.g. `भात कोलमडले`, `मिरची मावा`) and NOT a long sentence with Latin/virus names.
- Confirm `[SELECTION_TRACE]` log shows the chosen key and a non-zero `visual_symptoms` count.
- Confirm `evaluateRulesLayered` matches the expected rule (e.g. for rice germination → `RICE_GERMINATION_DIAGNOSTIC_001`) and produces a structured response, not a unified-gate fallback.
- Confirm the GPT-4o-mini "translate codes" call no longer appears in edge logs.
