## Bug

User (mr): "या शेतात कोणते नवीन पिक घेवू?" → assistant replies **"Which crop are you asking about?"** (English clarification card).

Edge log + DB evidence (trace `trace_mq3ivhr8_pr830u`, land Khari, farmer Amarsinh):

- Intent classified correctly: `NEXT_CROP_RECOMMENDATION` (100%).
- Phase-3 fix worked: `NO_ACTIVE_CROP guard BYPASSED` ✅.
- Pipeline continued into the diagnostic gates and tripped **G2 CONTEXT_COMPLETENESS** at `orchestrator.ts:5306`, which short-circuits with `CLARIFICATION_QUESTION` whose default prompt is the literal English string `'Which crop are you asking about?'` (`orchestrator.ts:5314`, also `clarification-renderer.ts:121`).
- Earlier identical query at 07:41 returned the correct Marathi "last crop = Wheat, field is fallow" message — that was the old `NO_ACTIVE_CROP_GUARD` path, which we now bypass. So bypassing NO_ACTIVE_CROP exposed a regression: the recommendation lane has no dedicated terminus and falls through the disease/pest diagnostic gates that require a known crop.

Root cause: `NEXT_CROP_RECOMMENDATION` queries by definition have **no current crop** (field is fallow). All downstream gates (G2, hypothesis arbitration's `FATAL_CANONICAL_CONTEXT_CORRUPTION` at 5457, etc.) assume a current crop must exist and emit clarifications/throws when it does not.

## Fix (production-safe, additive)

### 1. Dedicated NEXT_CROP_RECOMMENDATION lane (orchestrator.ts)
After the NO_ACTIVE_CROP bypass (~line 1744) and **before** any symptom/G2/hypothesis gating, detect `lockedIntent === 'NEXT_CROP_RECOMMENDATION'` (or `isNextCropRecommendationQuery(farmerMessage)`) and short-circuit to a deterministic recommendation builder. This keeps the entire diagnostic stack untouched for pest/disease flows.

Lane behavior:
- Load `decision_rules` where `category IN ('crop_rotation','crop_selection','next_crop','rotation_advisory')` already mapped to `PRESCRIPTION` (Phase 4 — done).
- Build symbolic context from already-resolved `landContext`: `rotation_history` (last 5 crops, available via canonical-context extension from Phase 5), `soil_npk`, `agro_zone`, `irrigation_type`, `season`, district/lat-lon.
- Evaluate rules → top N candidate crops with rationale.
- If zero rules match, fall back to deterministic narration block (last crop + soil snapshot + "rotation suggestions pending rule seeding") — never an English clarification, never `{symptom}` template.
- Pass through `llm-response-formatter` which is already in **NEXT-CROP RECOMMENDATION MODE** (Phase 6) for vernacular narration.
- Return `decision_output` with `template_type: 'NEXT_CROP_RECOMMENDATION'`, `confidence: 1.0`, `orchestrator_type: 'NEXT_CROP_RECOMMENDED'`.

### 2. Defensive guard on G2 (orchestrator.ts ~5306)
Even with the lane in place, add an explicit early-return at the top of the G2 block:
```ts
if (lockedIntent === 'NEXT_CROP_RECOMMENDATION') {
  console.log('   ⏭️ G2 CONTEXT_COMPLETENESS skipped — NEXT_CROP_RECOMMENDATION intent has no current crop by design');
} else if (contextValidation.status === 'NEEDS_CLARIFICATION') { … existing … }
```
Same guard added before the hypothesis-arbitration FATAL throw at line 5457 — for the recommendation intent, return a deterministic empty-hypothesis result rather than throwing.

### 3. Pipeline bypass in index.ts
Mirror the existing NO_ACTIVE_CROP bypass: if `decision_output.metadata.template_type === 'NEXT_CROP_RECOMMENDATION'`, skip the symbolic filtering / unified-gate / safety-gate that assume a diagnosed condition, and pass straight to the LLM formatter (which already has the RECOMMEND-mode prompt) and `ui-response-builder`.

### 4. Tests (tests/chat/next-crop-recommendation-routing.test.ts)
Extend the existing suite (33/33 currently passing):
- Marathi "या शेतात कोणते नवीन पिक घेवू?" → response is Marathi (Devanagari), contains last-crop reference, never matches `/Which crop are you asking about/`, never contains an unfilled `{…}` placeholder.
- Hindi + English equivalents produce localized responses.
- Pest query on the same fallow land still produces a clarification (i.e., we did not over-bypass).
- G2 still fires for non-recommendation intents with missing crop.

### 5. Audit doc
`docs/audit-2026-06-07/21-next-crop-clarification-regression-fix.md` — root-cause trace, lane diagram, gate-bypass matrix.

## Files touched

- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` — add NEXT_CROP lane + G2/hypothesis guards.
- `supabase/functions/ai-agriculture-chat/index.ts` — pipeline bypass for `template_type: 'NEXT_CROP_RECOMMENDATION'`.
- `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` — already in RECOMMEND mode; verify it accepts the new payload shape.
- `tests/chat/next-crop-recommendation-routing.test.ts` — new regression cases.
- `docs/audit-2026-06-07/21-next-crop-clarification-regression-fix.md` — new audit doc.

## Non-goals / preserved invariants

- No change to pest/disease diagnostic flow, Canonical Context Builder, Unified Decision Gate, Authority Hierarchy, Crop Schedule SSOT, tenant/farmer isolation.
- No new DB migrations; rule seeding for actual rotation logic is left to agronomy team (infrastructure from Phase 4–7 already supports it).
