## Root cause (confirmed from DB + code + live logs)

The user-visible bug — "shows direct reason instead of the observation, and it's unclear what the farmer actually selected" — is a **label-swap bug** in the observation label loader, amplified by inconsistent UPPER vs lower_snake_case handling left over from the DB migration to `lower_snake_case`.

### 1. The headline bug — label swap in `i18n/observation-label-loader.ts`

DB row for `obs_soil_crust_formed` (mr):
- `display_text` = "मातीवर कडक थर तयार झाला" ← the OBSERVATION (short, what farmer sees)
- `description_text` = "मुसळधार पावसानंतर…कडक थर — रोपांना वर येण्यास अडथळा. कमी सेंद्रिय पदार्थ असलेल्या मातीत जास्त." ← the CAUSE/REASON (long, why it happens)

Lines 121-133 contain a "smart" swap:
```ts
const hasGoodDescription = translation.description_text &&
  translation.description_text.length > 10 &&
  translation.description_text.length > (translation.display_text?.length || 0);
labelMap.set(upperCode, {
  display_text: hasGoodDescription ? translation.description_text : translation.display_text,
  description_text: hasGoodDescription ? translation.display_text : (translation.description_text || ''),
  ...
});
```
Because `description_text` is always longer than `display_text` in the canonical seed data, the loader hands the **cause** to the UI as the primary label, and the **observation** disappears into a secondary field the UI doesn't render. The live console log (`[ClarificationUI]`) shows this exactly: every option label is the long cause sentence, not the short observation name.

### 2. The case-mismatch trail that the user asked about

DB is now `lower_snake_case` for codes:
- `observation_master.observation_code` → `obs_rice_no_emergence`, `poor_germination`
- `observation_translations.observation_code` → `obs_rice_no_emergence`
- `decision_rules.crop_code` / `crop_group` → `rice`, `sugarcane`
- `hypothesis_conditions.condition_key` → `bph_hopper_burn`

But code keeps force-uppercasing everywhere:
- `bundled-rules/loader.ts`: 228, 240, 251, 253, 261, 757, 836-839, 939, 954, 1008, 1072, 1112, 1208, 1337 — uppercases crop_code, observations, condition keys, observable characteristics.
- `agents/clarification-strategy.ts`: 221-222 uppercases `crop_code`/`growth_stage` in `lockStageForTurn`; 496, 514, 571, 590, 836 uppercase observation_key in dedupe + symbol merge.
- `i18n/observation-label-loader.ts`: 88 uppercases the lookup keys, then 96-99 also tries lowercase as a back-compat hack.

Today the internal pipeline survives because (a) the label loader queries both casings and (b) the rule loader normalises everything to UPPER before matching. But:
- The **merged symbol set returned to the rule engine on the next turn** (`mapClarificationSelectionToSymbols`, line 836) emits whatever case `observation_key` had — usually UPPER from `observation_master`-derived options — which then no longer matches `observation_master.observation_code` (lower) on direct equality checks downstream (e.g., `db-observation-validator`, alias resolution against `observation_aliases.canonical_code` which is lower).
- `observation_aliases.alias_code` is UPPER, `canonical_code` is lower — code uses the alias map as `{ UPPER: [UPPER,...] }` which can't resolve back to the canonical lower form used by `decision_rules` JSONB conditions and by `hypothesis_conditions.condition_key`.

This is the structural drift that makes the symbolic brain occasionally pick the wrong rule / fail to recognise what the farmer selected on follow-up turns.

## Fix (single phase)

### A. Unswap the label loader (immediate user-visible fix)
`supabase/functions/ai-agriculture-chat/i18n/observation-label-loader.ts`
- Remove the `hasGoodDescription` swap. Always:
  - `display_text` ← DB `display_text` (the observation, what farmer sees)
  - `description_text` ← DB `description_text` (the cause/explanation, secondary)
- Keep the dual-case `.in(...)` query for back-compat, but **store the labelMap keyed by canonical lower_snake_case** AND register an UPPER alias entry for legacy callers. Returned `ObservationLabel.observation_code` becomes the canonical lower code.

### B. Canonicalise observation codes to lower_snake_case at the edges
Add `utils/code-normalizer.ts` with:
```ts
export const toCanonicalCode = (s: string) => String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
export const toCanonicalCrop  = (s: string) => String(s ?? '').trim().toLowerCase();
```
Use it in:
- `agents/clarification-strategy.ts`
  - `lockStageForTurn` (221-222): stop uppercasing `crop_code` / `growth_stage`; store canonical lower for crop, keep stage normalisation through `stage-normalizer` (stages remain UPPER as a separate vocabulary — only crop/observation codes change).
  - Dedupe sets (496, 514, 571, 590) use `toCanonicalCode` instead of `.toUpperCase()`.
  - `mapClarificationSelectionToSymbols` (line 836): push `toCanonicalCode(selectedOption.observation_key)` into `mergedSymbols`, so symbols handed back to the rule engine match DB casing.
- `bundled-rules/loader.ts`
  - `normalizeObservableChars` (249-256) and the `observations` / `required_symptoms` matcher (923-960): compare with `toCanonicalCode` on both sides instead of `.toUpperCase()`. Keep stage matching upper (separate vocabulary).
  - Validator log key (line 939-946) uses canonical lower.
  - Observation-alias cache rebuilt as `Record<lower, lower[]>` (see C).

### C. Fix the alias map to be canonical-lower SSOT
Wherever `observation_aliases` is loaded into `cachedObservationAliases`, build the map as:
```
{ [canonical_code_lower]: [alias_code_lower, ...], [alias_code_lower]: [canonical_code_lower] }
```
so expansion works in both directions and always returns lower codes that match `decision_rules` and `hypothesis_conditions`.

### D. Keep stages and severity in UPPER (intentional)
Stages (`GERMINATION`, `NURSERY`, `VEGETATIVE`, …) and severity tokens (`HIGH`, `CRITICAL`, …) are a separate UPPER vocabulary defined by `stage-normalizer` and the safety gates. Do **not** lowercase those — only observation codes, crop codes, crop groups, categories, and condition keys.

### E. Telemetry guard
Add a one-shot warn in `loadObservationLabels` if `display_text.length > description_text.length` on >50% of rows — that's the signal the seed data was inverted again. Useful canary so a future migration doesn't silently re-swap.

## Verification

1. Re-run the same Marathi rice DAS-12 turn from the console log. Expect option labels:
   - "🔍 मातीवर कडक थर तयार झाला" (was: long cause sentence)
   - "🔍 भात अजून उगवले नाही" (was: long cause sentence)
2. Tap the second option → confirm next request body contains `observations: ["obs_rice_no_emergence"]` (lower) and the rule engine fires `RICE_GERMINATION_RESOW_DECISION_001` instead of falling back to clarification.
3. `ai_chat_audit_logs.gate_decisions` for the follow-up turn should show `symbols_merged` with the canonical lower code.
4. Existing tests in `_tests/` still pass — they assert UPPER for stage only, not for observation codes (spot-checked `crop-code-normalizer_test.ts`, `lock_stage_for_turn_test.ts`).

## Files to change

- `supabase/functions/ai-agriculture-chat/i18n/observation-label-loader.ts` — unswap, canonical-lower keys, telemetry.
- `supabase/functions/ai-agriculture-chat/utils/code-normalizer.ts` — new helpers (or extend existing `crop-code-normalizer.ts`).
- `supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts` — canonical-lower for crop_code and observation_key (stages untouched).
- `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` — observation/condition_key matching uses canonical-lower; alias map normalisation.
- (If alias loader lives elsewhere) the one place that builds `cachedObservationAliases` from `observation_aliases`.

## Out of scope (do NOT touch)

- `decision/unified-decision-gate.ts`, `decision/safety-gates.ts`, hypothesis evaluator — already correct after previous patches; they consume whatever symbols the loader/clarifier hand them, so the fix flows through.
- Stage vocabulary, severity vocabulary, intent codes (still UPPER).
- DB schema — no migration needed; this is purely an application-side casing alignment.
