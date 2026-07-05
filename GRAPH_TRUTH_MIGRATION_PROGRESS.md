# GraphTruth Migration — Phases 3 & 4

## Phase 3 — Hypothesis engine reads GraphTruth directly

**File:** `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (~line 4780)

The call into `evaluateCandidateHypotheses` no longer trusts the mutable pipeline locals (`cropCode`, `growthStage`, `resolvedDAS`, `currentObservations`). It now reads authoritative values from the frozen `GraphTruth` node built at `TURN_EVIDENCE_LOCK`.

```ts
const _gtForHyp = (this as any)._graphTruth as GraphTruth | null;
const hypObservations = _gtForHyp
  ? [..._gtForHyp.canonical_observations]
  : currentObservations;

// drift detector — logs when pipeline observations diverge from GraphTruth
if (_gtForHyp && sorted(currentObservations) !== sorted(_gtForHyp.canonical_observations)) {
  console.warn('[GRAPH_OBS_DRIFT] site=PRE_HYPOTHESIS pipe=[…] graph=[…] — using GraphTruth');
}

await evaluateCandidateHypotheses({
  crop_code:         _gtForHyp?.crop_code       ?? cropCode,
  growth_stage:      _gtForHyp?.biological_stage ?? growthStage,
  days_since_sowing: _gtForHyp?.DAS             ?? resolvedDAS,
  known_observations: hypObservations,
  variety_id:        _gtForHyp?.variety_id ?? (landContext as any)?.current_crop_variety_id ?? null,
  …
});
```

Effect: two wording variants of the same agronomic meaning that produce the same `GraphTruth.hash` are now guaranteed to reach the hypothesis engine with identical inputs.

**Trace signals**
- `[GRAPH_VALIDATED] site=PRE_HYPOTHESIS_ENGINE hash_match=true` — normal path
- `[GRAPH_OBS_DRIFT] site=PRE_HYPOTHESIS pipe=[…] graph=[…]` — surfaces any post-lock mutator (the target for future removal)

## Phase 4 — DB land-context authority overrides hardcoded ontology

**Files:**
- `supabase/functions/ai-agriculture-chat/agents/language-induction-layer.ts` — `induceCanonicalSymbols` gains an optional `landAuthority` argument.
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` — caller passes `{ current_crop: landContext.current_crop }`.

### Before
```ts
for (const [pattern, cropSymbol] of Object.entries(CROP_MAP)) {
  if (normalizedText.includes(pattern.toLowerCase())) {
    crop = { symbol: cropSymbol, confidence: 0.95, source_language: 'mr'|'hi'|'en', … };
    break;
  }
}
// Generic subject "पिक"/"crop" → no CROP_MAP hit → crop = null / UNKNOWN_CROP
```

### After
```ts
const authoritativeCrop = (landAuthority?.current_crop ?? '').trim();
if (authoritativeCrop) {
  crop = { symbol: authoritativeCrop.toUpperCase(), confidence: 1.0, source_language: 'db' };
  console.log(`[ONTOLOGY_SOURCE=land_context] crop=${crop.symbol} — CROP_MAP bypassed`);
} else {
  /* legacy CROP_MAP fallback only when we have no land context */
}
```

The hardcoded `CROP_MAP`, `MARATHI_SYMPTOM_MAP`, `HINDI_SYMPTOM_MAP`, `ENGLISH_SYMPTOM_MAP`, `STAGE_SYNONYMS`, `AFFECTED_PART_MAP` are retained as inert fallbacks for crop-agnostic entry points (voice assistant, general chat) but can no longer overwrite the DB-authoritative crop inside a land-specific session.

### Removed authorities (for land-specific chat)
| Site | Authority before | Authority after |
| --- | --- | --- |
| `language-induction-layer.CROP_MAP` | Hardcoded TS keyword table | `landContext.current_crop` (DB: `lands.current_crop_id → crops`) |
| Hypothesis engine `crop_code` / `growth_stage` / `DAS` | Mutable pipeline locals | Frozen `GraphTruth` fields |
| Hypothesis engine `known_observations` | `currentObservations` (mutable) | `GraphTruth.canonical_observations` (frozen) |

### DB tables that now drive the graph (unchanged schema)
`lands`, `crops`, `crop_synonyms`, `crop_stage_master`, `variety_phenology_profile`, `observation_master`, `observation_aliases`, `intent_observation_mapping`, `hypothesis_conditions`, `decision_rules`.

## Deployment
`ai-agriculture-chat` redeployed with Phase 3 + Phase 4 changes.

## Verification signals to look for in edge logs
```
[GRAPH_TRUTH_BUILT] hash=<h> crop=rice stage=SEEDLING das=26 obs=[POOR_GERMINATION]
[ONTOLOGY_SOURCE=land_context] crop=RICE — CROP_MAP bypassed
[GRAPH_VALIDATED] site=PRE_HYPOTHESIS_ENGINE hash_match=true hash=<h> …
[GRAPH_VALIDATED] site=PRE_IOM_GATE hash_match=true hash=<h> …
[GRAPH_VALIDATED] site=PRE_LAYERED_RULE_EVALUATOR hash_match=true hash=<h> …
[GRAPH_VALIDATED] site=PRE_RESPONSE_BUILDER hash_match=true hash=<h> …
```

Any `[GRAPH_OBS_DRIFT]` or `[GRAPH_CONTRACT_VIOLATION]` line pinpoints the exact remaining upstream mutator to eliminate in Phase 5.

## Deferred
- **Phase 5** — collapse `canonical-state-builder.ts` (1338 LOC) to a pure GraphTruth projection.
- **Phase 6** — Deno regression harness asserting identical `hash` / `crop_code` / `stage_uuid` / `observation_codes` / `hypothesis_id` / rule path for the three Marathi/Hindi wording variants on Rice+DAS=26.
