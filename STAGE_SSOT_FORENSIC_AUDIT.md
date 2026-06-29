# STAGE SSOT — Forensic Audit Report
**Scope:** `supabase/functions/ai-agriculture-chat/**`  
**Mode:** Read-only investigation. No code or DB changes.  
**Audit date:** current HEAD.

---

## 1. Executive Conclusion

There is **NO single Source of Truth** for `growth_stage`. The runtime contains **at least seven (7) independent stage producers** and **at least five (5) authority chains** that read/write `growth_stage` during a single turn. Each producer uses a different table, formula, and casing convention. The "canonical context" is declared `Object.freeze`d but is subsequently shadowed and overwritten by downstream paths.

The closest thing to an authority is:

> `agents/orchestrator.ts → fetchComprehensiveLandContext()` line **8299**, which reads `crop_schedules` and calls `this.calculateGrowthStage(daysSinceSowing, cropName)` (line **8380**).

Everything after this line is a *potential* mutator.

---

## 2. Stage Source Inventory (Producers)

| # | Producer | File / Line | Inputs | Formula / Table | Output written to |
|---|----------|-------------|--------|-----------------|-------------------|
| P1 | `fetchComprehensiveLandContext` | `agents/orchestrator.ts:8299` | `lands`, `crop_schedules` | DAS from `crop_schedules.sowing_date`; stage via `calculateGrowthStage` (in-file CROP_STAGES table, line 8588) | `landContext.growth_stage` |
| P2 | `calculateGrowthStage` (hardcoded ICAR table #1) | `agents/orchestrator.ts:8586–8669` | DAS, crop name | Hardcoded `CROP_STAGES` map for WHEAT/RICE/SUGARCANE/COTTON/SOYBEAN/MAIZE + `DEFAULT_STAGES` | returned to P1 |
| P3 | `calculateGrowthStageFromDAS` (hardcoded ICAR table #2) | `decision/crop-calendar-lookup.ts:469` + `calculateGenericStage` line 529 | DAS, crop | `ICAR_CALENDARS` map (different ranges from P2) | `phenologyResult.current_stage` consumers |
| P4 | `ContextValidator.validateGrowthStage` (hardcoded ICAR table #3) | `decision/context-validator.ts:282` + `ICAR_CROP_CALENDARS` line 83 + `calculateGenericStage` line 449 | sowing_date, crop_code | Third independent ICAR map; defaults to **`VEGETATIVE`** when sowing_date missing (line 292) | `result.reconciled_stage` with `stage_source ∈ {CONFIRMED, CALCULATED, DEFAULT}` |
| P5 | `calculatePhenologicalStage` (GDD engine) | invoked at `agents/orchestrator.ts:5073`; sets `landContext.growth_stage = phenologyResult.current_stage` at **line 5087** | weather history, DAS, latitude | GDD accumulation, falls back to DAS | **Overwrites** `landContext.growth_stage` |
| P6 | `getStageByDAS` (DB-first) | `utils/stage-knowledge-cache.ts:117` | `crop_stage_master` rows | `das_min ≤ das ≤ das_max` on `crop_stage_master` | Read-only helper; not currently bound to landContext |
| P7 | Hard override "GERMINATION" | `index.ts:1749–1758` | "impossible harvest" sanity check (HARVEST/MATURITY with DAS<100) | Hardcoded string `'GERMINATION'` | **Mutates** `landContext.growth_stage` AND `orchestratorResponse.dataAudit.land.growth_stage` |

Additional non-producing but stage-overriding code:
- `decision/context-authority.ts:270, 294, 311` — `resolveFinalRenderContext` reassigns `result.growth_stage` from one of three sources (`dataAudit` → `lockedCropContext` → `landContext`) by priority.
- `index.ts:1564` — `landContext.growth_stage = renderContext.growth_stage` (post-reconciliation mutation).
- `agents/orchestrator.ts:5817` — `canonicalState.growth_stage = cropContextAuthority.growth_stage` when canonical state is UNKNOWN.
- `agents/orchestrator.ts:5932` — `landContext.growth_stage = contextValidation.reconciled_stage` (guarded by canonical lock but still present).
- `agents/clarification-strategy.ts:186` — module-level singleton `_lockedStageContext` (mutated via `lockStageForTurn`, read via `getLockedStage`) — **stateful across requests in same isolate** (see §9 Risk).

---

## 3. Stage Ownership Matrix

| Component | Reads stage | Writes/mutates stage | Authority claim |
|-----------|-------------|----------------------|-----------------|
| `fetchComprehensiveLandContext` (P1) | `crop_schedules`, `lands` | `landContext.growth_stage` | Claims "SSOT" via log `[SOWING_DATE_SOURCE] crop_schedules table (SINGLE SOURCE OF TRUTH)` (line 8382) |
| `buildCanonicalContextContract` | `landContext.growth_stage` (line 160) | Freezes into `canonicalContext` (line 202–233) | Claims "PHASE1_LOCKED" / `is_locked=true` |
| GDD engine (P5) | `landContext.*` | `landContext.growth_stage` (line 5087) | **No claim — silently overwrites** canonical input source |
| `ContextValidator` (P4) | `land_context`, `land_state` | `contextValidation.reconciled_stage` then `landContext.growth_stage` (line 5932) | Claims authority via `stage_source = CONFIRMED/CALCULATED/DEFAULT` |
| `clarification-strategy._lockedStageContext` | landContext at orchestrator start (line 1272) | module global | Claims "STAGE_LOCK" — but is shared mutable state |
| `OPTION_SELECTED` branch (orchestrator 1943–1969) | `getLockedStage()`, `landContextForOptionSelection`, `lockedCropContext`, `graph.canonical_context` | local `growthStage` defaulted to **'VEGETATIVE'** (line 1958) | Claims `stageSource ∈ {CANONICAL_LAND, LAND_CONTEXT, LOCKED_STRATEGY, LOCKED_CONTEXT, DEFAULT}` |
| `resolveFinalRenderContext` (`context-authority.ts`) | `landContext`, `lockedCropContext`, `dataAudit` | `result.growth_stage`; caller writes back to `landContext.growth_stage` (`index.ts:1564`) | Claims authority via `authority_override_applied` flag |
| Sanity override (P7) | `finalGrowthStage`, `daysAfterSowing` | `landContext.growth_stage = 'GERMINATION'`, also overwrites `dataAudit` | Claims via comment "SANITY CHECK FAILED" |
| `LayeredRuleEvaluator` | `canonicalState.growth_stage` / `landState.crop.*` | none direct | Consumer |
| `UnifiedDecisionGate` | `input.growth_stage`, `input.stage_source` (`unified-decision-gate.ts:210, 587`) | none direct | Consumer (treats `stage_source==='DEFAULT'` specially) |
| `ClarificationGenerator` / contract | stage via `clarification-contract.ts:75` (intent+crop+stage-synonym+DAS) | none direct | Consumer |
| `HypothesisEvaluator` | stage via `calculateStageRelevanceScore` (`decision/hypothesis-evaluator.ts:257`) | none direct | Consumer |
| `RuleLoader` (`bundled-rules/loader.ts`) | `input.days_since_sowing` (line 528) + stage predicate | none direct | Consumer |
| `audit-logger.ts:562` | `context.growth_stage` | persists into `currentTurn.growth_stage` (DB write to `ai_decision_log`) | Persister |
| `context-manager.ts:499` | `landContext.growth_stage` | writes to `accumulated_knowledge.confirmed_facts.growth_stage` (session) | Persister |
| `runtime/graph-runtime-state.ts:403, 424, 512` | `canonical_context.days_since_sowing`, stage | `GraphStateDriftError` when changes | Drift-detector only; does not own value |

---

## 4. Stage Mutation Timeline (one farmer query)

```
T0  Edge entry (index.ts)
T1  orchestrator.processQuery(landId)
T2  fetchComprehensiveLandContext()                  [P1]
        ├─ SELECT * FROM lands WHERE id=$1 AND farmer_id=$2
        ├─ SELECT * FROM crop_schedules WHERE land_id=$1 AND is_active=true ORDER BY sowing_date DESC LIMIT 1
        ├─ DAS = floor((today − crop_schedules.sowing_date)/86400000)
        └─ growthStage = this.calculateGrowthStage(DAS, cropSchedule.crop_name)   [P2 hardcoded ICAR #1]
            └─ if !cropSchedule → growthStage = 'VEGETATIVE'  (orchestrator:8400)
T3  lockStageForTurn(crop, stage, DAS, 'CROP_SCHEDULE'|'LAND_CONTEXT')
        → mutates module-global _lockedStageContext  (clarification-strategy.ts:198)
T4  buildCanonicalContextContract(landContext, true)
        → growth_stage = landContext.growth_stage (line 160)
        → Object.freeze(canonicalContext) with is_locked=true (line 202)
T5  PHASE 1A.2 GDD: calculatePhenologicalStage(...)   [P5]
        → landContext.growth_stage = phenologyResult.current_stage  (orchestrator:5087)
        ⚠️ canonicalContext is frozen but landContext is NOT → divergence created here
T6  PHASE 2.5.1 G2: validateContextCompleteness()    [P4]
        → contextValidation.reconciled_stage (own ICAR table)
        → if canonicalContext.is_locked: override blocked (line 5928)
          else: landContext.growth_stage = reconciled_stage (line 5932)
T7  OPTION_SELECTED path (if clarification chip clicked)
        → growthStage = canonical_context?.growth_stage
                      ?? landContext.growth_stage
                      ?? getLockedStage()?.growth_stage
                      ?? lockedCropContext?.growth_stage
                      ?? 'VEGETATIVE'                  (orchestrator:1953-1958)
        → stage_source label assigned (CANONICAL_LAND/LAND_CONTEXT/LOCKED_STRATEGY/LOCKED_CONTEXT/DEFAULT)
T8  resolveFinalRenderContext(landContext, lockedCropCtx, dataAudit)   [index.ts:1554]
        → priority: dataAudit → lockedCropContext → landContext       (context-authority.ts:268-319)
        → may set authority_override_applied=true
        → index.ts:1564 writes landContext.growth_stage = renderContext.growth_stage
T9  UnifiedDecisionGate (consumes finalGrowthStage + stage_source)    [index.ts:1601-1646]
T10 Sanity override                                                    [index.ts:1742-1759]
        if (HARVEST|MATURITY) && DAS<100:
            landContext.growth_stage = 'GERMINATION'                   [P7]
            orchestratorResponse.dataAudit.land.growth_stage = 'GERMINATION'
T11 LLM formatter / response builder consumes finalGrowthStage
T12 audit-logger persists currentTurn.growth_stage to ai_decision_log  (agents/audit-logger.ts:562)
T13 context-manager persists accumulated_knowledge.confirmed_facts.growth_stage
    to ai_chat_sessions.conversation_state                              (agents/context-manager.ts:499)
```

**Net effect:** Up to **6 distinct values** of `growth_stage` may exist in a single turn:  
`landContext.growth_stage` (mutated at T2, T5, T6, T8, T10) · `canonicalContext.growth_stage` (frozen at T4) · `_lockedStageContext.growth_stage` (T3) · `contextValidation.reconciled_stage` (T6) · `renderContext.growth_stage` (T8) · `canonicalState.crop_stage` (CanonicalStateBuilder).

---

## 5. Database Dependency Graph

| Table | Stage-related columns | Writer (code) | Reader (code) | Frequency |
|-------|----------------------|---------------|---------------|-----------|
| `lands` | `current_crop_stage`, `current_crop`, `cultivation_date` (deprecated for stage) | external CRUD | `orchestrator.ts:8311` SELECT * | per turn |
| `crop_schedules` | `sowing_date`, `crop_name`, `crop_variety`, `expected_harvest_date`, `is_active` | external CRUD | `orchestrator.ts:8346`, `orchestrator.ts:9016` | per turn (authoritative for DAS) |
| `crop_stage_master` | `crop_code`, `growth_stage`, `das_min`, `das_max` | seed data | `utils/stage-knowledge-cache.ts` (`getStageRow`, `getStageByDAS`, `getStageCategoryFromDB`) | on cache hydration |
| `crop_baseline_guidelines_v2` | stage-keyed nutrient rows | seed data | `utils/baseline-guidelines-cache.ts:130` `getBaselineByDAS` | on cache hydration |
| `decision_rules` | `stage_applicable`, `crop_applicable` | seed data | `bundled-rules/loader.ts` | per turn |
| `intent_observation_mapping` | stage-synonym filter | seed data | `runtime/clarification-contract.ts:75` | per clarification |
| `observation_master` | (no stage column; gated by stage at runtime) | seed data | `runtime/farmer-observable-gate.ts` | per clarification |
| `ai_chat_sessions.conversation_state` (JSONB) | `last_growth_stage`, `lockedCropContext.growth_stage`, `accumulated_knowledge.confirmed_facts.growth_stage` | `agents/context-manager.ts:499`; orchestrator session writes | `index.ts:1530`, orchestrator OPTION_SELECTED path | every turn |
| `ai_decision_log` | `growth_stage` (set via `currentTurn.growth_stage`) | `agents/audit-logger.ts:562` | analytics | every turn |

---

## 6. Database Read / Write Trace

### Reads
| File:Line | SQL (paraphrased) | Columns returned |
|-----------|-------------------|------------------|
| `agents/orchestrator.ts:8310-8314` | `SELECT * FROM lands WHERE id=$1 AND farmer_id=$2` | `current_crop`, `current_crop_stage`, `cultivation_date`, ... |
| `agents/orchestrator.ts:8345-8352` | `SELECT * FROM crop_schedules WHERE land_id=$1 AND is_active=true ORDER BY sowing_date DESC LIMIT 1` | `crop_name`, `crop_variety`, `sowing_date`, `expected_harvest_date` |
| `agents/orchestrator.ts:9016` | additional `crop_schedules` read (secondary path) | same |
| `utils/stage-knowledge-cache.ts` (init) | `SELECT * FROM crop_stage_master` | `crop_code, growth_stage, das_min, das_max` |
| `utils/baseline-guidelines-cache.ts` (init) | `SELECT * FROM crop_baseline_guidelines_v2` | stage-keyed nutrient rows |
| `bundled-rules/loader.ts` | `SELECT * FROM decision_rules` (paginated) | `stage_applicable`, predicates |
| `runtime/clarification-contract.ts` | `SELECT * FROM intent_observation_mapping WHERE intent=? AND crop=? AND stage IN (synonyms) AND das BETWEEN ...` | observation keys |
| Session loader (`index.ts` session bootstrap) | `SELECT conversation_state FROM ai_chat_sessions WHERE id=?` | `last_growth_stage`, `lockedCropContext`, `accumulated_knowledge.confirmed_facts.growth_stage` |

### Writes
| File:Line | Target | Reason |
|-----------|--------|--------|
| `agents/audit-logger.ts:562` | `ai_decision_log.growth_stage` | turn-end persistence |
| `agents/context-manager.ts:499` | `ai_chat_sessions.conversation_state.accumulated_knowledge.confirmed_facts.growth_stage` | session memory |
| Session save sites in `agents/orchestrator.ts` (`stage_source` recorded at lines 1999, 2208, 4169) | `ai_chat_sessions.conversation_state.stage_source` | source tag for next turn |
| `runtime/runtime-trace-collector.ts` | `ai_decision_log`, `ai_chat_audit_logs` (trace) | forensic trace; not authority |

No INSERT/UPDATE was found that writes back into `lands.current_crop_stage` or `crop_schedules`. The DB stage columns are **read-only** for the chat runtime.

---

## 7. Code Dependency Graph (stage)

```
index.ts (entry)
  └─ orchestrator.processQuery()
       ├─ fetchComprehensiveLandContext        ── reads crop_schedules + lands
       │     └─ calculateGrowthStage           [P2 hardcoded ICAR #1]
       ├─ lockStageForTurn (module global)     [clarification-strategy.ts]
       ├─ buildCanonicalContextContract        [decision/canonical-context-contract.ts]
       ├─ calculatePhenologicalStage (GDD)     [P5] → mutates landContext.growth_stage
       ├─ validateContextCompleteness          [P4 hardcoded ICAR #3 + DEFAULT 'VEGETATIVE']
       ├─ canonical-state-builder              [agents/canonical-state-builder.ts] reads + tags stageSource
       ├─ LayeredRuleEvaluator                 [agents/layered-rule-evaluator.ts]   consumer
       ├─ ClarificationContract                [runtime/clarification-contract.ts]  consumer
       ├─ HypothesisEvaluator                  [decision/hypothesis-evaluator.ts]   consumer
       ├─ ConflictResolver                     consumer
       └─ runtime/graph-runtime-state          drift detector
  └─ resolveFinalRenderContext                 [decision/context-authority.ts] reassigns
  └─ Sanity override                           [index.ts:1742-1759]   hard 'GERMINATION'
  └─ evaluateUnifiedGate                       [decision/unified-decision-gate.ts]  consumer
  └─ generate*Response / LLM formatter         consumer
  └─ audit-logger.persist                      writer
  └─ context-manager.persistSession            writer
```

---

## 8. Hardcoded Stage Report

| Value | Locations (file:line) | Form |
|-------|----------------------|------|
| `GERMINATION` | `orchestrator.ts:8590,8600,8610,8619,8629,8638,8651`; `crop-calendar-lookup.ts:537`; `context-validator.ts` (within ICAR_CROP_CALENDARS map line 83-…); `index.ts:1753, 1758` (override); `agents/layered-rule-evaluator.ts:1314` (comment) | constant string in stage tables + runtime override |
| `SEEDLING` | `orchestrator.ts:8591,8601,8611,8620,8630,8639,8652`; `crop-calendar-lookup.ts:540` | constant string in stage tables |
| `TILLERING` / `ACTIVE_TILLERING` | `orchestrator.ts:8592,8602,8612` (TILLERING); `ACTIVE_TILLERING` — **Not Found** as hardcoded literal in code (likely comes from `crop_stage_master` rows or rule predicates) | constant strings |
| `VEGETATIVE` | `orchestrator.ts:8400` (fallback when no sowing date), `1958` (OPTION_SELECTED default), `8621,8631,8640,8653`; `crop-calendar-lookup.ts:543`; `context-validator.ts:292` (DEFAULT); `index.ts:1530` (sessionState fallback); `decision/context-authority.ts:288` (VEGETATIVE comparison) | default fallback |
| `FLOWERING` | `orchestrator.ts:8594,8604,8623,8632,8642(SILKING),8654`; `crop-calendar-lookup.ts:546` | stage table entries |
| `MATURITY` | `orchestrator.ts:8596,8606,8614,8634,8644,8656,8669`; `crop-calendar-lookup.ts:548` | stage table entries + final default |
| `HARVEST` | `orchestrator.ts:8597,8607,8616,8626,8635,8645,8657`; `index.ts:1744` (sanity-check trigger) | stage table entries + override trigger |
| Stage families (GERMINATION↔EMERGENCE etc.) | `runtime/navigator-adapter.ts:32` `STAGE_FAMILIES` constant | normalization map |

---

## 9. Duplicate SSOT Report

Five concurrent authority chains were located. None is exclusive.

1. **`lands.current_crop_stage`** — read only at `orchestrator.ts:1024, 1121, 1331` (logging/snapshots). Not used to drive the runtime.
2. **`crop_schedules.sowing_date` → `calculateGrowthStage` (P2)** — claims "SINGLE SOURCE OF TRUTH" at log line `orchestrator.ts:8382`. This is the **earliest authority** in the turn.
3. **`calculatePhenologicalStage` (P5)** — silently **overwrites** authority #2 (`landContext.growth_stage = phenologyResult.current_stage`) at `orchestrator.ts:5087`.
4. **`validateContextCompleteness` (P4)** — uses a **third** ICAR calendar (`decision/context-validator.ts:83`), then overwrites `landContext.growth_stage` at `orchestrator.ts:5932` (guarded by canonical lock but only when `canonicalContext.is_locked` truthy).
5. **`resolveFinalRenderContext` (`context-authority.ts:222-320`) → `index.ts:1564`** — final reassignment of `landContext.growth_stage` from `renderContext`. Followed by **`index.ts:1749` hard `'GERMINATION'` override** (P7).
6. **Session memory** — `ai_chat_sessions.conversation_state.last_growth_stage`, `lockedCropContext.growth_stage`, `accumulated_knowledge.confirmed_facts.growth_stage`, plus the **module-global `_lockedStageContext`** in `clarification-strategy.ts:186` (stateful across requests in the same Deno isolate) — used at `index.ts:1530` and `orchestrator.ts:1953-1958` as fallbacks.

**Result:** any of (P1, P2, P3, P4, P5, P7, locked-strategy global, lockedCropContext session, conversation_state.last_growth_stage) can be the value handed to the rule engine, clarification, and response — depending on path taken and which mutation ran most recently.

---

## 10. Root Cause — Birthplace of Stage Divergence

The divergence is born at **three structural points**:

### RC-1 — Frozen canonical vs mutable landContext  
- `decision/canonical-context-contract.ts:202` `Object.freeze(canonicalContext)` snapshots `growth_stage` from `landContext.growth_stage` (line 160).  
- `landContext` itself is **NOT frozen**.  
- Downstream code at `agents/orchestrator.ts:5087, 5932`, `index.ts:1564, 1753, 1758` mutates `landContext.growth_stage` but `canonicalContext.growth_stage` stays at its T4 value.  
- Different consumers read different objects: `LayeredRuleEvaluator` consumes `canonicalState` (built from landContext snapshot at canonical-state-builder time); `index.ts` LLM path consumes `landContext`; `UnifiedDecisionGate` consumes `finalGrowthStage = renderContext.growth_stage`. **One turn, three values.**

### RC-2 — Three independent ICAR calendars  
Stage formulas live in three files with different DAS ranges:
- `agents/orchestrator.ts:8588-8647` (CROP_STAGES — used by P1)  
- `decision/crop-calendar-lookup.ts` `ICAR_CALENDARS` + `calculateGenericStage` line 529-558 (used by GDD callers)  
- `decision/context-validator.ts:83` `ICAR_CROP_CALENDARS` + `calculateGenericStage` line 449 (used by G2 gate)  
- Plus DB-backed `crop_stage_master` consumed by `utils/stage-knowledge-cache.getStageByDAS:117` — **not** wired to landContext.  

For RICE @ DAS=12, P2 returns `SEEDLING` (≤25), P3/P4 generic returns `GERMINATION` (≤15). The system actively disagrees with itself.

### RC-3 — Module-level singleton stage lock  
`agents/clarification-strategy.ts:186` `let _lockedStageContext: LockedStageContext | null = null;` is a **per-isolate global**. In Deno Edge Functions, isolates are reused across requests. `lockStageForTurn` is called per turn (orchestrator:1272) and `clearLockedStage` exists but no audit confirmed it runs on every exit (no `finally`-bound clear was found in the orchestrator entry path). Consequence: **Farmer A's `LOCKED_STRATEGY` stage can be served to Farmer B's next request** routed through the same isolate when other authorities are missing (the OPTION_SELECTED branch explicitly falls back to `getLockedStage()?.growth_stage` at orchestrator:1956).

### RC-4 — Default-to-VEGETATIVE leak  
- `agents/orchestrator.ts:8400` — when no `crop_schedules` row exists.  
- `decision/context-validator.ts:292` — when sowing date missing (with `stage_source='DEFAULT'`).  
- `agents/orchestrator.ts:1958` — OPTION_SELECTED last-resort default.  
- `index.ts:1530` — sessionState fallback.  

All four paths write `VEGETATIVE` with no source identifier visible downstream (only context-validator tags it `DEFAULT`). Once the value enters `landContext`, it is indistinguishable from a real `VEGETATIVE`.

### RC-5 — Sanity override is a stage producer, not a guard  
`index.ts:1742-1759` does not pause the turn or request clarification — it **silently rewrites** `landContext.growth_stage` and `dataAudit.land.growth_stage` to the string `'GERMINATION'` whenever `(HARVEST|MATURITY) && DAS<100`. This bypasses every "lock" and every "authority" upstream.

**Runtime evidence:** logs `[SOWING_DATE_SOURCE]` (P1), `🔒 [ClarificationStrategy] Stage LOCKED` (P3 lock), `✅ GDD Stage` (P5 overwrite), `📊 G2 Growth Stage` (P4 overwrite), `🔒 [RenderContext] AUTHORITY OVERRIDE` (P8), and `🚨 SANITY CHECK FAILED` (P7) can all appear in **one turn**, each reporting a different stage value.

---

## 11. Production Risk Assessment

| ID | Issue | Severity | Evidence |
|----|-------|----------|----------|
| R1 | Module-global `_lockedStageContext` shared across requests in same Deno isolate | **CRITICAL** — cross-tenant stage bleed | `agents/clarification-strategy.ts:186`; used as fallback at `orchestrator.ts:1956` |
| R2 | `landContext.growth_stage` mutated post-canonical-freeze; canonical and runtime values diverge | **CRITICAL** | `orchestrator.ts:5087, 5932`; `index.ts:1564, 1753` vs frozen `canonical-context-contract.ts:202` |
| R3 | Three independent hardcoded ICAR calendars with different DAS ranges | **HIGH** | `orchestrator.ts:8588`, `crop-calendar-lookup.ts:469/529`, `context-validator.ts:83/449` |
| R4 | Silent sanity rewrite to `'GERMINATION'` (no clarification, no log to audit table) | **HIGH** | `index.ts:1742-1759` |
| R5 | `'VEGETATIVE'` default leaks without source tag in 3 of 4 sites | **HIGH** | `orchestrator.ts:8400, 1958`; `index.ts:1530` (only `context-validator.ts:293` tags `stage_source='DEFAULT'`) |
| R6 | DB-backed `crop_stage_master` (`getStageByDAS`) exists but is **not** the producer used by landContext — duplicate, drifting source of truth | **HIGH** | `utils/stage-knowledge-cache.ts:117` vs hardcoded `orchestrator.ts:8588` |
| R7 | `lands.current_crop_stage` column is read (logging only) but never used as authority; risk of UI/runtime mismatch | **MEDIUM** | `orchestrator.ts:1024, 1121, 1331` |
| R8 | GDD engine overwrites stage without recording `stage_source='GDD'` for downstream gates | **MEDIUM** | `orchestrator.ts:5087` |
| R9 | Session-persisted `last_growth_stage` reused as turn fallback (`index.ts:1530`) — stale stage across days | **MEDIUM** | `index.ts:1530` |
| R10 | `canonical-state-builder.ts:950` derives its own `stageSource` independently from `context-validator`'s `stage_source` | **MEDIUM** | duplicate source-tagging schemes |
| R11 | `lockClearForTurn` not invariantly invoked in a `try/finally` around the request | **MEDIUM** | search returns no `finally { clearLockedStage }` in orchestrator entry path |
| R12 | `current_crop_stage` (DB) vs `growth_stage` (runtime) field-name disagreement increases mapping mistakes | **LOW** | `index.ts:1024`, `decision/context-authority.ts:253` |
| R13 | `ACTIVE_TILLERING` token appears in DB / rules but **Not Found** as a code-side hardcoded literal — risk of unrecognized stage in code paths that compare against hardcoded enums | **LOW** | rg over `supabase/functions/ai-agriculture-chat/**` |

---

## 12. Required-Deliverable Index

1. **Stage Source Inventory** → §2 (P1-P7 + 5 mutators)  
2. **Stage Ownership Matrix** → §3  
3. **Stage Mutation Timeline** → §4 (T0-T13)  
4. **Database Dependency Graph** → §5 + §6  
5. **Code Dependency Graph** → §7  
6. **Hardcoded Stage Report** → §8  
7. **Duplicate SSOT Report** → §9 (5 chains)  
8. **Root Cause** → §10 (RC-1 through RC-5, all file:line cited)  
9. **Production Risk Assessment** → §11 (R1-R13, ranked)  

---

## 13. Authoritative Answer to the Audit Question

> **Which component has authority over crop stage today?**

**No single component does.** The de-facto first writer is `agents/orchestrator.ts:8380` (`calculateGrowthStage` over `crop_schedules.sowing_date`). The de-jure declared authority is `decision/canonical-context-contract.ts:202` (frozen `canonicalContext`). But the **last writer wins** at the LLM/response boundary, and the last writer is one of: GDD (`orchestrator.ts:5087`), G2 reconciliation (`orchestrator.ts:5932`), render-context (`index.ts:1564`), or the sanity override (`index.ts:1753`). The clarification subsystem additionally reads from a **process-global** lock (`clarification-strategy.ts:186`) that is not bound to the request.

Until those producers are consolidated into one calculator backed by `crop_stage_master` and the `landContext` object is sealed against post-canonical mutation, **stage values WILL diverge between the rule engine, the clarification generator, the UI response, and the audit log on the same turn.**

*End of forensic report. No code or database modifications were made.*
