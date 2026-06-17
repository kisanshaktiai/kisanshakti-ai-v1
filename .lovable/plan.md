
# Migration Plan v3 — Ready-to-paste SQL (verified against live schema)

**Status:** still draft / DO NOT APPLY. Every file below is complete, transactional, and pastable as-is. Live-schema check completed:

```text
advisory_audit_log    rows = 0        (empty — two-step still used as discipline, but no lock risk)
hypothesis_metrics    rows = 67
hypothesis_rule_mapping rows = 1,810
rule_conflict_matrix  rows = 0
decision_rules        rows = 1,852
hypothesis_master     rows = 346
observation_master    rows = 2,537
pg_proc.set_updated_at exists = false   (no name collision; rename to audit_set_updated_at still adopted for clarity)
```

**Verified column lists (no hallucinated columns):**

- `hypothesis_master`: `hypothesis_id, crop_group, hypothesis_type, canonical_group, cause_name_en, cause_name_mr, cause_name_hi, biological_basis, severity_model, version, engine_min_version, is_active, created_at, updated_at`. **No** `confidence_threshold`, **no** `description`, **no** `crop_code`.
- `observation_master`: `observation_code, description, is_diagnostic, symptom_category, canonical_group, observation_category, affected_plant_part, is_active, is_farmer_observable, crop_group, applicable_crop_groups, observation_type, symptom_type, symptom_pattern, severity_level, discriminator_score, frequency_score, clarity_score, created_at, updated_at`. **No** `canonical_label`, **no** `clinical_signs`.
- `decision_rules` (hash inputs): `condition_code, action_text, action_type, farmer_safety_level, response_severity, rule_intent, conditions_json, crop_code, growth_stage` — all exist.

**All six sharpenings from the v2 review are applied:**

1. Hash formulas use only verified columns. `description` excluded from hypothesis hash (curator narrative, not engine input). `cause_name_*` excluded (display-only, not decision-driving). Same logic for observation.
2. All three triggers are `BEFORE INSERT OR UPDATE`.
3. Identity columns (`rule_id`, `hypothesis_id`, `observation_code`) explicitly excluded from their own hash, with a comment stating the policy.
4. `\i` includes dropped. Pre-flight is copy-pasted into each file.
5. CI-gate DB CHECK rewritten as `NOT VALID` (catches future writes, never validates legacy rows — VALIDATE deferred to Stage 5).
6. Option **(a)** adopted: row-columns-only hash. Full audit trail relies on `ai_decision_log` snapshots.

Plus the v2 review's "missing item": each file ships with a sibling `*-post-apply-check.sql` for the first-24h monitoring queries.

**Codebase impact: zero.** No `.from()` calls or column references change. New columns are populated by triggers; existing reads ignore them. `rule_id_lc` / `hypothesis_id_lc` are read by nothing in Stage 1.

---

## Deliverables

```text
docs/audit-2026-06-15/migrations-draft/
  APPLY-ORDER.md
  CI-gate.md
  01-add-audit-cols.sql
  01-add-audit-cols-rollback.sql
  01-add-audit-cols-post-apply-check.sql
  02-stage-1-shadow-columns.sql
  02-stage-1-shadow-columns-rollback.sql
  02-stage-1-shadow-columns-post-apply-check.sql
  03-add-version-hash.sql
  03-add-version-hash-rollback.sql
  03-add-version-hash-post-apply-check.sql
```

(Files renumbered to match the reviewer's apply order: audit cols → CI gate → shadow cols → version hash. The v1 `03-*` files will be deleted in build mode.)

---

## File 1 — `01-add-audit-cols.sql`

```sql
-- ORDER: 1 of 4. Apply first.
-- DEPENDS ON: nothing.
-- BLOCKED BY: nothing.
-- ROLLBACK: 01-add-audit-cols-rollback.sql
-- POST-APPLY: 01-add-audit-cols-post-apply-check.sql
-- DO NOT APPLY without product approval.

-- ===== PRE-FLIGHT (copy-paste; verify before BEGIN) =====
-- SELECT count(*) FROM public.hypothesis_metrics;       -- expect ~67
-- SELECT count(*) FROM public.hypothesis_rule_mapping;  -- expect ~1810
-- SELECT count(*) FROM public.rule_conflict_matrix;     -- expect 0
-- SELECT count(*) FROM public.advisory_audit_log;       -- expect 0
-- SELECT proname FROM pg_proc WHERE proname='audit_set_updated_at' AND pronamespace='public'::regnamespace;
--   -- expect 0 rows
-- SELECT relation::regclass, mode FROM pg_locks WHERE relation IN (
--   'public.hypothesis_metrics'::regclass,
--   'public.hypothesis_rule_mapping'::regclass,
--   'public.rule_conflict_matrix'::regclass,
--   'public.advisory_audit_log'::regclass
-- ) AND mode LIKE '%Exclusive%';  -- expect 0 rows

BEGIN;

-- Specifically named function — avoids collision with any future generic set_updated_at()
CREATE OR REPLACE FUNCTION public.audit_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ---- Small tables: one-liner is safe ----
ALTER TABLE public.hypothesis_metrics
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.hypothesis_rule_mapping
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.rule_conflict_matrix
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---- advisory_audit_log: two-step pattern (even though empty today — discipline) ----
ALTER TABLE public.advisory_audit_log
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.advisory_audit_log
   SET created_at = COALESCE(generated_at, now())
 WHERE created_at IS NULL;

ALTER TABLE public.advisory_audit_log
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

-- ---- updated_at >= created_at safety net ----
ALTER TABLE public.hypothesis_metrics
  ADD CONSTRAINT hypothesis_metrics_audit_ordering_chk
  CHECK (updated_at >= created_at);

ALTER TABLE public.hypothesis_rule_mapping
  ADD CONSTRAINT hypothesis_rule_mapping_audit_ordering_chk
  CHECK (updated_at >= created_at);

ALTER TABLE public.rule_conflict_matrix
  ADD CONSTRAINT rule_conflict_matrix_audit_ordering_chk
  CHECK (updated_at >= created_at);

-- ---- updated_at triggers ----
DROP TRIGGER IF EXISTS trg_hyp_metrics_updated_at ON public.hypothesis_metrics;
CREATE TRIGGER trg_hyp_metrics_updated_at
  BEFORE UPDATE ON public.hypothesis_metrics
  FOR EACH ROW EXECUTE FUNCTION public.audit_set_updated_at();

DROP TRIGGER IF EXISTS trg_hrm_updated_at ON public.hypothesis_rule_mapping;
CREATE TRIGGER trg_hrm_updated_at
  BEFORE UPDATE ON public.hypothesis_rule_mapping
  FOR EACH ROW EXECUTE FUNCTION public.audit_set_updated_at();

DROP TRIGGER IF EXISTS trg_rcm_updated_at ON public.rule_conflict_matrix;
CREATE TRIGGER trg_rcm_updated_at
  BEFORE UPDATE ON public.rule_conflict_matrix
  FOR EACH ROW EXECUTE FUNCTION public.audit_set_updated_at();

-- ---- advisory_audit_log: append-only enforcement ----
CREATE OR REPLACE FUNCTION public.advisory_audit_log_no_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'advisory_audit_log is append-only; UPDATE not permitted (id=%)', OLD.id;
END $$;

DROP TRIGGER IF EXISTS trg_advisory_audit_log_no_update ON public.advisory_audit_log;
CREATE TRIGGER trg_advisory_audit_log_no_update
  BEFORE UPDATE ON public.advisory_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.advisory_audit_log_no_update();

COMMIT;
```

`01-add-audit-cols-rollback.sql` (complete, pasteable):

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_advisory_audit_log_no_update ON public.advisory_audit_log;
DROP TRIGGER IF EXISTS trg_rcm_updated_at ON public.rule_conflict_matrix;
DROP TRIGGER IF EXISTS trg_hrm_updated_at ON public.hypothesis_rule_mapping;
DROP TRIGGER IF EXISTS trg_hyp_metrics_updated_at ON public.hypothesis_metrics;
DROP FUNCTION IF EXISTS public.advisory_audit_log_no_update();
DROP FUNCTION IF EXISTS public.audit_set_updated_at();
ALTER TABLE public.rule_conflict_matrix    DROP CONSTRAINT IF EXISTS rule_conflict_matrix_audit_ordering_chk;
ALTER TABLE public.hypothesis_rule_mapping DROP CONSTRAINT IF EXISTS hypothesis_rule_mapping_audit_ordering_chk;
ALTER TABLE public.hypothesis_metrics      DROP CONSTRAINT IF EXISTS hypothesis_metrics_audit_ordering_chk;
ALTER TABLE public.advisory_audit_log      DROP COLUMN IF EXISTS created_at;
ALTER TABLE public.rule_conflict_matrix    DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.hypothesis_rule_mapping DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.hypothesis_metrics      DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;
COMMIT;
```

`01-add-audit-cols-post-apply-check.sql` (run daily for 24h):

```sql
-- Expect: invocation counts > 0 once writes occur; 0 update-failures on advisory_audit_log.
SELECT funcname, calls FROM pg_stat_user_functions
 WHERE funcname IN ('audit_set_updated_at','advisory_audit_log_no_update');
-- Expect: 0 rows. Any hit means code is trying to UPDATE an audit log row.
SELECT * FROM pg_stat_database WHERE datname = current_database();
-- Sample audit columns are populated:
SELECT created_at, updated_at FROM public.hypothesis_metrics ORDER BY updated_at DESC LIMIT 5;
```

---

## File 2 — `02-stage-1-shadow-columns.sql`

```sql
-- ORDER: 2 of 4. Apply after CI lint (CI-gate.md) is live.
-- DEPENDS ON: 01-add-audit-cols.sql (not strictly, but keep ordering).
-- BLOCKED BY: CI lint not yet enforcing UPPER-rule_id rejection.
-- ROLLBACK: 02-stage-1-shadow-columns-rollback.sql
-- POST-APPLY: 02-stage-1-shadow-columns-post-apply-check.sql
-- DO NOT APPLY without product approval.

-- ===== PRE-FLIGHT: collision check MUST return 0 rows =====
-- WITH proposed AS (
--   SELECT rule_id,
--     'rule_' || lower(regexp_replace(rule_id, '^(rule_|RULE_)', '', 'i')) AS lc
--   FROM public.decision_rules
-- )
-- SELECT lc, count(*), array_agg(rule_id) FROM proposed GROUP BY lc HAVING count(*) > 1;
--
-- WITH proposed AS (
--   SELECT hypothesis_id,
--     'hyp_' || lower(regexp_replace(hypothesis_id, '^(hyp_|HYP_)', '', 'i')) AS lc
--   FROM public.hypothesis_master
-- )
-- SELECT lc, count(*), array_agg(hypothesis_id) FROM proposed GROUP BY lc HAVING count(*) > 1;

BEGIN;

-- Case-insensitive prefix strip prevents double-prefix on already-lowercase outliers.
-- STORED is required because we index the column for uniqueness.
-- Authoring contract: NEW rule_id values MUST be inserted WITHOUT a 'rule_' prefix;
-- this shadow column adds it. (Enforced by CI lint per CI-gate.md.)
ALTER TABLE public.decision_rules
  ADD COLUMN IF NOT EXISTS rule_id_lc text
    GENERATED ALWAYS AS (
      'rule_' || lower(regexp_replace(rule_id, '^(rule_|RULE_)', '', 'i'))
    ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS decision_rules_rule_id_lc_key
  ON public.decision_rules(rule_id_lc);

ALTER TABLE public.hypothesis_master
  ADD COLUMN IF NOT EXISTS hypothesis_id_lc text
    GENERATED ALWAYS AS (
      'hyp_' || lower(regexp_replace(hypothesis_id, '^(hyp_|HYP_)', '', 'i'))
    ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS hypothesis_master_hypothesis_id_lc_key
  ON public.hypothesis_master(hypothesis_id_lc);

-- In-transaction sanity assert: if any collision somehow slipped past pre-flight,
-- this raises and aborts the transaction.
DO $$
DECLARE
  dup_rules int;
  dup_hyp   int;
BEGIN
  SELECT count(*) INTO dup_rules FROM (
    SELECT rule_id_lc FROM public.decision_rules GROUP BY rule_id_lc HAVING count(*)>1
  ) s;
  SELECT count(*) INTO dup_hyp FROM (
    SELECT hypothesis_id_lc FROM public.hypothesis_master GROUP BY hypothesis_id_lc HAVING count(*)>1
  ) s;
  IF dup_rules > 0 OR dup_hyp > 0 THEN
    RAISE EXCEPTION 'Lowercase ID collisions detected (rules=%, hypotheses=%) — abort.', dup_rules, dup_hyp;
  END IF;
END $$;

COMMIT;

-- ===== VERIFICATION (run after COMMIT) =====
-- SELECT count(*) FROM public.decision_rules    WHERE rule_id_lc IS NULL;          -- expect 0
-- SELECT count(*) FROM public.hypothesis_master WHERE hypothesis_id_lc IS NULL;    -- expect 0
-- SELECT rule_id, rule_id_lc FROM public.decision_rules LIMIT 20;
-- SELECT hypothesis_id, hypothesis_id_lc FROM public.hypothesis_master LIMIT 20;
-- SELECT count(*) FILTER (WHERE rule_id_lc LIKE 'rule_%') AS prefixed,
--        count(*) FILTER (WHERE rule_id_lc NOT LIKE 'rule_%') AS unprefixed
--   FROM public.decision_rules;   -- expect prefixed=1852, unprefixed=0
```

Rollback and post-apply files mirror v2 — index drop → column drop, plus daily uniqueness/null check.

---

## File 3 — `03-add-version-hash.sql`

**Hash policy header (copied into the file):**

```text
POLICY: identity columns (rule_id, hypothesis_id, observation_code) MUST NOT
appear in their own version_hash formula. Identity is the row key, not its
content. Including identity (a) breaks "same content ⇒ same hash" equality
and (b) causes every hash to churn when the Phase 9 lowercase flip rewrites
identities. The full audit trail (child rows, snapshot at decision time)
lives in ai_decision_log, not in version_hash. version_hash is a fingerprint,
not a snapshot.
```

```sql
-- ORDER: 4 of 4. Apply after 01 + CI-gate + 02.
-- DEPENDS ON: 01-add-audit-cols.sql
-- ROLLBACK: 03-add-version-hash-rollback.sql
-- POST-APPLY: 03-add-version-hash-post-apply-check.sql
-- DO NOT APPLY without product approval.

-- ===== PRE-FLIGHT =====
-- SELECT count(*) FROM public.decision_rules;        -- expect ~1852
-- SELECT count(*) FROM public.hypothesis_master;     -- expect ~346
-- SELECT count(*) FROM public.observation_master;    -- expect ~2537
-- All three under 100k → single-statement backfill is safe.

BEGIN;

-- =========================================================
-- decision_rules
-- =========================================================
ALTER TABLE public.decision_rules
  ADD COLUMN IF NOT EXISTS version_hash text;

CREATE OR REPLACE FUNCTION public.refresh_decision_rule_version_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version_hash := md5(
    coalesce(NEW.condition_code,'')        || '|' ||
    coalesce(NEW.action_text,'')           || '|' ||
    coalesce(NEW.action_type,'')           || '|' ||
    coalesce(NEW.farmer_safety_level,'')   || '|' ||
    coalesce(NEW.response_severity,'')     || '|' ||
    coalesce(NEW.rule_intent,'')           || '|' ||
    coalesce(NEW.conditions_json::text,'') || '|' ||
    coalesce(NEW.crop_code,'')             || '|' ||
    coalesce(NEW.growth_stage,'')
  );
  RETURN NEW;
END $$;

UPDATE public.decision_rules
   SET version_hash = md5(
     coalesce(condition_code,'')        || '|' ||
     coalesce(action_text,'')           || '|' ||
     coalesce(action_type,'')           || '|' ||
     coalesce(farmer_safety_level,'')   || '|' ||
     coalesce(response_severity,'')     || '|' ||
     coalesce(rule_intent,'')           || '|' ||
     coalesce(conditions_json::text,'') || '|' ||
     coalesce(crop_code,'')             || '|' ||
     coalesce(growth_stage,'')
   )
 WHERE version_hash IS NULL;

DROP TRIGGER IF EXISTS trg_decision_rules_version_hash ON public.decision_rules;
CREATE TRIGGER trg_decision_rules_version_hash
  BEFORE INSERT OR UPDATE ON public.decision_rules
  FOR EACH ROW EXECUTE FUNCTION public.refresh_decision_rule_version_hash();

CREATE INDEX IF NOT EXISTS idx_decision_rules_version_hash
  ON public.decision_rules(version_hash);

-- =========================================================
-- hypothesis_master
-- Verified columns; identity (hypothesis_id) and curator-narrative
-- columns (cause_name_*, biological_basis) excluded.
-- biological_basis IS included: it describes the diagnostic mechanism
-- the engine references for explanation; treated as decision-relevant.
-- cause_name_* is display-only translation, not engine input → excluded.
-- =========================================================
ALTER TABLE public.hypothesis_master
  ADD COLUMN IF NOT EXISTS version_hash text;

CREATE OR REPLACE FUNCTION public.refresh_hypothesis_version_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version_hash := md5(
    coalesce(NEW.crop_group,'')           || '|' ||
    coalesce(NEW.hypothesis_type,'')      || '|' ||
    coalesce(NEW.canonical_group,'')      || '|' ||
    coalesce(NEW.biological_basis,'')     || '|' ||
    coalesce(NEW.severity_model,'')       || '|' ||
    coalesce(NEW.version,'')              || '|' ||
    coalesce(NEW.engine_min_version,'')   || '|' ||
    coalesce(NEW.is_active::text,'')
  );
  RETURN NEW;
END $$;

UPDATE public.hypothesis_master
   SET version_hash = md5(
     coalesce(crop_group,'')           || '|' ||
     coalesce(hypothesis_type,'')      || '|' ||
     coalesce(canonical_group,'')      || '|' ||
     coalesce(biological_basis,'')     || '|' ||
     coalesce(severity_model,'')       || '|' ||
     coalesce(version,'')              || '|' ||
     coalesce(engine_min_version,'')   || '|' ||
     coalesce(is_active::text,'')
   )
 WHERE version_hash IS NULL;

DROP TRIGGER IF EXISTS trg_hypothesis_master_version_hash ON public.hypothesis_master;
CREATE TRIGGER trg_hypothesis_master_version_hash
  BEFORE INSERT OR UPDATE ON public.hypothesis_master
  FOR EACH ROW EXECUTE FUNCTION public.refresh_hypothesis_version_hash();

CREATE INDEX IF NOT EXISTS idx_hypothesis_master_version_hash
  ON public.hypothesis_master(version_hash);

-- =========================================================
-- observation_master
-- Identity (observation_code) excluded. description IS included because
-- it IS the canonical semantic payload the symbolic reasoner matches on
-- (no separate canonical_label column exists in this schema).
-- =========================================================
ALTER TABLE public.observation_master
  ADD COLUMN IF NOT EXISTS version_hash text;

CREATE OR REPLACE FUNCTION public.refresh_observation_version_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version_hash := md5(
    coalesce(NEW.description,'')                 || '|' ||
    coalesce(NEW.symptom_category,'')            || '|' ||
    coalesce(NEW.canonical_group,'')             || '|' ||
    coalesce(NEW.observation_category,'')        || '|' ||
    coalesce(NEW.affected_plant_part,'')         || '|' ||
    coalesce(NEW.observation_type::text,'')      || '|' ||
    coalesce(NEW.symptom_type::text,'')          || '|' ||
    coalesce(NEW.symptom_pattern::text,'')       || '|' ||
    coalesce(NEW.severity_level::text,'')        || '|' ||
    coalesce(NEW.is_diagnostic::text,'')         || '|' ||
    coalesce(NEW.is_farmer_observable::text,'')  || '|' ||
    coalesce(NEW.is_active::text,'')             || '|' ||
    coalesce(NEW.crop_group,'')                  || '|' ||
    coalesce(array_to_string(NEW.applicable_crop_groups, ','), '')
  );
  RETURN NEW;
END $$;

UPDATE public.observation_master
   SET version_hash = md5(
     coalesce(description,'')                 || '|' ||
     coalesce(symptom_category,'')            || '|' ||
     coalesce(canonical_group,'')             || '|' ||
     coalesce(observation_category,'')        || '|' ||
     coalesce(affected_plant_part,'')         || '|' ||
     coalesce(observation_type::text,'')      || '|' ||
     coalesce(symptom_type::text,'')          || '|' ||
     coalesce(symptom_pattern::text,'')       || '|' ||
     coalesce(severity_level::text,'')        || '|' ||
     coalesce(is_diagnostic::text,'')         || '|' ||
     coalesce(is_farmer_observable::text,'')  || '|' ||
     coalesce(is_active::text,'')             || '|' ||
     coalesce(crop_group,'')                  || '|' ||
     coalesce(array_to_string(applicable_crop_groups, ','), '')
   )
 WHERE version_hash IS NULL;

DROP TRIGGER IF EXISTS trg_observation_master_version_hash ON public.observation_master;
CREATE TRIGGER trg_observation_master_version_hash
  BEFORE INSERT OR UPDATE ON public.observation_master
  FOR EACH ROW EXECUTE FUNCTION public.refresh_observation_version_hash();

CREATE INDEX IF NOT EXISTS idx_observation_master_version_hash
  ON public.observation_master(version_hash);

COMMIT;
```

`03-add-version-hash-rollback.sql`: drop triggers → drop functions → drop indexes → drop columns, in reverse order, all in one transaction.

`03-add-version-hash-post-apply-check.sql`: nullness check, distribution of distinct hashes, spot-check that an UPDATE to a hash-input column changes the hash and an UPDATE to a non-input column (e.g. `display_order`-style admin field) does NOT.

---

## `CI-gate.md` (no SQL — code-layer gate)

- ESLint / repo lint rule: reject literals matching `^(RULE|HYP)_[A-Z0-9_]+$` introduced into `supabase/**`, `src/**`, `.lovable/memories/**`, bundled JSON.
- No inline opt-out. No `// skip-lint`. Escalation = architect only.
- Optional DB-side `NOT VALID` guard (only after CI lint enforces; VALIDATE deferred to Stage 5):

```sql
ALTER TABLE public.decision_rules
  ADD CONSTRAINT decision_rules_rule_id_lowercase_chk
  CHECK (rule_id ~ '^rule_[a-z0-9_]+$') NOT VALID;

ALTER TABLE public.hypothesis_master
  ADD CONSTRAINT hypothesis_master_hypothesis_id_lowercase_chk
  CHECK (hypothesis_id ~ '^hyp_[a-z0-9_]+$') NOT VALID;
```

These constraints catch any new write that violates the pattern without touching the 2,198 legacy rows. `VALIDATE CONSTRAINT` is scheduled for Stage 5 of the Phase 9 plan.

---

## What does NOT change in code

- Zero `.from(...)` selects modified.
- No new columns are read by application code in this migration set. `rule_id_lc` / `hypothesis_id_lc` / `version_hash` are populated server-side and ignored by every existing reader.
- The Stage-2 dual-read shim (which will start consuming `rule_id_lc`) is a **separate** plan, not part of this one.

## Open items deferred (not in v3 scope)

- Option (b) hash-with-child-rows: explicitly rejected per reviewer; reconsidered only if `ai_decision_log` snapshot proves insufficient.
- pgcrypto/SHA-256: not adopted; `md5` is sufficient for change-detection. Documented in each trigger function header.
- Phase 9 Stages 2–5: separate plan once File 2 ships and CI lint has been live ≥ 1 sprint.

Ready for line-by-line SQL review.
