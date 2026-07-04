# Fix: neuro-symbolic graph plumbing only (no agronomy in TS)

Three surgical runtime fixes. Zero new agriculture concepts in code. Existing hardcoded dictionaries are marked deprecated but left in place (removing them is a separate DB-migration pass).

## Fix 1 — `causal-hypothesis-engine.ts` OBSERVATION dual-shape reader

**File:** `supabase/functions/ai-agriculture-chat/decision/causal-hypothesis-engine.ts`
**Lines:** 296–314 (`case 'OBSERVATION'`)

Current code reads only `value_json.code`. DB stores `value_json` as an array (`["obs_rice_no_emergence", ...]`) → `code` is `undefined` → condition always returns `FAILED`. This is why `RICE_GERMINATION_FAILURE` scores 0.

Replace the block with a shape-agnostic reader supporting both `{code:"..."}` and `["...","..."]`. No observation names, crops, or agronomy introduced — pure JSON shape handling:

```ts
case 'OBSERVATION': {
  const raw = value_json as any;
  const codes: string[] = Array.isArray(raw)
    ? raw.filter((x) => typeof x === 'string')
    : (typeof raw?.code === 'string' ? [raw.code]
      : Array.isArray(raw?.codes) ? raw.codes.filter((x: any) => typeof x === 'string')
      : []);
  if (codes.length === 0) return HypothesisConditionStatus.FAILED;

  const obsLower = observations.map((o) => String(o).toLowerCase());
  const codesLower = codes.map((c) => c.toLowerCase());

  if (operator === 'CONTAINS' || operator === 'IN' || operator === 'ANY_OF') {
    return codesLower.some((c) => obsLower.includes(c))
      ? HypothesisConditionStatus.PASSED
      : HypothesisConditionStatus.FAILED;
  }
  if (operator === 'ALL_OF') {
    return codesLower.every((c) => obsLower.includes(c))
      ? HypothesisConditionStatus.PASSED
      : HypothesisConditionStatus.FAILED;
  }
  if (operator === 'NOT_EXISTS' || operator === 'NOT_IN') {
    return codesLower.every((c) => !obsLower.includes(c))
      ? HypothesisConditionStatus.PASSED
      : HypothesisConditionStatus.FAILED;
  }
  return HypothesisConditionStatus.FAILED;
}
```

## Fix 2 — `layered-rule-evaluator.ts` observation-code first evidence source

**File:** `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`
**Lines:** 1419 (ObsFilter source) and 1498–1521 (`input.visual_symptoms` / `input.observations`)

Currently the ObsFilter reads `state.visual_symptoms` (undefined on `CanonicalState`), and the downstream `input` derives symptoms from a mix of confirmed + synthetic + `state.visual_symptom` legacy enum. Switch the evidence priority to a single ordered union — no observation → symptom conversion, no hardcoded names:

Priority union (identical helper used at both 1419 and 1498–1511):

```ts
// Ontology-first evidence union. Order = authority.
// NOTE: no observation-to-symptom mapping; codes are transported verbatim.
const _obsCodes:   string[] = Array.isArray((state as any).observation_codes)     ? (state as any).observation_codes     : [];
const _confirmed:  string[] = Array.isArray((state as any).confirmed_observations)? (state as any).confirmed_observations: [];
const _synthetic:  string[] = Array.isArray((state as any).synthetic_observations)? (state as any).synthetic_observations: [];
const _legacy:     string[] = (state.visual_symptom && state.visual_symptom !== 'NONE' && state.visual_symptom !== 'UNKNOWN')
  ? [String(state.visual_symptom)] : [];

const evidenceCodes = [..._obsCodes, ..._confirmed, ..._synthetic, ..._legacy]
  .filter(Boolean)
  .map((s: string) => String(s));
const evidenceCodesUpper = [...new Set(evidenceCodes.map((s) => s.toUpperCase().replace(/[\s-]/g, '_')))];
```

- Line 1419 `const visualSymptoms = ...` → `const visualSymptoms = evidenceCodesUpper;`
- Lines 1498–1511 `uniqueVisualSymptoms` derivation → replace with `evidenceCodesUpper` (single source).
- Lines 1518 & 1521: pass `evidenceCodesUpper` for both `visual_symptoms` and `observations` keys in `input`.

No new agronomy dictionaries. `CATEGORY_PATTERNS` / `PLANT_PART_PATTERNS` block is untouched — its input source is fixed, its content is deprecated (see Fix 4).

## Fix 3 — Stage-family soft bypass (no new STAGE_FAMILIES entries)

**File:** `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`
**Lines:** 1364–1374

Currently: if exact match fails and family lookup misses → hard reject with `return false`. Change to a *soft* bypass so ontology-missing stage relationships never silently kill a rule; log once for future DB migration:

```ts
const family = STAGE_FAMILIES[currentStage] || null;
const familyMatch = family
  ? normalizedApplicableStages.some((s: string) => s === currentStage || family.includes(s))
  : false;
const exactMatch = normalizedApplicableStages.includes(currentStage);

if (!exactMatch && !familyMatch) {
  if (!family) {
    // Ontology-missing: DO NOT reject. Emit forensic log for DB-backed
    // stage_relationships migration. Rule proceeds to condition evaluation
    // where DB-level stage predicates (STAGE conditions) remain authoritative.
    console.log(
      `[STAGE_ONTOLOGY_MISSING] rule=${bundled.rule_id} current_stage=${currentStage} ` +
      `applicable=[${normalizedApplicableStages.join(',')}] action=BYPASS_STAGE_GATE ` +
      `reason=STAGE_FAMILIES_deprecated_awaiting_db_stage_relationships`,
    );
  } else {
    // Family known and mismatched → keep existing hard gate for high-priority rules
    if (bundled.priority && bundled.priority > 70) {
      console.log(`🚫 [StageGate] Rule ${bundled.rule_id} blocked: stage_applicable=[${normalizedApplicableStages.join(',')}] vs current=${currentStage} (family=[${family.join(',')}])`);
    }
    return false;
  }
}
```

No new entries in `STAGE_FAMILIES`. `TRANSPLANTING` (and any other stage absent from the map) now falls into the bypass branch until DB-backed stage relationships arrive.

## Fix 4 — Mark hardcoded agronomy dictionaries deprecated

**File:** `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`

Add block comments (no logic change) above:
- `STAGE_FAMILIES` (~line 1348)
- `cropCodeAliases` (~line 1382)
- `CATEGORY_PATTERNS` and `PLANT_PART_PATTERNS` (~lines 1426, 1444)

Each comment states: `@deprecated — DO NOT ADD NEW AGRONOMY. Replace with DB-backed lookup (crop_stage_master.stage_relationships / crop_synonyms / observation_master.category & plant_part). Tracked for ontology-migration pass.`

## Explicitly NOT changing

- No new stages, crops, observations, pests, diseases, or symptoms added to any TS file.
- `canonical-state-builder.ts` — untouched (already carries `observation_codes` passthrough from earlier turn).
- `orchestrator.ts` — untouched.
- Database, `decision_rules`, `hypothesis_master`, `crop_stage_master`, `observation_master`, `intent_observation_mapping` — untouched.

## Expected outcome

For `भात अजून उगवले नाही` (Rice, DAS=26, transplanting):
- Bridge already emits `POOR_GERMINATION → obs_rice_no_emergence` into observations.
- Fix 1 lets `RICE_GERMINATION_FAILURE`'s OBSERVATION array condition PASS.
- Fix 2 lets the observation code reach the ObsFilter and downstream `input.observations`.
- Fix 3 stops the transplanting stage from silently killing the germination rule (soft bypass with `[STAGE_ONTOLOGY_MISSING]` log for follow-up).
- Winner becomes a diagnostic rule; `PROACTIVE_FLOOD_PREPAREDNESS_001` no longer trumps evidence.
