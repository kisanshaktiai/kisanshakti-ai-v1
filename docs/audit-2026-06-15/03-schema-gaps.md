# Phase 3 — Schema Validation

## Foreign-key integrity ✅

All expected FKs exist and are enforced:

```
decision_rules.condition_code              → observation_master.observation_code  (ON UPDATE CASCADE, ON DELETE RESTRICT)
intent_observation_mapping.observation_code→ observation_master.observation_code
intent_observation_mapping.intent_code     → observation_intent_master.intent_code
observation_translations.observation_code  → observation_master.observation_code
observation_aliases.canonical_code         → observation_master.observation_code
intent_translations.intent_code            → observation_intent_master.intent_code
hypothesis_conditions.hypothesis_id        → hypothesis_master.hypothesis_id
hypothesis_rule_mapping.hypothesis_id      → hypothesis_master.hypothesis_id
hypothesis_rule_mapping.rule_id            → decision_rules.rule_id
```

No orphan rows detected in any of these relationships (see Phase 4).

## Index coverage ✅

Hot-path queries are covered:
- `idx_decision_rules_crop_active`, `idx_dr_crop_stage`, `idx_dr_condition_code`
- `idx_iom_intent_crop`, `idx_iom_crop_das`, `idx_iom_stage`
- `idx_hypothesis_master_crop_active`, `idx_hypothesis_crop`
- `idx_obs_master_canonical`, `idx_obs_master_category`

Note: `idx_decision_rules_condition_code` shows `idx_scan=2, idx_tup_read=0` — overlaps with `idx_dr_condition_code` (48k tup_read). Drop one as a low-priority cleanup.

## Gaps

### G1. Missing `version_hash` on all ontology tables
Critical for auditability ("which version of `RICE_GERMINATION_DIAGNOSTIC_001` did this advice come from?"). Versioning tables exist (`rule_versions`, `hypothesis_versions`, `observation_versions`) but the live rows have no hash to pin a decision to a specific historical version.

**Draft migration:** `migrations-draft/03-add-version-hash.sql`

### G2. Missing `created_at` / `updated_at` on
- `hypothesis_metrics` (none)
- `hypothesis_rule_mapping` (none)
- `rule_conflict_matrix` (none)
- `advisory_audit_log` (no `created_at`)

**Draft migration:** `migrations-draft/03-add-audit-cols.sql`

### G3. Missing `updated_at` trigger on tables that have the column
Several reference tables (`crop_stage_master`, `intent_observation_mapping`, etc.) have `updated_at` but no trigger to maintain it. Verify against `pg_trigger`.

### G4. Tenant scoping
Reference tables (`decision_rules`, `hypothesis_master`, `observation_master`, `intent_observation_mapping`) intentionally lack `tenant_id` — they are global ontology. **Document this contract** in `mem://architecture/symbolic-decision-brain-architecture-v1`. If tenant-specific overrides are needed in the future, introduce override tables (`decision_rules_overrides(tenant_id, rule_id, ...)`) rather than mutating the global rows.

## No issues found

- Nullability on PK columns: correct.
- RLS enabled on every multi-tenant table sampled (20/20).
- All FK relationships present and enforced.
- No CHECK constraints using non-immutable predicates.
