# Apply Order — Migration Plan v3 (DRAFT — DO NOT APPLY)

Verified against live schema 2026-06-17. All files are transactional, idempotent, and ship with sibling rollback + post-apply-check scripts.

| # | File | Depends on | Blocked by |
|---|------|-----------|------------|
| 1 | `01-add-audit-cols.sql` | — | — |
| 2 | `CI-gate.md` (lint enforcement, not SQL) | — | — |
| 3 | `02-stage-1-shadow-columns.sql` | 01 | CI lint live in repo |
| 4 | `03-add-version-hash.sql` | 01 | — |

Each SQL file:

- Has copy-paste pre-flight block at the top (no `\i` includes — portable to Supabase SQL editor / pgAdmin / psql).
- Is wrapped in `BEGIN; ... COMMIT;`.
- Ships with `*-rollback.sql` and `*-post-apply-check.sql`.

Stage-2 dual-read shim and Stage-3/4/5 of the Phase 9 lowercase migration are scoped in a separate, future plan and are NOT part of this set.

## Live-schema baseline (read-only check, 2026-06-17)

```text
advisory_audit_log      rows = 0
hypothesis_metrics      rows = 67
hypothesis_rule_mapping rows = 1,810
rule_conflict_matrix    rows = 0
decision_rules          rows = 1,852
hypothesis_master       rows = 346
observation_master      rows = 2,537
pg_proc.set_updated_at exists = false  (no collision; rename to audit_set_updated_at still adopted)
```

## Hash policy (applies to File 3)

Identity columns (`rule_id`, `hypothesis_id`, `observation_code`) MUST NOT appear in their own `version_hash` formula. Identity is the row key, not its content. Including identity (a) breaks "same content ⇒ same hash" equality and (b) causes every hash to churn when the Phase 9 lowercase flip rewrites identities. Full audit trail (child rows, snapshot at decision time) lives in `ai_decision_log`, not `version_hash`.

Option **(a)** adopted: row-columns-only hash. Child-row changes do NOT bump parent hash by design.
