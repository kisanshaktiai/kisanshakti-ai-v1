# 18 — Variety Wiring Into AI Chat Symbolic Brain
**Date:** 2026-06-07  
**Status:** ✅ Deployed (`ai-agriculture-chat`)  
**Closes blocker:** B1 (from `17-production-readiness-audit.md`)

## What changed

Variety profile is now resolved during land-context fetch and propagated end-to-end through the chat decision pipeline.

| Layer | File | Change |
|---|---|---|
| Shared loader | `supabase/functions/_shared/variety-context.ts` | Fixed `variety_resistance` SELECT — was querying non-existent `pathogen, level` columns; now uses real `threat_name, threat_type, resistance_level, notes, observation_code` and maps to the loader's canonical shape. Without this, every variety profile shipped with empty `resistance: []`. |
| Orchestrator | `agents/orchestrator.ts` | Imports `loadVarietyProfile`. After building `context`, resolves variety from `lands.current_crop_variety_id` (or `variety_id`) and `cropSchedule.crop_variety`, attaches `context.variety_profile`, logs the resolution. Silent null when no variety is seeded — preserves backward compatibility with the 89 crops still without varieties. |
| Canonical Context | `decision/canonical-context-contract.ts` | Added immutable `variety` field to `CanonicalContext` interface (frozen snapshot: id, name, code, maturity window, resistance list, state_match, source). Builder reads `landContext.variety_profile` and freezes it into the locked context. |
| LLM Formatter | `agents/llm-response-formatter.ts` | Extended `LLMFormatterInput.land_context` with optional `variety_profile`. Imports `formatVarietyProfileForPrompt` and injects the authoritative VARIETY PROFILE block into the recommendation prompt — directly after `LAND CONTEXT`, before `RULE ENGINE RECOMMENDATIONS`. |
| Index handler | `supabase/functions/ai-agriculture-chat/index.ts` | No change required — already passes the full `landContext` object into `formatterInput.land_context`, so `variety_profile` flows automatically. |

## Data flow (after)

```
lands.current_crop_variety_id ─┐
crop_schedules.crop_variety ───┤
lands.state ───────────────────┤──► loadVarietyProfile()
                               │       ├─► master_products (seed row)
                               │       └─► variety_resistance (R/HR/MS/S rows)
                               ▼
                       landContext.variety_profile
                               │
                               ├─► buildCanonicalContext() ──► CanonicalContext.variety  (frozen, locked)
                               │
                               └─► formatterInput.land_context.variety_profile
                                       └─► formatVarietyProfileForPrompt()
                                               └─► LLM prompt VARIETY PROFILE block
                                                       • maturity window OVERRIDES crop defaults
                                                       • skip preventive sprays on R/HR pathogens
                                                       • flag S/MS pathogens for targeted prevention
                                                       • state-fit warning when state_match=false
```

## Symbolic brain integration

`CanonicalContext.variety.resistance[].observation_code` is now available to every consumer of canonical context. Future symbolic-engine evaluators can:

```ts
const resistanceMap = new Map(
  canonicalContext.variety?.resistance.map(r => [r.observation_code, r.level]) ?? []
);
// During hypothesis arbitration:
if (['R','HR'].includes(resistanceMap.get(hypothesis.observation_code) ?? '')) {
  hypothesis.confidence *= 0.4;            // downweight
  hypothesis.warnings.push('VARIETY_RESISTANT');
}
```

This wire is exposed but **not yet enforced** inside `layered-rule-evaluator.ts` — that is tracked as blocker B5 (resistance-aware confidence gating) and will land in a follow-up change once we add per-hypothesis observation_code tags to the rule output schema.

## Validation

1. **Edge function deployed** — `ai-agriculture-chat` ✅
2. **Confidence regression tests** — 14/14 still passing (`tests/chat/confidence-pipeline.test.ts`).
3. **Backward compatibility** — When `lands.current_crop_variety_id` is null AND `crop_schedules.crop_variety` is empty (the current state for 39/40 lands), `loadVarietyProfile` returns null, `variety_profile` is omitted, and the prompt skips the variety block. No behavior change for unseeded crops.
4. **Live trace gate** — Next chat turn with a land that has `current_crop_variety_id` set will log:
   ```
   🌱 [Variety] Attached profile: <name> (source=exact, state_match=true, resistance_rows=N)
   ✅ [CanonicalContext] Built and LOCKED ...
      Variety=<name> [code] maturity=X-Yd resistance=N state_match=true
   ```

## Cross-crop coverage delta

| Metric | Before | After |
|---|---|---|
| Crops where chat can reason with variety | 0 / 112 | **23 / 112** (all crops with at least one seeded variety) |
| Variety resistance rows actually loaded per profile | 0 (broken SELECT) | **up to 150 rows / 98 varieties** |
| Variety facts narrated to farmer | none | maturity window, yield potential, seed rate, spacing, season, state suitability, full R/HR/MS/S resistance table, availability + state-fit warnings |

## Follow-up (still open)

- **B5** — Make the rule evaluator enforce variety resistance (downweight, not just narrate).
- **B3** — Persist `variety_id` into `crop_schedules` writes (currently 0/28).
- Seed varieties for the remaining 89 crops in `master_products`.
- Add a unit test that constructs a fake landContext with `variety_profile` and asserts the prompt includes the VARIETY PROFILE block.
