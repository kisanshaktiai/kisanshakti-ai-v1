## You are right — we were diverting the decision brain. New plan.

### What I re-verified in the DB (live counts)

| Table | Rows | Status |
|---|---|---|
| `observation_master` | **2,532** | crop-wise SSOT, complete |
| `observation_translations` | **5,130** (en 1,282 / hi 1,924 / mr 1,924) | rich `display_text` + `description_text` per (obs, lang, crop) |
| `observation_aliases` | 431 | usable |
| `intent_observation_mapping` | **13,446** | obs → intent linkage, complete |
| `observation_intent_master` | 89 | intent metadata |
| `intent_translations` | **249** | has `display_text` AND `question_text` per (intent, language) |
| `hypothesis_master` | 345 | complete |
| `decision_rules` | 1,848 | complete |
| `crop_vocabulary` | 1,480 | complete |
| `observation_differential_questions` | **3** (effectively empty) |  ← the wrong table I tried to seed |

The agronomic knowledge is **already in the brain**. The bug is that `safety-gates.diffQuestionForSymptom` was wired to the **wrong** (almost empty) table while the real localized clarification text already exists in `observation_translations` + `intent_translations`.

### Root cause (corrected)

```text
symptom_keys → safety-gates → diffQuestionForSymptom(observation_differential_questions)
                                                     ↑
                                          near-empty table, returns null
                                                     ↓
                            clarification leaked English template "{symptom}"
                                                     ↓
                                  LLM translated "symptom" → Marathi "लक्षण"
```

The decision-brain workflow already has everything needed; safety-gates just wasn't asking the right tables.

### New plan — reuse existing SSOT, no seeding

#### A. Code-only fix (3 files)

1. **`supabase/functions/ai-agriculture-chat/services/observation-question-resolver.ts` (new, ~80 lines)**
   - Single helper `resolveObservationQuestion(observation_code, language, crop_code)` that returns localized question text **derived from existing tables**, in this fallback order:
     1. `observation_translations.description_text` for `(observation_code, language, crop_code=cropUp)`
     2. `observation_translations.description_text` for `(observation_code, language, crop_code='ALL')`
     3. `observation_translations.display_text` for same
     4. Via `intent_observation_mapping(observation_code) → intent_code` → `intent_translations.question_text` for `(intent_code, language)`
     5. Return `null` (caller falls through to stage advisory — already implemented)
   - 5-min in-memory cache keyed `${obs}|${lang}|${crop}`.
   - No template strings, no `{symptom}` placeholders, no LLM call.

2. **`supabase/functions/ai-agriculture-chat/decision/safety-gates.ts`**
   - `SafetyGateInput.differential_questions` stays as the prebuilt lookup map.
   - `diffQuestionForSymptom` is unchanged (already strict-null) — only the **producer** of the lookup map changes.

3. **`supabase/functions/ai-agriculture-chat/index.ts` (~lines 1566-1592)**
   - Replace the `observation_differential_questions` query with a single batched call to the new resolver for `mergedSymptomKeys × detectedLanguage × finalCropName`.
   - Same `diffLookup: Record<string, string>` shape feeds safety-gates — zero downstream changes.

#### B. Migration cleanup (1 small migration)

- Mark `public.observation_differential_questions` as deprecated via a `COMMENT ON TABLE` only.
  No drop (preserves the 3 historical rows). No data inserts. No schema break.

#### C. Verification (no new tests required, but recommended)

- Manual replay of the failing Marathi turn that produced `"लक्ण"` → expect a clean clarification built from `observation_translations.description_text` (e.g. `पाने पिवळी होत आहेत` for `YELLOWING_LEAVES`).
- Log line `[ObsQuestionResolver] hit source=obs_translations|intent_translations|null` for every resolve so we can audit coverage from edge-function logs.

### What is explicitly OUT of scope (no longer doing)

- ❌ Seeding `observation_differential_questions` (~1,200 rows) — the data already exists in `observation_translations`.
- ❌ Seeding `observation_intent_master` (~2,400 rows) — `intent_observation_mapping` already has 13,446 rows.
- ❌ Seeding `observation_aliases` / `intent_translations` — existing 431 + 249 rows cover the active vocab.
- ❌ Removing hardcoded vernacular dictionaries in this turn — that's a separate concern unrelated to the "wrong answer" RCA.
- ❌ Any change to orchestrator routing, hypothesis-evaluator, decision_rules execution, or LLM-gateway prompts.

### Decision-brain workflow stays intact

```text
intent_master → intent_observation_mapping → observation_master
       │                                            │
       └──── intent_translations ────────┐          └──── observation_translations (SSOT for labels + clarifying text)
                                          │
                                          ▼
                                  resolveObservationQuestion()
                                          ▼
                              safety-gates differential_questions lookup
                                          ▼
                                  CLARIFY (real text) | NONE
```

No new tables, no new seed data, no diverted flow. Just point safety-gates at the SSOT that's already there.

**Approve to implement A + B, or tell me to adjust the fallback order in step A.**