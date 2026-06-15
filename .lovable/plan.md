
# AI Chat + Symbolic Decision Brain — Forensic Audit Plan

**Mode:** Read-only audit. No schema changes, no code edits, no data writes during this engagement. All deliverables are reports + design docs under `docs/audit-2026-06-15/`. Migration SQL is *drafted* only — never executed.

**Confirmed baseline (live DB, just queried):**
- 1,852 decision_rules (1,846 active) — **0** match lowercase pattern
- 346 hypothesis_master — **0** lowercase
- 2,537 observation_master — **0** lowercase
- 13,446 intent_observation_mapping rows
- Canonical convention in production = `UPPER_SNAKE_CASE` (e.g. `OBS_RICE_NO_EMERGENCE`, `RICE_GERMINATION_DIAGNOSTIC_001`)

A rename to lowercase touches 100% of rule/observation/hypothesis IDs plus every edge-function code path, every memory rule, every bundled JSON, every test fixture. Treated as a multi-week phased migration — designed here, not executed.

---

## Phase 1 — Discovery & Inventory (read-only)

For each table group below: row counts, null distribution on key cols, FK integrity, RLS state, presence of audit cols (`created_at`/`updated_at`/`deleted_at`/`version_hash`), indexes vs. actual query patterns from `pg_stat_statements`.

Tables in scope:
- Chat: `ai_chat_sessions`, `ai_chat_messages`, `ai_chat_audit_logs`, `ai_chat_analytics`
- Rules: `decision_rules`, `rule_versions`, `rule_quality_metrics`, `rule_approval_workflow`, `rule_lineage`, `rule_conflict_matrix`, `rule_explainability`, `rule_performance`
- Hypotheses: `hypothesis_master`, `hypothesis_conditions`, `hypothesis_rule_mapping`, `hypothesis_metrics`, `hypothesis_contradictions`, `hypothesis_integrity_alerts`, `hypothesis_versions`
- Ontology: `observation_master`, `observation_aliases`, `observation_translations`, `observation_intent_master`, `observation_differential_questions`, `observation_versions`
- Intent: `intent_observation_mapping`, `intent_translations`, `canonical_hint_mapping`
- Crop: `crop_vocabulary`, `crop_synonyms`, `crop_stage_master`, `crop_baseline_guidelines_v2`, `crop_groups`, `crops`
- Safety: `etl_standards`, `chemical_regulatory_status`
- Audit: `ai_decision_log`, `advisory_audit_log`, `hallucination_detection_logs`, `semantic_bridge_metrics`, `orchestrator_metrics`

**Deliverable:** `docs/audit-2026-06-15/01-inventory.md`

## Phase 2 — Naming Standards Audit

Classify every identifier (table, column, enum value, JSON key, rule_id, hypothesis_id, observation_code, intent_code, crop_code) against the target standard:
- Tables/columns/enums → `lowercase_snake_case`
- Ontology/rule/intent/hypothesis IDs → `lowercase_snake_case` with prefix (`obs_`, `rule_`, `hyp_`, `intent_`)

Output: violation table with current value, proposed value, blast radius (row count + code references).

**Deliverable:** `docs/audit-2026-06-15/02-naming-violations.csv` + `.md` summary.

## Phase 3 — Schema Validation

For every table in scope:
- Nullability / default sanity
- FK presence (especially `decision_rules.rule_id` ↔ `hypothesis_rule_mapping`, `observation_master.observation_code` ↔ `intent_observation_mapping`, `decision_rules.condition_code` ↔ `observation_master`)
- Index coverage vs. hot queries (rule lookup by crop_code+condition_code+is_active, observation lookup by code, intent mapping by intent_code)
- RLS on multi-tenant tables; flag any tenant-scoped table missing tenant_id or with RLS off
- Missing audit columns

**Deliverable:** `docs/audit-2026-06-15/03-schema-gaps.md` + draft additive migration SQL (indexes, missing FKs, audit cols, version_hash trigger) — **drafted only**.

## Phase 4 — AI Data Standardization

Cross-table referential audit:
- Orphan `condition_code` in `decision_rules` not in `observation_master`
- Orphan `observation_code` in `intent_observation_mapping`
- Orphan `rule_id` in `hypothesis_rule_mapping`
- Duplicate rules (same crop_code + condition_code + growth_stage + is_active)
- `decision_rules.category` values not registered in `mapBundledCategory` (cross-checks code memory)
- Observation aliases violating "no cause encoding" rule (`*_DEFICIENCY_*`, `*_TOXICITY_*`)
- `decision_rules.conditions_json.das_range` vs. `crop_stage_master` window consistency

**Deliverable:** `docs/audit-2026-06-15/04-data-integrity.md` with row-level evidence.

## Phase 5 — Rule + Hypothesis Engine Validation

- Contradiction matrix: rules with same trigger but conflicting `action_type`/`farmer_safety_level`
- Priority collisions inside the same crop_code+condition_code+growth_stage cohort
- Hypotheses with no conditions or no rule mapping
- Rules with no translation row in `decision_rules_translations_archive` for `mr`/`hi`
- `farmer_safety_level` distribution and any UNSAFE rule reachable through observation bypass

**Deliverable:** `docs/audit-2026-06-15/05-rule-hypothesis-health.md`.

## Phase 6 — Codebase ↔ Schema Drift

Static scan of `supabase/functions/ai-agriculture-chat/**` + `src/**` to confirm:
- Every `.from('<table>').select('<col>')` references an existing column
- camelCase ↔ snake_case bridge points (e.g. `cropCode` vs `crop_code`) — list each translation site
- Loaders that risk PostgREST 1000-row truncation without `.range()` pagination (per existing memory)
- Hardcoded agronomic vocabulary still present after recent fixes (rice/sugarcane/etc.)
- Module-level `let`/singleton DB clients (cross-tenant leakage risk) — extends existing `_audit/2026-06-13-leakage-inventory.md`

**Deliverable:** `docs/audit-2026-06-15/06-code-schema-drift.md` with file:line evidence. No edits.

## Phase 7 — AI Runtime Audit

Walk the request path: `index.ts` → `RequestScope` → orchestrator → intent-classifier → layered-rule-evaluator → symbolic-reasoner → unified-decision-gate → response-generator → audit-logger.

Check:
- All mutable state lives on `RequestScope` (no module-level `let _state`)
- All `createClient(` sites consolidated on `scope.db` (baseline = 16 sites per existing audit)
- Per-tenant cache keys; unbounded `Map` flagged
- Fail-closed boundaries (typed errors, not silent `return []`)
- Determinism: same input → same output (no `Date.now()`/`Math.random()` in decision path)

**Deliverable:** `docs/audit-2026-06-15/07-runtime-audit.md` extending the existing W1 inventory.

## Phase 8 — Vectors

**N/A** — no pgvector table exists. Section will note "deferred; add when RAG is introduced" with a one-page recommended schema for future use.

## Phase 9 — Phased Lowercase ID Migration Design (DESIGN ONLY)

Designed but not run. Five stages, each independently revertible:

```text
Stage 0  Freeze: lock authoring of new UPPER_SNAKE IDs in code review
Stage 1  Add lowercase alias columns (rule_id_lc, observation_code_lc, hypothesis_id_lc)
         + computed lowercase value + unique index. Zero behavior change.
Stage 2  Dual-read in loaders: accept either case, normalize to UPPER on input,
         emit both in logs. Bundled JSON + memory rules updated to lowercase
         where they reference IDs in narration, never in lookup.
Stage 3  Dual-write: new rules authored lowercase; old rows backfilled into
         lowercase PK shadow tables. Translations + mappings dual-keyed.
Stage 4  Flip canonical: PKs become lowercase via RENAME + FK cascade in a
         single transactional migration. UPPER columns retained as aliases
         for one release.
Stage 5  Drop UPPER aliases.
```

Rollback SQL drafted for each stage. All migrations idempotent (`IF EXISTS`/`IF NOT EXISTS`). Blast-radius table per stage: rows touched, code paths touched, expected downtime (target: zero).

**Deliverable:** `docs/audit-2026-06-15/09-lowercase-migration-design.md` + `migrations-draft/*.sql` (not applied).

## Phase 10 — Production Readiness Scorecard

Score 0–100 across: Architecture, Multi-tenancy, AI Safety, Determinism, Scalability, Data Quality, Auditability. Each dimension cites evidence from phases 1–7.

**Deliverable:** `docs/audit-2026-06-15/10-readiness-score.md`.

---

## Index of deliverables

```text
docs/audit-2026-06-15/
  00-executive-summary.md
  01-inventory.md
  02-naming-violations.{csv,md}
  03-schema-gaps.md
  04-data-integrity.md
  05-rule-hypothesis-health.md
  06-code-schema-drift.md
  07-runtime-audit.md
  08-vectors-deferred.md
  09-lowercase-migration-design.md
  10-readiness-score.md
  migrations-draft/   (SQL drafts, not applied)
```

## Hard guarantees

- No `supabase--migration`, no `supabase--insert`, no edge-function deploys, no file edits to `src/**` or `supabase/functions/**` during this audit.
- Every claim in every report cites either a live SQL query (with the exact query embedded) or a `file:line` reference.
- Production data and business logic preserved 1:1.
- Lowercase migration design is reviewed and approved by you before any Stage 1 execution is proposed in a separate build-mode plan.
