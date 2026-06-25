# Plan: Runtime Audit — Clarification Engine Data Source

## Goal
Prove, with code + DB evidence, **whether the clarification engine actually queries `intent_observation_mapping`** at runtime, or whether it builds farmer-facing options from another source (bundled rules, `observation_master`, hardcoded fallback lists, cached observations, or legacy logic). Trace one concrete request end-to-end:

- **Intent:** `EMERGENCE_FAILURE`
- **Crop:** Rice
- **Stage:** SEEDLING
- **DAS:** 17

No code or DB changes — read-only forensic audit producing a written report.

## Investigation Steps

### 1. Static call-graph audit (code)
Map every clarification entry point and trace which source each one reads from. Files to inspect:

```text
agents/clarification-generator.ts
agents/clarification-renderer.ts
agents/clarification-strategy.ts
agents/clarification-scope-resolver.ts
agents/dynamic-clarification-generator.ts
agents/diagnostic-flow-controller.ts
agents/deterministic-response-builder.ts
decision/differential-diagnosis-clarifier.ts
decision/intent-resolver.ts
decision/db-observation-validator.ts
runtime/clarification-authority.ts
bundled-rules/loader.ts
agents/orchestrator.ts   (call sites for clarification subsystem)
```

For each, record:
- Whether it queries `intent_observation_mapping` (direct, via `intent-resolver`, or not at all)
- Alternative sources used: `observation_master`, `decision_rules.observable_characteristics`, `BASE_TEMPLATES`, `cross-crop-symptom-ontology`, in-memory caches, hardcoded enums
- Which function the orchestrator actually invokes for the runtime path

### 2. Runtime trace for the target request
Use the existing `[BRAIN_TRACE]` / `[ClarificationLog]` logs in `ai-agriculture-chat` edge function. Filter by a freshly issued request matching:

- `intent=EMERGENCE_FAILURE`, `crop=Rice/RICE`, `stage=SEEDLING`, `DAS=17`

Capture from logs and source-grep:
- Which generator function the orchestrator called
- Whether any line logs a query against `intent_observation_mapping`
- The candidate observation codes before filtering
- The final option list sent to the farmer

### 3. Direct DB inspection (read-only)
For the same intent/context, manually issue the equivalent of what the runtime *should* run:

```sql
-- a) base mapping rows for the intent
SELECT * FROM intent_observation_mapping WHERE intent_code = 'EMERGENCE_FAILURE';

-- b) after crop filter (rice variants)
... WHERE crop_code IN ('rice','RICE','all','*','universal');

-- c) after stage filter (SEEDLING family)
... AND (stage_code IS NULL OR stage_code IN ('SEEDLING','GERMINATION','NURSERY','EMERGENCE','ESTABLISHMENT'));

-- d) after DAS filter (17)
... AND (das_min IS NULL OR das_min <= 17) AND (das_max IS NULL OR das_max >= 17);
```

Plus comparison queries against alternate sources the code may actually be using:
- `observation_master` rows tagged with `EMERGENCE_FAILURE`
- `decision_rules` rows with `intent_code='EMERGENCE_FAILURE'` and their `observable_characteristics`
- `observation_intent_master` cross-check

### 4. Reconcile runtime vs DB
For each filter stage, compare:
- Rows the DB *can* return vs rows the runtime *actually used*
- Identify the exact line where the pipeline diverges from `intent_observation_mapping` (if it does)
- Confirm whether stage equivalence (SEEDLING family) and DAS bounding are applied in code or silently skipped

## Deliverable

Single report written to `/mnt/documents/CLARIFICATION_DATA_SOURCE_AUDIT.md` containing:

1. **Verdict** — does the clarification engine query `intent_observation_mapping`? (yes / no / partial, with file:line evidence)
2. **Actual data source** used at runtime (with call chain)
3. **Per-stage trace table** for EMERGENCE_FAILURE / Rice / SEEDLING / DAS 17:

   | Stage | Source | Query / Filter | Row count | Notes |
   |---|---|---|---|---|
   | SQL issued vs `intent_observation_mapping` | … | … | … | … |
   | After crop filter | … | … | … | … |
   | After stage filter | … | … | … | … |
   | After DAS filter | … | … | … | … |
   | Final clarification candidates | … | … | … | … |
   | Final options sent to farmer | … | … | … | … |

4. **Gap analysis** — every place runtime diverges from the intended `intent_observation_mapping` path, with file:line and proposed (not applied) fix direction.
5. **Evidence appendix** — relevant log excerpts and raw SQL result counts.

No code edits, no migrations. Switch to build mode only if you want me to apply fixes after reading the report.
