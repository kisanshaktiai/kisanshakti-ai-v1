# Neuro-Symbolic Decision Brain — Forensic Audit & Surgical Fix Plan

## 1. Pipeline audit (LIVE call graph confirmed)

| Stage | Live entry | DB source | Status |
|---|---|---|---|
| Request/preload | `index.ts:377` → `orchestrator.orchestrate:1289` → `preloadPhase1Caches` `preloadObservationIndex` `preloadSystemConfig` (`:1298-1306`) | phase1-caches, observation-index, system-config | ✅ single-flight, TTL, safety hard-fail wired at `:1315` |
| Canonical context | `decision/authoritative-state-loader.ts` composed via RPC `resolve_biological_profile` | `lands`, `crop_schedules`, `soil_health`, `ndvi_data`, `weather_*` | ✅ SSOT split honored (crop/dates←crop_schedules, stage←biological_state, soil/NDVI/weather primary + lands cache) |
| Biological state + constraints | `agents/biological-state.ts` + `evaluateBiologicalConstraints` | `decision_rules`, `biological_state` write-lock | ✅ lock invariant enforced |
| Intent classification | `agents/intent-classifier.ts::classifyFarmerIntent` (NOT `decision/intent-classifier.ts` — that path does not exist) | `observation_intent_master` via downstream mappers | ✅ live |
| Intent→observation routing | `decision/observation-code-mapper.ts`, `concept-bridge.ts`, `iom-gate.ts` | `intent_observation_mapping`, `intent_assertion_pattern` | ✅ |
| Observation resolution | `decision/symbol-resolver.ts` (SHADOW dual-read), `concept-bridge.ts`, `observation-code-mapper.ts` | `observation_master/alias/translations/intent` via `observation-index.ts` | ⚠️ Still Phase-2 shadow-only; not yet SSOT-authoritative for reads |
| Clarification | `agents/clarification-strategy.ts`, `decision/hypothesis-clarification-builder.ts`, `runtime/navigator-adapter.ts` | `decision_rules`, hypothesis + observation tables | ✅ |
| Hypothesis evaluation | `decision/hypothesis-evaluator.ts`, `hypothesis-graph-evaluator.ts` | `decision_rules`, `system_config.bio_stage_hard_gate_threshold`, `variety_resistance` | ✅ hard-gate DB-driven (0.6 numeric fallback only if row missing) |
| Decision rule selection | `agents/decision-graph-bridge.ts` via `diagnostic-flow-controller.ts` + `rule-engine-executor.ts` | `decision_rules`, `master_products`, `chemical_regulatory_status` | ⚠️ DB-first but 2 hardcode leaks (see §2) |
| Safety guardian | `agents/safety-guardian.ts::verifySafety` | `chemical_regulatory_status`, `system_config` safety keys | ✅ fail-closed with `SafetyCacheUnavailableError` → `SAFETY_BLOCKED` |
| Narration | `agents/deterministic-response-builder.ts`, `llm-response-formatter.ts` | `decision_rules` fields | ⚠️ LLM narration-only, but dosage caps in builder are hardcoded (see §2 P0) |

## 2. Hardcoded-agri findings (excluding correctly `_LEGACY_`-prefixed cold-boot fallbacks)

### VIOLATIONS in the live decision path

| # | File:line | Constant | Why it's a violation |
|---|---|---|---|
| V1 | `agents/deterministic-response-builder.ts:302-320` | `MAX_SAFE_DOSES` (glyphosate 2160 g/ha, monocrotophos 500 g/ha, …) | Gates overdose logic; no DB-first path; not `_LEGACY_`-named |
| V2 | `agents/decision-graph-bridge.ts:96-99` | `NEONICOTINOIDS` list | Chemical-class detection with no DB path (deferred to Phase 4) |
| V3 | `decision/safety-enhancement.ts:80-97` | `INSECTICIDE_GROUPS`, `FUNGICIDE_GROUPS` (IRAC/FRAC) | Agronomic resistance-rotation authored in TS |
| V4 | `decision/iom-gate.ts:52-71` | `STAGE_SYNONYMS` | Duplicate of the map already removed from `runtime/clarification-contract.ts`; regression test doesn't cover this copy |
| V5 | `agents/orchestrator.ts:10990,12506`, `decision/fact-extractor.ts:180`, `decision/symbolic-reasoner.ts:1568`, `layers/rule-evaluation-layer.ts:453` | NDVI `>= 0.6` (5 duplicated literals) | Same magic threshold in 5 files; no `system_config` key |
| V6 | `decision/symbolic-reasoner.ts:1240` | Rule-match `score >= 0.6` | Governs rule-fire decision; no config key |
| V7 | `agents/safety-guardian.ts:858-861` | WHO toxicity class map (monocrotophos:Ib, phorate:Ia, …) | No `_LEGACY_` guard; call-site gating unverified |
| V8 | `agents/clarification-renderer.ts:489` | `/imidacloprid|chlorpyrifos|monocrotophos/i` regex | No DB counterpart |
| V9 | `agents/delivery-validator.ts:78` | `carbofuran → [furadan, फुराडान, कार्बोफुरान]` alias | No DB alias source |

### Acceptable (documented cold-boot legacy fallbacks — no change needed)
`_LEGACY_SAFETY`, `_LEGACY_BANNED_CHEMICALS`, `_LEGACY_PEST_INDICATORS`, `_LEGACY_ADVISORY_DIRECT_INTENTS`, `EMERGENCY_KEYWORDS.banned_used`, `BANNED_SUBSTANCES_INDIA` (licence-lookup only), `CAUSE_NAMES` (narration/i18n), narration output-guard chemical lists in `llm-response-formatter.ts:208,850`, `decision-representation.ts:379`, `llm-response-generator.ts:287`, `deterministic-response-builder.ts:1178` (`KNOWN_ACTIVE_INGREDIENTS` — QA cross-check only).

### Dead-ish
`runtime/stage-family-shim.ts:102` — `STAGE_FAMILIES = Object.freeze({})` intentional empty stub.

## 3. Surgical fix plan (phased, no schema churn beyond what's listed)

### Tier 0 — DB prep (one migration, seed + additive columns only)

Migration `seed_agri_ssot_gaps`:
1. Insert `system_config` rows: `ndvi_healthy_threshold=0.6`, `rule_match_min_score=0.6`.
2. Add nullable columns (idempotent) to `chemical_regulatory_status`: `chemical_class text`, `who_toxicity_class text`, and to `master_products`: `max_dose_per_ha_g numeric`, `dose_unit text`.
3. Create `public.chemical_rotation_group` reference table (`chemical_name`, `rotation_family`, `moa_code`, `moa_system` in {IRAC,FRAC}, `source`, `updated_at`) with GRANTs (SELECT to anon+authenticated, ALL to service_role), RLS enabled, read-only policy.
4. Seed the 3 tables from the current TS constants verbatim so behavior stays byte-identical on cutover.

### Tier 1 — P0 safety cutovers (fail-closed, DB-first)

- **V1 `MAX_SAFE_DOSES`**: add `getMaxDosePerHa(chemical)` in `utils/db-ssot/phase1-caches.ts` backed by `master_products.max_dose_per_ha_g`; hard-fail with `SafetyCacheUnavailableError` when cache warm-but-empty. Refactor `deterministic-response-builder.ts:302-320` call site; keep the current constant as `_LEGACY_MAX_SAFE_DOSES` cold-boot fallback (parity with `phase1-caches` pattern).
- **V2 `NEONICOTINOIDS`**: add `isChemicalClass(name, class)` accessor over `chemical_regulatory_status.chemical_class`; rewrite `decision-graph-bridge.ts:96-99`. Legacy list becomes `_LEGACY_NEONICOTINOIDS`.
- **V3 IRAC/FRAC**: add `getRotationGroup(chemical)` accessor over `chemical_rotation_group`; refactor `decision/safety-enhancement.ts:80-97` and its caller `agents/layered-rule-evaluator.ts`. Keep TS map as `_LEGACY_` cold-boot fallback.
- **V7 WHO class**: verify call sites of `safety-guardian.ts:858-861`; if any feed a decision (block/warn), migrate to `chemical_regulatory_status.who_toxicity_class` via a new `getWhoClass()` accessor; otherwise re-classify as narration-only and rename `_LEGACY_WHO_CLASS_MAP`.

### Tier 2 — P1 decision-graph integrity

- **V4 `STAGE_SYNONYMS` in `iom-gate.ts`**: delete the local map and route through the existing `stage-knowledge-cache.ts` DB-driven family resolver already used elsewhere. Extend `scripts/regression-diagnostic-options.test.ts` to also assert absence in `iom-gate.ts`.
- **V5/V6 NDVI + rule-match thresholds**: replace all 6 inline `>= 0.6` literals with a single `getConfigNumber('ndvi_healthy_threshold', 0.6)` / `getConfigNumber('rule_match_min_score', 0.6)` call from `system-config-cache.ts`. Add a lint-style regression grep script to prevent reintroduction.

### Tier 3 — P2/P3 hygiene

- **V8/V9**: fold `clarification-renderer.ts:489` regex and `delivery-validator.ts:78` alias map into the existing `chemical_regulatory_status` + alias-lookup accessors used by safety-guardian.
- Cutover Phase-2 observation-index from SHADOW dual-read to authoritative (only after the standing 7-day diff window shows zero divergence — verify via `[OBS_INDEX_DIFF]` logs before flipping).
- Delete `runtime/stage-family-shim.ts` once grep confirms no import needs the empty stub.
- Migrate `CAUSE_NAMES` (`diagnostic-escalation-generator.ts:95-340`) into `observation_translations`.

## 4. Sequencing

1. Approve plan → build mode.
2. Tier 0 migration first (blocks nothing at runtime; adds columns/rows only).
3. Tier 1 cutovers, one file per commit, with `_LEGACY_` fallback preserved for cold-boot; verify no `[SAFETY_HARD_FAIL]` on happy path in edge logs after each.
4. Tier 2 stage-synonym + threshold consolidation.
5. Tier 3 hygiene, observation-index authoritative flip last (requires ≥7-day clean shadow window).

## 5. Contract preservation (unchanged)

- GraphRuntime contract, CanonicalContext SSOT split, safety fail-closed semantics, hybrid symbolic+navigator+TS clarification authority (per `mem://constraints/no-ts-clarification-removal`), and DB-only agronomic authority (LLM = narration only) are all retained.
- No new hardcoded agri logic introduced; every new TS constant is either `_LEGACY_`-prefixed cold-boot fallback or a numeric default parity-seeded into `system_config` / `chemical_rotation_group`.

## 6. Open items to confirm before build

- Is the referenced `_deadcode/` snapshot from the prior audit still needed? It does not exist in this branch; earlier dead-file list can't be diffed until restored.
- V7 WHO-class map — confirm whether any current call site uses it for a decision vs pure narration; that determines P0 vs P2.
