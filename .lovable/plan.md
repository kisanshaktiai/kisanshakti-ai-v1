
# Variety-Aware Integration — Phase 1 Audit (Written Reports Only)

You picked **Full written audit first**, **AI Crop Schedule as P0**, schema changes allowed in the next round, and VarietyContext to land in **chat + proactive + schedules-api + frontend land/plan UI**. This round produces audit reports only — zero code/schema edits. After you approve the findings, a second plan will sequence the migrations + integration work.

## Deliverables (all written to `docs/variety-audit/`)

### 1. `01-database-audit.md`
Full inventory of every table that should (or does) participate in variety intelligence.

- **Variety core**: `master_products` (seed rows), `variety_resistance`, `variety_source_references`, `variety_translations`, `variety_review_queue`, `master_companies`, `master_product_variety_crops`, `v_crop_varieties`.
- **Consumers discovered**: `lands` (`variety_id`, plus `intercrop_variety`, `intercrop_2/3_variety` — currently free text), `farmer_plans` (`current_crop_variety_id`), `crop_schedules`, `schedule_tasks`, `schedule_monitoring`, `schedule_climate_monitoring`, `land_crops`, `land_activities`, `land_agent_context`, `crop_growth_*`, `crop_health_assessments`, `ai_schedule_refinements`, `ai_decision_log`, `proactive_alerts`, `proactive_evaluation_log`, `hypotheses` / `hypothesis_conditions`, `decision_rules`, `intent_observation_mapping`, `observation_master`.
- For each table, list: present FK, missing FK to `master_products(id)`, columns that duplicate variety facts, candidate indexes, null-rate of `*_variety_id` columns, and whether RLS + GRANTs are aligned.
- Flag orphan rows (e.g. `lands.variety_id` pointing at non-seed or deleted `master_products`), duplicate variety codes per crop, conflicting maturity / yield ranges, missing translations for app languages, resistance rows whose `observation_code` isn't in `observation_master`.
- Output: relationship matrix + a ranked list of **Missing FK / Index / Trigger** items with proposed DDL (for the next round).

### 2. `02-ai-crop-schedule-audit.md` (P0)
Trace the current `ai-smart-schedule` pipeline end-to-end:

- `index.ts` → land/state resolver → `variety-context-loader.ts` (Phase 3 already wired) → `lean-prompt-builder.ts` → `agro-knowledge-base.ts` → `scientific-validator.ts` → `decision-graph-integration.ts` → `post-processor.ts`.
- Document where generic crop defaults still win over variety facts (maturity, irrigation interval, seed rate, spacing, yield target, stage windows).
- Audit `getMaxDASForCrop()` fallback chain vs. the contract in `mem://database/variety-master-schema-v1`.
- Map each of the six required intelligences (Maturity / Irrigation / Yield / Climate / Soil / Regional) to the exact file + function that must change, and the DB columns it must read.
- List every place `crop_schedules` / `schedule_tasks` is written and whether `variety_id` is persisted.
- Output: gap table — *"Intelligence × Current behavior × Required behavior × File:Line × Data source"*.

### 3. `03-symbolic-brain-audit.md`
Walk the `ai-agriculture-chat` graph: orchestrator → understanding layer → observation routing → hypothesis evaluator → rule engine → unified decision gate → deterministic response builder → narration.

- Identify every confidence-scoring site that should down/up-weight by `variety_resistance.resistance_level` (HR/R/MR/MS/S).
- Identify every recommendation site that should suppress prophylactic chemical advice when the variety is R/HR for the target pathogen, and substitute monitoring per project Core rule.
- Audit narration layers to confirm they will surface the actual variety name + local label without violating the canonical-language and ALL_CAPS-stripping rules.
- Cross-check against memories: `symbolic-confidence-ssot-authority`, `deterministic-response-builder`, `agronomic-safety-and-regulatory-gating`, `farmer-response-json-contract`.

### 4. `04-variety-context-surfaces-audit.md`
For each consumer you selected, document current state + required wiring:

- **ai-agriculture-chat**: where to inject `VarietyContext`, prompt block format reuse from `formatVarietyProfileForPrompt`, dedup with land context.
- **Proactive evaluator / alerts**: gate disease rules by resistance level; gate irrigation alerts by `water_demand_mm_per_season` + `irrigation_sensitivity.critical_stages`; persist `variety_id` on `proactive_alerts`.
- **schedules-api + farmer_plans**: response payload additions, variety badge fields, `variety_id` persistence on every insert/update path.
- **Frontend land/plan UI**: components touched (`VarietySelector`, land cards, schedule view, plan detail) — what badges/chips/warnings to render from `VarietyContext` (resistance chips, suitability warning, availability flag, data-confidence pill). No design exploration — reuses existing tokens.

### 5. `05-backlog-and-migration-plan.md`
Single prioritized backlog the next plan will execute. Each item carries: title, file/table touched, risk, estimated migration SQL, and rollout order. Top-of-list draft (subject to audit findings):

1. Migration: add FK `lands.variety_id → master_products(id)`, partial index `WHERE product_type='seed'`, validation trigger rejecting non-seed rows. Same for `farmer_plans.current_crop_variety_id`, `crop_schedules.variety_id`, intercrop variety columns (resolve text → uuid).
2. Migration: composite indexes on `variety_resistance(variety_id, observation_code)`, `variety_translations(variety_id, language_code)`, GIN on `master_products.state_suitability_ids`, `agro_ecological_suitability`.
3. Migration: `variety_completeness_score` trigger (replaces ad-hoc backfill bump).
4. Shared `VarietyContext` loader extracted from `ai-smart-schedule/variety-context-loader.ts` into `supabase/functions/_shared/variety-context.ts` so chat, proactive evaluator, and schedules-api consume the same SSOT.
5. AI Crop Schedule wiring of the six intelligences (P0).
6. Symbolic brain resistance-aware confidence + recommendation suppression.
7. Proactive evaluator gating + `variety_id` persistence.
8. Frontend land/plan UI surfacing.
9. Data-quality validation rules + completeness scoring.
10. Performance pass: N+1 fixes, query plans, caching.

## Technical Details

- **Audit method**: read-only `supabase--read_query` for schema/FK/index introspection (`information_schema`, `pg_indexes`, `pg_constraint`); `rg` for code call-sites; no migrations, no edits.
- **Scope guard**: reports describe *what to change* and *why*; the actual DDL + code changes are deferred to the implementation plan you approve next.
- **Cross-references**: every finding cites the relevant `mem://` memory so future sessions stay aligned with project invariants (100% DB-sourced advice, canonical language, deterministic builder, etc.).
- **Out of scope this round**: writing migrations, editing edge functions, touching the frontend, modifying memory files (memory updates happen alongside the implementation round).

## Acceptance

Five markdown reports under `docs/variety-audit/` totalling the audit. You review, mark accepted/rejected items in `05-backlog-…md`, and I return with a focused implementation plan starting with the P0 AI Crop Schedule wiring.
