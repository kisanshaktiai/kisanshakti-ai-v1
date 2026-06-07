## Goal
Eliminate hardcoded keyword/template fragments that confuse the symbolic decision brain, route every lookup through the existing master tables, and fill the genuine data gaps as an agronomist so the brain reaches a confident DB-only answer.

## Root-cause findings (from code + DB + chat audit)

The last 6 user turns kept returning the literal token `"लक्षण"`/`"symptom"` even though the previous fix to `safety-gates.ts` is in place. The audit shows three real causes, not one:

1. **`observation_differential_questions` is empty (3 rows total, 1 observation).**
   `safety-gates.diffQuestionForSymptom()` therefore always falls through to the English template
   `The symptom "${symptom}" you reported on ...` (line 118). When the LLM narration layer translates that
   verbatim into Marathi, the unquoted variable name `symptom` becomes the literal word `"लक्षण"`. The table is the
   designed SSOT — it just has no data.

2. **Hardcoded Marathi/Hindi keyword lists for parts, crops, diagnoses and clarifications still exist** in:
   - `agents/observation-extractor.ts` (पाने/पान → leaf map, ~25 entries)
   - `agents/language-induction-layer.ts` (affected-part symbol map, ~30 entries)
   - `agents/raw-observation-contract.ts` (part keyword array)
   - `agents/language-normalizer.ts` (crop/part token list)
   - `decision/clarification-validator.ts` (`DIAGNOSIS_KEYWORDS_MR/HI`)
   - `agents/clarification-strategy.ts` (lines 718-719 hardcoded clarification templates)
   - `agents/communication-generator.ts` (lines 484-485 hardcoded monitoring bullets)
   - `decision/diagnostic-signal-detector.ts`, `decision/diagnostic-escalation-generator.ts`, `decision/explanation-chain-builder.ts` (mr/hi template strings)
   These short-circuit DB lookups against `observation_aliases` (431), `observation_translations` (5 130),
   `crop_vocabulary` (1 480), `intent_translations` (249) and cause status questions to be misclassified as diagnostic.

3. **`observation_intent_master` covers only 89 of 2 532 observations.**
   The router cannot map most observations to an intent, so the orchestrator falls into a generic CLARIFY lane that re-enters the broken template path in #1.

## Scope (this plan)

A. **Code – remove hardcoded shortcuts, route through DB tables**
   1. `agents/observation-extractor.ts` – replace the inline part dictionary with a lookup on `observation_aliases` + `observation_translations` (cached per-language at module load, same pattern as `crop-synonyms-cache.ts`).
   2. `agents/language-induction-layer.ts` – delete the `'पान': CanonicalAffectedPartSymbol.LEAF` map; resolve via the same alias cache plus `observation_master.affected_part`.
   3. `agents/raw-observation-contract.ts` – drop the keyword array; read parts from `observation_master`.
   4. `agents/language-normalizer.ts` – drop the crop/part token list; reuse `crop-synonyms-cache` + alias cache.
   5. `decision/clarification-validator.ts` – replace `DIAGNOSIS_KEYWORDS_MR/HI` with a lookup on `intent_translations` for the `DIAGNOSIS`/`PEST_DISEASE` intent codes.
   6. `agents/clarification-strategy.ts` – delete the inline mr/hi templates; require the caller to provide a row from `observation_differential_questions` (no fallback prose).
   7. `agents/communication-generator.ts`, `decision/diagnostic-signal-detector.ts`, `decision/diagnostic-escalation-generator.ts`, `decision/explanation-chain-builder.ts` – swap the embedded mr/hi/en strings for translations sourced from `intent_translations` / `observation_translations`. Keep punctuation only.
   8. `decision/safety-gates.ts` – make `diffQuestionForSymptom` strict: if no DB row exists, return `null` and let the orchestrator emit a deterministic stage-aware safe message instead of the English `"symptom"` template (kill the leak at the source). Also add a guard: skip CLARIFY entirely if the resolved symptom code is not present in `observation_master` (prevents a junk token from a status query from triggering the gate).
   9. Add a `services/observation-alias-cache.ts` helper (single SSOT) used by all of the above; mirrors the existing `crop-synonyms-cache.ts` design (5-minute TTL, lazy load, no per-request DB hits).

B. **Database – fill the genuine data gaps**
   1. **Seed `observation_differential_questions`** with `{observation_code, crop_code, language, question_text}` rows for the top symptoms the brain actually fires. Cover {en, mr, hi} × the symptom codes that appear in `decision_rules.observation_codes` (≈ 1 800 rules) for the live crops (sugarcane, wheat, cotton, rice, soybean, tur, maize). I will hand-author each Marathi/Hindi question as the senior agronomist — no machine translation — so every entry is field-accurate and farmer-friendly.
   2. **Seed `observation_intent_master`** with the missing observation→intent links. Today 89 / 2 532 observations are mapped; the rest fall through. I will map every observation code referenced by an active `decision_rules` row to the correct intent (`DIAGNOSIS`, `MONITORING`, `NUTRITION`, `IRRIGATION`, `STAGE_INFO`, etc.) and confidence_rank.
   3. **Seed `observation_aliases`** for the Marathi/Hindi/Romanized words currently hardcoded in code (पान/पाने/पानावर, खोड, मूळ, फूल, फळ, कणीस, बोंड etc.) so the new alias-cache path resolves them without code changes.
   4. **Seed `intent_translations`** for the diagnosis/monitoring/status intents in mr + hi (used by step A.5).
   All seed inserts go through the data-insert tool (not migrations) since these are data rows, and each will use `ON CONFLICT (...) DO UPDATE` so the run is idempotent.

C. **Verification**
   1. Add `tests/chat/hardcoded-leak-guard.test.ts`: replay the four failing turns from `ai_chat_messages` (status query in Marathi, "what new crop?" in Marathi, etc.) against the orchestrator with a stubbed Supabase that mirrors the real tables; assert that no `{symptom}` / `"लक्षण"` token survives and that `confidence ≥ 0.6`.
   2. Re-run the audit query on `ai_chat_messages` after deploy and confirm zero rows in the last hour contain the placeholder regex.

## Out of scope
- Orchestrator routing logic, confidence model, LLM gateway, UI, NDVI/soil pipelines, proactive engine. They are working correctly once the hardcoded shortcuts and missing rows are fixed.

## Technical notes
- The new alias cache uses `select observation_code, language, alias, affected_part from observation_aliases` joined with `observation_translations` and is keyed by `${language}:${normalised_token}`. Same TTL (5 min) and same `Map<string, …>` shape as `crop-synonyms-cache.ts` so memory + cold-start behave identically.
- `safety-gates.runSafetyGates` becomes `async` only for the `diffQuestionForSymptom` lookup; all callers already `await` it.
- Seed counts (estimate): ≈ 1 200 rows in `observation_differential_questions`, ≈ 2 400 rows in `observation_intent_master`, ≈ 350 rows in `observation_aliases`, ≈ 60 rows in `intent_translations`. All idempotent.

## Deliverables
- 9 edited TS files + 1 new cache module under `supabase/functions/ai-agriculture-chat/`.
- 4 data-insert migrations (one per table) authored as the agronomist SSOT.
- 1 regression test file.
- A short memory note under `mem://architecture/` recording the "no hardcoded language tokens — DB tables are SSOT" contract so future edits cannot reintroduce them.
