

# Plan: Scale ai-agriculture-chat for 1M+ Farmers

## Problem

The `ai-agriculture-chat` edge function is ~84,000 lines across ~140 files. While it currently deploys, it's fragile and at risk of hitting the 20MB bundle limit as more rules/crops are added. You have 23 of 500 allowed edge functions — plenty of headroom.

## Strategy: Internal Router Architecture (No New Edge Functions Needed)

Instead of splitting into multiple edge functions, we use **code-level modularization** within the single function to reduce what gets loaded per request. This is the Supabase-recommended pattern.

However, the immediate win is **dead code removal** — there are still ~12 completely unused files that are getting bundled.

## Phase 1: Delete Dead Files (~5,500 lines)

These files have **zero imports** from any other file in the function:

| File | Lines | Reason |
|------|-------|--------|
| `validation/field-test-cases.ts` | 1,130 | Only imported by `dimension-validators.ts` which is only imported by `validation/index.ts` which is imported by **nothing** |
| `validation/dimension-validators.ts` | 1,059 | Same — validation island |
| `validation/validation-runner.ts` | 415 | Same — validation island |
| `validation/validation-types.ts` | ~100 | Same — validation island |
| `validation/index.ts` | ~30 | Same — barrel for unused validation |
| `decision/symbolic-brain-metrics.ts` | 394 | Zero imports |
| `decision/positive-diagnosis-generator.ts` | 304 | Zero imports |
| `decision/clarification-reentry-controller.ts` | 516 | Zero imports |
| `decision/agronomic-observation-validator.ts` | 519 | Zero imports |
| `decision/ui-selection-contract.ts` | 344 | Zero imports |
| `decision/diagnostic-weight-registry.ts` | 246 | Zero imports |
| `photo/photo-observation-mapper.ts` | ~200 | Zero imports (photo-analyzer IS used, this mapper is not) |
| `context-helpers.ts` | ~70 | Zero imports |

**Total: ~5,327 lines removed**

## Phase 2: Slim the Deprecated Modules (~1,200 lines)

**`language-induction-layer.ts` (749 lines)**: Only the enum definitions are imported. The 500+ lines of keyword dictionaries (MARATHI_SYMPTOM_MAP, HINDI_SYMPTOM_MAP, etc.) are dead weight. Extract only the enum types into a small `symptom-enums.ts` (~100 lines), delete the rest. Update 2 importers.

## Phase 3: Move Hardcoded Dictionaries to DB (~1,250 lines saved)

**`communication-translation-dictionary.ts` (963 lines)**: Contains ~900 lines of hardcoded MR/HI/EN translations. These should be migrated to the `observation_translations` DB table, then the file reduced to thin DB-lookup wrappers (~100 lines). This is also an SSOT compliance fix.

**`rural-language-dictionary.ts` (291 lines)**: Same pattern — hardcoded term mappings that should live in DB.

## Phase 4: Production Scaling Architecture

For 1M+ farmers, the **real bottleneck is not bundle size but cold start time and concurrent invocations**. The plan:

1. **Supabase Pro plan** supports 500 edge functions and 2M invocations/month included
2. **Current 23 functions** leaves 477 slots — no limit issue
3. **Cold start optimization**: The caching system (5-min rule cache, 15-min registry cache) already handles warm instances well
4. **Concurrent request handling**: Supabase auto-scales edge function instances horizontally — each farmer gets their own isolate

### What actually matters at 1M scale:
- **Database connection pooling** (already handled by Supabase)
- **LLM API rate limits** (the real bottleneck — Gemini/OpenAI quotas)
- **Rule cache efficiency** (already implemented with loading-promise locks)
- **Response time < 10s** (currently ~3-5s warm, ~8-12s cold)

## Summary of Impact

| Metric | Current | After Phase 1-3 |
|--------|---------|-----------------|
| Files | ~140 | ~125 |
| Lines | ~84,000 | ~76,000 |
| Hardcoded dictionaries | 3 files (~2,000 lines) | 0 (moved to DB) |
| Dead validation suite | 5 files (~2,700 lines) | 0 |
| Dead decision modules | 7 files (~2,600 lines) | 0 |
| Bundle stability | Fragile | Safe margin |

## Files to Modify

**Delete (Phase 1):**
- `validation/` entire directory (5 files)
- `decision/symbolic-brain-metrics.ts`
- `decision/positive-diagnosis-generator.ts`
- `decision/clarification-reentry-controller.ts`
- `decision/agronomic-observation-validator.ts`
- `decision/ui-selection-contract.ts`
- `decision/diagnostic-weight-registry.ts`
- `photo/photo-observation-mapper.ts`
- `context-helpers.ts`

**Refactor (Phase 2):**
- `agents/language-induction-layer.ts` → extract enums to new `agents/symptom-enums.ts`, delete rest
- Update importers: `orchestrator.ts`, `induction-to-observation-mapper.ts`

**DB Migration (Phase 3):**
- Migrate `communication-translation-dictionary.ts` content to `observation_translations` table
- Migrate `rural-language-dictionary.ts` content to new `rural_term_mappings` table
- Slim both files to DB-lookup wrappers

**Deploy:**
- Redeploy `ai-agriculture-chat` edge function

