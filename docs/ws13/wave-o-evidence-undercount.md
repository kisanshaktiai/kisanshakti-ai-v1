# Wave O — Evidence Undercount Hotfix (Decision-Brain Tautological-Question Bug)

## Symptom
Farmer message (Marathi, rice nursery, DAS 14): "पिक अद्याप उगवले नाही" → assistant
replied with a single yes/no clarification "पीक उगवत नाही का?" instead of running
the diagnosis brain. Trace `trace_mqq6x24x_nqiwdo`, session 2026-06-23 05:14:56Z.

## Pipeline trace
1. Observation extractor → 19 codes, `EXTRACTED[POOR_GERMINATION]` + 11 INFERRED
   corroborators (`SEED_NOT_GERMINATED`, `GAPS_IN_FIELD`, `SEEDLING_DIED`,
   `GERMINATION_FAILURE`, `OBS_RICE_NO_EMERGENCE`, `DELAYED_GERMINATION`,
   `GERMINATION_CONCERN`, `OBS_RICE_PATCHY_EMERGENCE`, `AFFECTED_PART_WHOLE`,
   `SEVERITY_HIGH`).
2. Cross-crop terminal guard → strips `GERMINATION_FAILURE` from the SYNTHETIC
   injection set (correct, prevents synthetic injection of terminals).
3. `detectCropDamageWithAuthority` v5.1 → emergency-promotes `SEVERITY_HIGH`,
   reports `damage_type=SIGNIFICANT`, `severity_level=HIGH`,
   `diagnosis_mode=DIAGNOSIS_ONLY`.
4. Orchestrator override v4.1 → land context present (`Shinghan Mal`, rice, DAS 14)
   ⇒ flips to `DIAGNOSIS_WITH_CLARIFICATION` (intentional — show options).
5. **Evidence-insufficiency guard (`orchestrator.ts:4646`)** — counted only the
   post-strip `damage_observations` (`[POOR_GERMINATION]`, length 1). Hit
   `realDamageObs.length < 2`, declared evidence insufficient, fell through to
   the generic clarification path. The clarifier echoed the farmer's sentence.

## Root cause
The evidence-insufficiency guard counts the wrong set:
- `cropDamageResult.damage_observations` reflects only EXTRACTED + emergency-
  promoted INFERRED codes that survived the cross-crop terminal guard.
- INFERRED damage corroborators (alias expansion of the EXTRACTED parent) and
  the detector's `severity_indicators` were ignored.
- The threshold `< 2` does not consider the detector's structured verdict
  (`damage_type`, `severity_level`, land lock), so a clear terminal/significant
  report backed by 1 EXTRACTED + N INFERRED codes was treated identically to
  a vague single-symptom turn.

## Fix (orchestrator.ts, `evidenceInsufficient` block)
1. **Pre-strip union counter.** `realDamageObs` now unions:
   - post-strip `cropDamageResult.damage_observations`
   - INFERRED codes from `allObservationsForPreAuth` whose canonical name is
     in a fixed damage taxonomy (terminal blocklist + germination/patchy/
     wilting/rot canonicals)
   - the detector's `severity_indicators`
   Sentinel codes (`*_UNKNOWN`, `*_NONE`, `*_NOT_PROVIDED`, `*_IDENTIFIED`)
   are still excluded.
2. **Structured-verdict bypass.** `evidenceInsufficient` is forced `false`
   when:
   `damage_type ∈ {TERMINAL, SIGNIFICANT}` ∧ `severity_level ∈ {HIGH, CRITICAL}`
   ∧ `hasLandContext`. This is crop-agnostic (no per-crop carve-out) and
   defers to the detector's authority verdict rather than re-deciding via a
   raw count.
3. **Audit log.** When the bypass fires, agent tag `WAVE_O_TERMINAL_EVIDENCE_
   BYPASS` is pushed and the real damage set is logged.

## Behaviour after fix
For the failing trace:
- `realDamageObs` becomes `[POOR_GERMINATION, SEED_NOT_GERMINATED,
  POOR_GERMINATION_PERCENT, GAPS_IN_FIELD, SEEDLING_DIED, GERMINATION_FAILURE,
  DELAYED_GERMINATION, GERMINATION_CONCERN, AFFECTED_PART_WHOLE,
  SEVERITY_HIGH]` (10 codes).
- `isTerminalOrSignificantWithLandContext = true`, so even if the union were
  empty the bypass would route through.
- DIAGNOSIS-FIRST runs hypothesis evaluation (Wave N1 IOM rows now back this
  for rice EMERGENCE_FAILURE × {germination, nursery, seedling}), producing a
  ranked differential (drought / seed quality / soil crust / termite /
  damping-off / sowing depth / temperature) plus immediate action + monitor
  plan — matching real-farming-practice expectations.

## Validation queries (post-deploy)
```sql
-- 1) New rice-emergence decisions reaching the brain
SELECT COUNT(*) AS rice_emergence_decisions
FROM public.ai_chat_messages
WHERE role='assistant'
  AND created_at > now()
  AND metadata->>'orchestrator_type' = 'DECISION_PROVIDED'
  AND lower(metadata->>'crop_context') = 'rice'
  AND metadata->>'inferred_intent' = 'EMERGENCE_FAILURE';

-- 2) Any new CLARIFICATION_QUESTION turns where damage_type was
--    TERMINAL/SIGNIFICANT and severity HIGH/CRITICAL with land context = regression.
SELECT id, created_at, metadata
FROM public.ai_chat_messages
WHERE role='assistant'
  AND created_at > now()
  AND metadata->>'orchestrator_type' = 'CLARIFICATION_QUESTION'
  AND metadata->>'damage_type' IN ('TERMINAL','SIGNIFICANT')
  AND metadata->>'severity_level' IN ('HIGH','CRITICAL')
  AND metadata->>'has_land_context' = 'true';

-- 3) Count of Wave-O bypass activations
SELECT COUNT(*) FROM public.ai_chat_messages
WHERE role='assistant'
  AND created_at > now()
  AND metadata->'agents_used' ? 'WAVE_O_TERMINAL_EVIDENCE_BYPASS';
```

## Related artifacts
- Code: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (lines ~4629–4720).
- Memory: existing constraint "no per-crop intent guards or hardcoded
  observation lists" is preserved — the damage taxonomy is crop-agnostic.
- Wave N1 (curation) provided the IOM rows that make the post-bypass
  hypothesis evaluation actually return rice-germination candidates.
