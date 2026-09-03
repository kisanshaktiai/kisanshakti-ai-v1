# Crop Schedule Evidence Pack → Harness v3

## Purpose

The crop schedule is not a crop-specific calendar template. It is a context-specific plan composed from database-backed agronomic evidence.

## Contract

`DB evidence + resolved farmer/land context -> AgronomicEvidencePack -> Harness plan -> RAG/Decision Brain validation -> existing schedule_tasks persistence -> dynamic reconciliation`

The database remains the agronomic SSOT. TypeScript performs retrieval, normalization, graph construction and validation. The LLM may compose only from supplied candidates.

## Candidate semantics

A candidate is a possible agronomic intervention or evidence item, not automatically a task.

Domains:

- LAND_PREPARATION
- SEED_TREATMENT
- PLANTING
- NUTRIENT
- MICRONUTRIENT
- ORGANIC_INPUT
- BIOLOGICAL_INPUT
- IRRIGATION
- WEED
- PEST
- DISEASE
- PGR
- INTERCULTURAL
- MONITORING
- HARVEST
- POST_HARVEST
- MANAGEMENT

Candidate status:

- SCHEDULED: validated intervention can be materialized now.
- CONDITIONAL: intervention is valid only when its supplied trigger/evidence is satisfied.
- MONITOR: observation/scouting knowledge; no treatment is implied.
- INSUFFICIENT_DATA: evidence exists but is insufficient to authorize an application.

## Non-negotiable safety rules

1. Never invent dose, product, PHI, stage, date, trigger, regulatory status or evidence.
2. A stage guideline requirement is not automatically an application dose.
3. Micronutrient evidence without an authoritative application form/dose remains evidence-only.
4. Observation-triggered pesticide/herbicide/disease actions remain conditional until the Decision Brain has the required observation/trigger.
5. PGRs are contextual candidates, never universal crop tasks.
6. Product resolution is downstream of agronomic validation; commercial catalog data is not agronomic authority.
7. Required deterministic baseline candidates are always retained.
8. Optional evidence candidates are selected by Harness only when their supplied evidence supports selection.
9. Harness failure falls back to the existing deterministic baseline; it never invents agronomy.
10. RAG validates/supports evidence and may not create missing agronomic facts.

## Why this scales

A new crop or variety does not require a new TypeScript schedule algorithm. New authoritative evidence becomes additional candidate material. Variety, method, cycle, soil, weather, NDVI, GDD and later IoT signals become context used to select and activate candidates.

The static plan is therefore a baseline hypothesis of field operations. The Decision Brain and existing schedule reconciler remain responsible for dynamic activation, deferral, cancellation and re-anchoring as field state changes.

## Current implementation boundary

`harness/evidence-pack.ts` provides the first evidence-aware candidate layer. `harness/candidate-graph.ts`, `harness/types.ts`, `harness/validator.ts` and `harness/llm-v3.ts` support optional candidate composition while preserving required baseline tasks and deterministic fallback.

The next integration step is to pass the complete resolved `ResolvedInputs` and selected stage graph into the evidence-pack builder from `ai-smart-schedule/index.ts`, so variety, region, soil fertility, language and future context signals are available to candidate filtering without adding crop-specific code.

No DB schema change is required for this architectural step.
