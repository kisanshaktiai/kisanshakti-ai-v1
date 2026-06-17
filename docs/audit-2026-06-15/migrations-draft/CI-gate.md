# CI Gate — UPPER-case rule_id / hypothesis_id authoring freeze

**Status:** DRAFT — must be live in CI before `02-stage-1-shadow-columns.sql` is applied.

## Code-layer lint (primary enforcement)

Repo-wide ESLint / regex rule rejects any new literal matching:

```
^(RULE|HYP)_[A-Z0-9_]+$
```

Scope: `supabase/**`, `src/**`, `.lovable/memories/**`, bundled JSON files.

- No inline opt-out. No `// skip-lint`, no `eslint-disable`.
- Escalation path: architect only. No PR template checkbox.

## Optional DB-layer guard (`NOT VALID`)

Only after the CI lint has been live ≥ 1 sprint, optionally add a DB-side `NOT VALID` CHECK constraint. This catches future writes WITHOUT validating the 2,198 legacy `UPPER` rows. `VALIDATE CONSTRAINT` is deferred to Stage 5 of the Phase 9 lowercase migration (after all legacy IDs are migrated).

```sql
ALTER TABLE public.decision_rules
  ADD CONSTRAINT decision_rules_rule_id_lowercase_chk
  CHECK (rule_id ~ '^rule_[a-z0-9_]+$') NOT VALID;

ALTER TABLE public.hypothesis_master
  ADD CONSTRAINT hypothesis_master_hypothesis_id_lowercase_chk
  CHECK (hypothesis_id ~ '^hyp_[a-z0-9_]+$') NOT VALID;
```

Do NOT use a plain `CHECK` (without `NOT VALID`) — validation would fail at apply time because every existing row violates the pattern.

## Why this is a hard prerequisite for File 2

`02-stage-1-shadow-columns.sql` adds generated lowercase columns. Without the freeze, new `UPPER_SNAKE` rule_ids keep landing in production and Stage 1 is fixing yesterday's rows while tomorrow's keep arriving — making the migration pointless.
