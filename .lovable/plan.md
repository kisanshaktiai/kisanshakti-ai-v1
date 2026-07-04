# Runtime-only fixes — Neuro-Symbolic Decision Brain

Scope guard: no changes to `decision_rules`, `observation_master`, `intent_observation_mapping`, `crop_stage_master` data, frontend, or translations. Runtime TypeScript only.

---

## BUG 1 — Response delivery crash in `generateFollowUp()`

**File:** `supabase/functions/ai-agriculture-chat/agents/communication-generator.ts` (~L1246–L1322)

**Root cause:** `extractRepeatApplicationInfo(decision)` is typed `RepeatApplicationInfo | null`, but line 1316 dereferences `repeatInfo.may_need_repeat` unguarded. When it's `null`, the whole response builder throws and the pipeline falls back to the generic young-crop template — even though the symbolic decision succeeded.

**Fix:**
1. Guard the dereference with `repeatInfo?.may_need_repeat`.
2. Only build `repeatNote` when `repeatInfo` is non-null AND `interval_days` is present.
3. Emit trace: `[FOLLOWUP_CONTEXT] available=<bool> repeat=<bool>` immediately after extraction.
4. Wrap the entire `generateFollowUp` body in a try/catch that logs `[FOLLOWUP_BUILD_ERROR]` and returns a minimal `FollowUpPlan` shell so a downstream failure never nukes the symbolic decision, matched diagnosis, rule output, or BiologicalState.

No other section builders touched.

---

## BUG 2 — Phenology SSOT: GDD stage must beat static DAS band

**Files:**
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (around L8520–L8600, right after `resolve_crop_phenology` RPC and BEFORE `buildBiologicalState`)
- `supabase/functions/ai-agriculture-chat/agents/biological-state.ts` (extend `PhenologyResolverRow` with optional `reconciled` fields; no data changes)

**Root cause:** RPC returns a static-DAS row (`source='crop_stage_master'`, `confidence≈0.75`) because advanced tables are empty. `buildBiologicalState` then locks the wrong stage, and `[STAGE_DRIFT_BLOCKED]` protects it.

**Fix (generic, crop-agnostic reconciler — runtime only, no seed data):**

1. New helper `runtime/phenology-reconciler.ts`:
   - Input: `landId`, `cropCode`, `das`, `phenologyRow` (DAS-derived), Supabase client.
   - Steps:
     a. Query `land_gdd_daily` for latest `gdd_accumulated` (already used elsewhere in orchestrator L10185 — same source, no schema change).
     b. Read `crop_stage_master` rows for the crop (READ-ONLY): pick the stage whose `min_gdd`..`max_gdd` window contains `gdd_accumulated`. If GDD columns are absent for the crop, skip GDD path (no invention).
     c. Build candidate stages with confidence:
        - `morphological_evidence` → 0.95
        - `completed_stage_transitions` (from `stage_transition_log` if any) → 0.90
        - `variety_phenology_profile` match → 0.85
        - `gdd_model` → 0.80–0.90 (scaled by weather-data freshness)
        - `crop_stage_master` DAS window → 0.70
     d. Pick highest-confidence candidate.
   - Output: `{ winner_stage, winner_source, winner_confidence, das_stage, gdd_stage, reason }`.

2. In `orchestrator.ts` after the RPC block:
   - Call reconciler.
   - If a higher-confidence stage exists AND differs from `phenology.growth_stage`, overwrite `phenology.growth_stage`/`stage_code`/`source`/`confidence` on the local object BEFORE `buildBiologicalState` (this is the single-writer window; invariant not yet locked).
   - Emit `[PHENOLOGY_RECONCILIATION] das_stage=… gdd_stage=… winner=… source=… reason=…`.
   - When no signals beyond DAS are available, log `winner=das_stage reason=only_das_available` and keep original — no behavior change.

No RPC edits, no DB writes, no crop-specific branches.

---

## BUG 3 — Farmer evidence count inflated by metadata

**Files:**
- `supabase/functions/ai-agriculture-chat/runtime/evidence-coverage.ts` (already has `INFORMATIVE_PLACEHOLDERS` + `isInformative`) — reuse.
- `supabase/functions/ai-agriculture-chat/agents/canonical-state-builder.ts` (`checkPrescriptionGate`, L1228–L1244) — replace ad-hoc filter.
- Any single upstream site that sets `state.symptom_count` (search + point-fix so it stops using `array.length`).

**Fix:**

1. Add generic classifier `classifyEvidence(codes: string[])` in `runtime/evidence-classifier.ts`:
   - `REAL_OBSERVATION` if `isInformative(code)` AND code does NOT match `/(_UNKNOWN$|_NONE$|_NOT_PROVIDED$|^ACTION_|^CROP_IDENTIFIED$|^STAGE_IDENTIFIED$|^CONTEXT_|^PHOTO_)/i`.
   - Returns `{ raw_count, real_symptom_count, ignored_metadata_count, real_codes, ignored_codes }`.

2. In `checkPrescriptionGate`:
   - Build a full codes list from `visual_symptom`, `secondary_symptoms`, and any `confirmed_observations` on state.
   - Compute `confirmedObservationCount = classifyEvidence(codes).real_symptom_count` — do NOT fall back to `state.symptom_count`.
   - Log `[EVIDENCE_CLASSIFICATION] raw_count=… real_symptom_count=… ignored_metadata_count=…`.
   - Keep the existing `[EVIDENCE_COUNT_TRACE]` line and feed it the classified count.

3. If a builder writes `state.symptom_count` from `array.length`, replace with classifier output at that single site (verified by grep before edit).

No changes to observation ontology or IOM — the classifier only filters by suffix/prefix patterns already documented in `evidence-coverage.ts`.

---

## Validation

For a single "crop has not germinated" query on a tillering-stage rice land, the log must include, in order:
1. `[BIO_STATE_LOCKED] … stage=<reconciled>`
2. `[PHENOLOGY_RECONCILIATION] winner=<gdd_or_morph_stage>`
3. `[STAGE_INVARIANT_PASS]`
4. `[EVIDENCE_CLASSIFICATION] real_symptom_count=1`
5. `[FOLLOWUP_CONTEXT] available=… repeat=false` (no crash)
6. Final response coming from Symbolic Decision Graph — not the generic fallback template.

## Out of scope
`decision_rules`, `observation_master`, `intent_observation_mapping`, `crop_stage_master` data, translations, frontend, RPC bodies, and any new seed data.
