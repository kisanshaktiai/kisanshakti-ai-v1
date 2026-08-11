# Forensic Audit — Wrong / English observation options in AI chat

## What the evidence shows

The last farmer-facing clarification stored in `ai_chat_messages` (session language `mr`) was:

```text
🔍 Nitrogen deficiency observed mid-season [obs_keys:RICE_NUTR_N_DEFICIT_001]
🔍 Potassium deficiency — leaf-tip burn + lodging risk [obs_keys:RICE_NUTR_K_DEFICIT_001]
🔍 Iron deficiency in rice (upland/alkaline) [obs_keys:RICE_NUTR_FE_DEFICIT_001]
```

Three independent defects are visible in that one card, all confirmed against the database:

1. **These are not observations.** `RICE_NUTR_N_DEFICIT_001` exists in `decision_rules` (1 row) and does **not** exist in `observation_master` (0 rows). The farmer was asked to confirm *diagnoses* (rule causes), not things he can see in the field. The farmer-observable ontology (1,692 active rows in `observation_master`) was bypassed on this path.

2. **The labels can never be Marathi.** `i18n/translation-loader.ts` (SOURCE 2) loads `decision_rules.i18n_key` and stores **only** `en: action_text/reason_text/cause`, with an explicit comment that "LLM translates at runtime". `diagnosis-first-generator.getCauseLabelFromDB()` asks the cache for the key, gets English, its `hasNativeScript()` check fails, and it falls through to `translateCause()` which returns the same English string. So every rule-derived option is structurally English regardless of the farmer's language.

3. **The i18n cache is silently truncated.** `observation_translations` holds **5,438 rows**; the loader issues `.select(...).limit(5000)` with no pagination, and PostgREST caps a single request at 1,000 rows. Roughly 80% of all translations — including Marathi labels that do exist — are never in the cache. The same bug applies to the `decision_rules` load (`.limit(2000)`, 1,824 keys, capped at 1,000).

Marathi data is **not** the problem: 1,671 of 1,692 farmer-observable observations already have a Marathi `observation_translations` row. The DB is right; the runtime is reading it wrong.

Secondary findings (same class, will be fixed in passing):

- `i18n/observation-label-loader.ts` queries only the requested language — no `en` fallback row and no `universal` crop row — so any per-crop miss degrades to `formatCodeAsLabel()`, i.e. the raw snake_case code shown to the farmer.
- There are four competing label resolvers (`observation-label-loader`, `translation-loader`, `hypothesis-clarification-builder.loadTranslations`, `observation-selector-contract`), each with its own fallback policy. Only `observation-selector-contract` correctly drops an option when no DB label exists.

## Fix plan

### 1. Paginate every translation read (root cause of most gaps)
- `i18n/translation-loader.ts`: replace both single-shot `.limit()` queries with keyset pagination in 1,000-row pages until exhausted; log loaded row count per source and assert it matches the table count.
- `decision/hypothesis-clarification-builder.ts` (`.limit(4000)`) and `runtime/observation-selector-contract.ts`: same pagination helper.

### 2. Farmer-facing options must come from the observation ontology, never from rule causes
- In `diagnosis-first-generator.ts`, each diagnosis's farmer-visible chip must render its `observation_key` label resolved from `observation_translations`, not `cause_label` from the rule. Where a hypothesis has no farmer-observable observation attached, the option is **dropped** (with `[OPTION_DROPPED_NO_OBSERVATION]` trace) rather than falling back to the English cause sentence.
- Keep the rule id in the machine-readable payload (`rule_id` / `observation_key`) only — never inside the display string.

### 3. Single label resolver, fail-closed
- Make `i18n/observation-label-loader.ts` the one resolver: query the farmer language **and** `en` in one call, prefer crop-specific row → crop-agnostic → `en`, and return `null` (option dropped) instead of `formatCodeAsLabel()` when nothing exists. Emit `[OBS_LABEL_MISSING]` with code + language.
- Point `hypothesis-clarification-builder` and `generic-multi-match-detector` at it; delete their private lookups.

### 4. Language regression lock
- Add a check that runs on every clarification exit: if the session language is non-English and any emitted option label contains no native-script character, log `[LANGUAGE_LEAK]` with the code and drop the option; if that empties the card, fall back to the DB rescue path that already exists in `observation-selector-contract.ts`.

### 5. Verify
- Re-run the Marathi rice query (`पिक पिवळे पडले आहे काय करावे`) against the deployed function and confirm the returned options are Devanagari `observation_master` codes with no `[obs_keys:` text and no rule ids in the visible label; confirm `[I18N] Total cache` logs ≈5,438 + 1,824 entries.

## Technical notes

Files touched: `supabase/functions/ai-agriculture-chat/i18n/translation-loader.ts`, `i18n/observation-label-loader.ts`, `decision/diagnosis-first-generator.ts`, `decision/hypothesis-clarification-builder.ts`, `runtime/observation-selector-contract.ts`, `agents/generic-multi-match-detector.ts`. No database migration is required — the translation data already exists. Each edited file gets its mandatory top-of-file CHANGE LOG entry, and the function is redeployed after the change.
