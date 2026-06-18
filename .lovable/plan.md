
# Symbolic Decision Brain — Deep Audit & SSOT Hardening

## What I actually verified against the live DB

I ran agronomy-grade cross-checks against `intent_observation_mapping` (IOM), `observation_master` (OM), and the brain's runtime code. The user-reported symptom ("intent→observation mapping not correct, observation not accurate") is real, reproducible, and rooted in **bad ontology rows + residual hardcoded vocabularies in code**, not in the routing logic.

### Hard evidence

| # | Finding | Evidence |
|---|---|---|
| F1 | **Semantic-class violations in IOM**: 95 rows where the intent's domain disagrees with the observation's domain. | `WEED_PROBLEM`/`brinjal` → 11 rows that are not weeds (e.g. `bt_cotton_variety`, `cci_procurement`, `picking_quality`, `els_variety_query`, `continuous_cotton`). `IRRIGATION_QUERY` → `broken_stems` (wind/hail damage), `sticky_leaves_honeydew_*` (pest). Spans 11 crops, 2 intent families. |
| F2 | **Cross-crop contamination**: 54 IOM rows where `crop_code='rice'` is mapped to wheat-named observations (`lower_leaf_yellowing_wheat`, `upper_leaf_yellowing_wheat`, `sticky_leaves_honeydew_wheat`, `termite_mud_tubes_wheat`). Wheat observations should not appear under rice for ~20 different intents. |
| F3 | **Hardcoded agronomy in the brain** (SSOT violation): `decision-graph-bridge-data.ts` ships `IPM_DATABASE`, `DISEASE_DATABASE`, `CULTURAL_STRATEGIES` with crop-specific advice in code. `symbolic-reasoner.ts:327` keeps an UPPERCASE `BIOTIC_OBS_KEYS` list (will never match lowercase DB codes — biotic branch dead). `orchestrator.ts` hardcodes `EMERGENCY_OBS_CODES` and `ADVISORY_DIRECT_ROUTES`. `src/constants/crops.ts` hardcodes `CROP_NAME_TO_CODE`. |
| F4 | **Casing audit (clean)**: OM is 100% lowercase (2,537/2,537). IOM `observation_code` lowercase (13,854/13,854), `intent_code` uppercase (canonical). FK joins clean (0 orphans). The case-mismatch hazard is now isolated to F3's `BIOTIC_OBS_KEYS`. |
| F5 | **Alias hygiene**: 431 alias rows; need a sweep against the "no cause-encoded aliases" rule already in core memory. |

The user is right: the brain is being asked to reason on top of polluted ontology rows, and certain code paths bypass the ontology entirely.

## Goal

Make the **database the only source of agronomic truth**. Keep all routing/reasoning logic exactly as it is. Eliminate every hardcoded crop/observation/IPM list in the brain. Clean the IOM rows so an intent never points at an observation outside its semantic class or outside its crop.

## Plan — 4 phases, table-data first, code second

### Phase 1 — IOM data cleanup (SQL migration, reviewable)
1. **Quarantine, don't delete**, all 95 semantic-class violations from F1 and 54 cross-crop rows from F2: set `is_active = false`, stamp `updated_at`, and write a one-row audit per change into a new `intent_observation_mapping_audit` table (action, before/after, reason, sql_batch_id).
2. Add a constraint-style **validator function** `validate_iom_semantic_class(intent_code, observation_code)` that re-runs the same regex domain check and is invoked by a `BEFORE INSERT/UPDATE` trigger — future bad rows are rejected at write time, not at read time.
3. Add a **scheduled integrity probe** (`pg_cron`) that re-asserts F1+F2 nightly and writes counters into `governance_audit_reports`; alerts when > 0.

### Phase 2 — Observation_master canonicalisation
1. Rename `*_wheat`-suffixed observations that are actually crop-agnostic (`lower_leaf_yellowing_wheat` → `lower_leaf_yellowing`) via `observation_aliases` (no destructive rename — old code remains a redirect). Re-point IOM rows.
2. Sweep `observation_aliases` for cause-encoded entries (per `mem://safety/sugarcane-k-deficiency-hotfix-and-safety-gates`) and quarantine.
3. Add `observation_master.semantic_class` enum column (`NUTRIENT_DEFICIENCY|WATER_STRESS|WEED|PEST|DISEASE|MECHANICAL|MARKET|VARIETY|...`) so the Phase-1 trigger compares enums instead of regex.

### Phase 3 — De-hardcode the decision brain (code, no logic change)
All edits are vocabulary-replacement, **routing logic untouched**:
1. `decision/symbolic-reasoner.ts:327` — replace `BIOTIC_OBS_KEYS` with `await loadObservationsBySemanticClass('PEST')` cached at scope.
2. `agents/orchestrator.ts:421` `EMERGENCY_OBS_CODES` — load from `observation_master` where `urgency_level = 'EMERGENCY'` (column already exists in OM per schema audit).
3. `agents/orchestrator.ts:3394,4612` `ADVISORY_DIRECT_ROUTES` — promote to `intent_master.is_direct_route` flag.
4. `agents/decision-graph-bridge-data.ts` (`IPM_DATABASE`, `DISEASE_DATABASE`, `CULTURAL_STRATEGIES`) — delete file; deterministic builder already reads `decision_rules`. The fallback was only used when DB load failed; replace with a hard error + structured log so future failures are visible.
5. `src/constants/crops.ts` `CROP_NAME_TO_CODE` — replace with one cached read of `crop_synonyms` + `crops.code` at app start. (Frontend-only change, no business logic.)

### Phase 4 — Verification gates
1. Re-run F1/F2 queries — must return 0 rows.
2. Replay the last failing chats from `ai_chat_messages` against the cleaned ontology (read-only dry-run) and diff `ai_decision_log` before/after.
3. Add `tests/chat/iom-semantic-class.test.ts` that asserts the validator function rejects a synthetic bad pair.
4. Update memory: add `mem://architecture/decision-brain-ssot-no-hardcoded-vocab` Core rule.

## Technical details (for review)

- Phase 1 is **non-destructive** (`is_active=false` + audit row), so we can roll back instantly by flipping the flag.
- Phase 2's `semantic_class` column will be backfilled by mapping current `observation_type` + code-prefix heuristics, then manually corrected during review.
- Phase 3 cache strategy: module-level `Map` keyed by `tenant_id || 'global'` — these are global ontology reads, matches the contract in `docs/audit-2026-06-15/06-code-schema-drift.md §D6`.
- No changes to `orchestrator` routing, `unified-decision-gate`, `hypothesis-evaluator`, `prescription-gate-enforcer`, or `response-generator`. Memory rules around safety gates, K-deficiency hotfix, monitoring substitution remain authoritative.
- Migration order is enforced: Phase 1 → Phase 2 → Phase 3. Each phase has an explicit rollback SQL.

## What I need from you before I start editing

1. **Approve the quarantine strategy** (`is_active=false` + audit row) vs hard DELETE. I recommend quarantine.
2. **Confirm scope**: should Phase 3 also remove the smaller hardcoded lists in `src/services/voice/intents/` and `_shared/ruralLanguageGuide.ts`, or keep those (they affect voice routing, not the brain)?
3. **Confirm the 11 crops** in scope (rice, sugarcane, cotton, wheat, maize, soybean, tomato, chilli, potato, brinjal, onion) — the only `crop_code`s currently present in IOM.

Once approved I will produce Phase 1 as a single reviewable migration, then proceed through Phase 2–4 in order.
