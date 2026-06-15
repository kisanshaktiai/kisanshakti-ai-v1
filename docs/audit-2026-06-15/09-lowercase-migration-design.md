# Phase 9 — Phased Lowercase ID Migration (DESIGN ONLY)

**Scope:** `decision_rules.rule_id` (1,852 rows) + `hypothesis_master.hypothesis_id` (346 rows). `observation_master` is already canonical lowercase — excluded.

**Goal:** all symbolic IDs follow `lowercase_snake_case` with consistent prefixes (`rule_`, `hyp_`).

**Non-goals:** renaming tables, renaming columns, changing observation codes, changing intent codes (already lowercase).

## Stage map

```text
Stage 0 — Freeze (immediate, code-only)
  Add CI lint: reject new authoring of UPPER_SNAKE rule_id / hypothesis_id.
  No DB change.

Stage 1 — Shadow columns (additive, zero-risk)
  ALTER TABLE decision_rules
    ADD COLUMN IF NOT EXISTS rule_id_lc text
      GENERATED ALWAYS AS (
        'rule_' || lower(regexp_replace(rule_id, '^(RULE_)?', ''))
      ) STORED;
  CREATE UNIQUE INDEX IF NOT EXISTS decision_rules_rule_id_lc_key
    ON public.decision_rules(rule_id_lc);
  -- same pattern for hypothesis_master.hypothesis_id_lc

  Behavior: zero. Both columns coexist; FKs unchanged.

Stage 2 — Dual-read in code (no DB change)
  Loaders normalize incoming id at boundary: lookup tries `id` then `id_lc`.
  Logs emit both. Bundled JSON + memory updated to lowercase ids for new authoring.
  Old fixtures continue to work.

Stage 3 — Dual-write (additive, low-risk)
  New rules authored with lowercase ids. Backfill mapping table:
    CREATE TABLE rule_id_map (lc text PRIMARY KEY, uc text NOT NULL UNIQUE);
  Populate from current rows. FK consumers (hypothesis_rule_mapping) gain
  a parallel rule_id_lc column maintained by trigger.

Stage 4 — Flip canonical (single transaction, requires brief code freeze)
  BEGIN;
    -- Drop FKs that point at UPPER PK
    ALTER TABLE hypothesis_rule_mapping
      DROP CONSTRAINT fk_hrm_rule_id;
    -- Promote lc to PK
    ALTER TABLE decision_rules
      DROP CONSTRAINT decision_rules_pkey,
      DROP COLUMN rule_id_lc,
      ALTER COLUMN rule_id TYPE text USING ('rule_' || lower(regexp_replace(rule_id,'^(RULE_)?',''))),
      ADD PRIMARY KEY (rule_id);
    -- Backfill child column same way
    UPDATE hypothesis_rule_mapping
      SET rule_id = 'rule_' || lower(regexp_replace(rule_id,'^(RULE_)?',''));
    ALTER TABLE hypothesis_rule_mapping
      ADD CONSTRAINT fk_hrm_rule_id FOREIGN KEY (rule_id) REFERENCES decision_rules(rule_id);
  COMMIT;
  -- Same shape for hypothesis_master.hypothesis_id

  Risk: requires all readers on Stage-2 dual-read code. ON UPDATE CASCADE on
  decision_rules.condition_code is unaffected (observation codes untouched).

Stage 5 — Drop dual-read code paths
  Remove normalization shims; canonical lowercase only. Drop rule_id_map.
```

## Blast radius per stage

| Stage | DB rows touched | Code paths touched | Downtime | Reversible |
|---|---|---|---|---|
| 0 | 0 | CI config | none | trivial |
| 1 | 0 (alter) | 0 | none | drop column |
| 2 | 0 | loaders + memory | none | revert PR |
| 3 | ~2,200 | authoring tool | none | drop map |
| 4 | 2,198 + ~600 mappings | every reader | seconds (single tx) | restore from PITR + revert PR |
| 5 | 0 | shim removal | none | revert PR |

## Rollback SQL (Stage 4 → Stage 3)

```sql
-- Restore UPPER ids from rule_id_map snapshot
BEGIN;
  UPDATE decision_rules dr
    SET rule_id = m.uc
    FROM rule_id_map m WHERE m.lc = dr.rule_id;
  UPDATE hypothesis_rule_mapping h
    SET rule_id = m.uc
    FROM rule_id_map m WHERE m.lc = h.rule_id;
COMMIT;
```

## Hard prerequisites before Stage 4

- All edge-function code on Stage-2 dual-read (`scope.db` consolidated).
- `decision_rules_translations_archive` re-keyed by lowercase rule_id (or dual-keyed).
- Snapshot triggers updated to write lowercase to `*_versions` tables.
- Backup verified (PITR window confirmed).

## Out of scope for this design

- Observation code renames (already lowercase).
- Intent code renames (already lowercase).
- Table or column renames.

Draft DDL: `migrations-draft/09-stage-1-shadow-columns.sql`. **Not executed.**
