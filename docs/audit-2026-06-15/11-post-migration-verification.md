# Phase 11 — Post-Migration Verification & Production-Readiness Audit

**Generated:** 2026-06-17 (after Migrations 01/02/03 executed)
**Scope:** verify migration outcomes against live schema, audit code paths that touch the new columns, and report what is still missing before the symbolic decision brain can be called production-ready.

---

## 1. Live schema verification (migrations 01–03)

Queried `information_schema.columns` and per-table row counts at audit time.

| Table | Column | Type | Generation | Row count | Populated |
|---|---|---|---|---|---|
| `decision_rules` | `rule_id_lc` | text | `GENERATED ALWAYS` (`'rule_' || lower(regexp_replace(rule_id,'^(rule_|RULE_)','','i'))`) | 1,852 | 1,852 (100 %) |
| `decision_rules` | `version_hash` | text | trigger-maintained (md5 of decision-relevant cols) | 1,852 | 1,852 (100 %) |
| `decision_rules` | `created_at` / `updated_at` | timestamptz | trigger-maintained | 1,852 | 100 % |
| `hypothesis_master` | `hypothesis_id_lc` | text | `GENERATED ALWAYS` (`'hyp_' || lower(regexp_replace(hypothesis_id,'^(hyp_|HYP_)','','i'))`) | 346 | 346 (100 %) |
| `hypothesis_master` | `version_hash` | text | trigger-maintained | 346 | 346 (100 %) |
| `hypothesis_master` | `created_at` / `updated_at` | timestamptz | trigger-maintained | 346 | 100 % |
| `observation_master` | `version_hash` | text | trigger-maintained | 2,537 | 2,537 (100 %) |
| `observation_master` | `created_at` / `updated_at` | timestamptz | trigger-maintained | 2,537 | 100 % |
| `advisory_audit_log` | `created_at` | timestamptz | default `now()` + append-only trigger | — | 100 % |

**Collision check:**

```text
decision_rules.rule_id_lc          : 1,852 rows / 1,852 distinct  → 0 collisions
hypothesis_master.hypothesis_id_lc :   346 rows /   346 distinct  → 0 collisions
```

✅ All three migrations applied cleanly. The Stage-1 shadow columns are safe to consume from code.

---

## 2. Codebase updates applied this turn

Surgical Stage-2 dual-read additions (additive only — no behavior change today):

| File | Change | Why |
|---|---|---|
| `supabase/functions/ai-agriculture-chat/utils/id-normalizer.ts` *(new)* | `ruleIdLc`, `hypothesisIdLc`, `selectRuleByAnyId`, `selectRulesByAnyIds` | Single chokepoint for the canonical → lowercase fallback. Deleted in one PR after Stage 4. |
| `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (~2161) | `confirmedRuleId` lookup now goes through `selectRuleByAnyId` | This is the only lookup site whose id originates from prior-turn state, so it could see either casing post-flip. The other two direct id lookups (`observation-rule-lookup.ts:128`, `generic-multi-match-detector.ts:174`) source ids from the same DB read and stay case-consistent until Stage 4. |
| `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` (~263) | Surfaces `rule_id_lc`, `version_hash`, `updated_at` on every `BundledRule` | Lets downstream caches (`conditionLedgerCache`, `hypothesisCache`, `OBS_ALIAS_CACHE`) key on `version_hash` for drift detection without an extra round-trip. |
| `supabase/functions/ai-agriculture-chat/bundled-rules/all-rules.ts` (~18) | `BundledRule` interface gains the three optional sidecar fields | Type safety for the new properties without breaking existing fixtures. |

**Not changed (intentionally):**

* `decision_rules_translations_archive` lookups — table is unchanged by these migrations and the Phase 9 design names it as a hard prerequisite for Stage 4 (re-key by lowercase). Touching it now would be premature.
* `hypothesis_rule_mapping.rule_id` — still UPPER and FK-aligned with `decision_rules.rule_id`. The Stage-4 design already specifies how to flip both columns inside one transaction.
* The 16 `createClient` sites flagged in Phase 6 — consolidation onto `scope.db` is hygiene, not a migration prerequisite.

---

## 3. Production-readiness audit — symbolic decision brain

Pulled live counts at audit time:

```text
active rules                                : 1,846
rules with conditions_json                  : 1,846 / 1,846   ✅
rules with action_text                      : 1,821 / 1,846   ⚠ 25 active rules have NULL action_text
rules with orphaned condition_code          :     0           ✅ (FK alignment intact)
hypotheses                                  :   346
hypothesis → rule mappings                  : 1,810
hypotheses with zero rule mappings          :    11           ⚠ unfireable hypotheses
observation_master rows                     : 2,537
observations missing translations           :   608           ⚠ ~24 % no Hindi/Marathi entry
intent_observation_mapping rows             : 13,446          ✅
```

### Severity-ranked gaps before "production ready"

#### P0 — must fix before declaring production

1. **25 active rules with NULL `action_text`.** A rule that fires but has no farmer-facing instruction collapses to the generic fallback. This violates the Core rule "100 % of agronomic advice MUST originate from database." Either authoring is incomplete or `is_active = true` was set prematurely. Action: list them, decide per-rule between (a) author the text, or (b) set `is_active = false` until authored.

   ```sql
   SELECT rule_id, crop_code, category, cause
   FROM decision_rules
   WHERE is_active = true AND action_text IS NULL
   ORDER BY priority NULLS LAST, rule_id;
   ```

2. **11 hypotheses with zero rule mappings.** They can survive evidence accumulation but the orchestrator has nothing to recommend. Either map to existing rules or retire the hypothesis. Action:

   ```sql
   SELECT h.hypothesis_id, h.cause_name_en
   FROM hypothesis_master h
   LEFT JOIN hypothesis_rule_mapping m USING (hypothesis_id)
   WHERE m.hypothesis_id IS NULL;
   ```

3. **No CI gate enforcing the lowercase contract.** `docs/audit-2026-06-15/migrations-draft/CI-gate.md` is a spec, not a check. Until a repo-level lint blocks `UPPER_SNAKE` rule authoring, the migration backlog grows on every PR.

#### P1 — should fix before high-volume rollout

4. **608 observations without translations** (~24 % gap). The orchestrator falls through to English transliteration for these — already covered by the LLM Output Validation Gate, but each fallback is a degraded farmer experience. Action: prioritize the top N by `observation_master.usage_count` (if tracked) or by frequency in `ai_chat_audit_logs`.

5. **`version_hash` is populated but unused.** The three big caches (`conditionLedgerCache`, `hypothesisCache`, `OBS_ALIAS_CACHE`) still rely on process-lifetime keys. A rule edit in admin tooling is invisible to a warm edge instance for up to its TTL. Now that `version_hash` is on every row, the caches should key on `(id, version_hash)` so a hash change invalidates immediately. Loader already surfaces the field (this turn) — caches still need to consume it.

6. **Translation archive is the next migration risk.** `decision_rules_translations_archive` is keyed by UPPER `rule_id` with no FK and no `_lc` sidecar. Stage 4 of the lowercase migration will either need a dual-key archive table or a one-shot rewrite migration. Add to Phase 9 prerequisites explicitly.

7. **No drift monitor.** `version_hash` makes drift detection trivial but nothing exports it. Add a daily job that records the count of rules whose hash changed in the last 24 h to `governance_audit_reports`. A spike >0 with no admin activity = silent DB-side edit.

#### P2 — production-grade hardening

8. **Module-level mutable state without tenant prefix** (already noted in Phase 6 D6). The four caches are all global-data caches — cross-tenant safe — but the contract is not enforced by a test. Add a guard test that asserts cache keys never include any tenant- or user-derived fragment.

9. **16 edge function `createClient` sites** vs `scope.db` consolidation. Each extra client is a connection pool entry under load. Phase 6 D5 already lists the 13 candidates — convert in one PR before scaling tenants past current count.

10. **No structural test for `version_hash` triggers.** Triggers exist; a regression suite that updates a single column and asserts `version_hash` changed (and that updating only `updated_at` does NOT change it) is missing. One Deno test in `_tests/` would lock the contract.

11. **`advisory_audit_log` append-only trigger has no observability.** If something tries to UPDATE a row the trigger raises — silent in logs unless surfaced. Wire the rejection into `system_health_events`.

---

## 4. Scorecard

| Dimension | Score / 100 | Notes |
|---|---|---|
| Schema integrity | 92 | All FKs aligned, 0 orphan condition_codes. −8 for translation archive not yet covered by migration plan. |
| Data quality | 78 | 25 NULL `action_text`, 11 unfireable hypotheses, 608 untranslated observations. |
| Auditability | 88 | `version_hash` + `updated_at` now universal; drift monitor still missing. |
| Code ↔ schema drift | 90 | Loader surfaces sidecars; dual-read shim in place; translation archive lookup still single-key. |
| Migration safety net | 85 | Pre-flight + post-apply + rollback files present for all 3 migrations. CI gate not yet enforced. |
| **Overall production-readiness** | **86** | Up from 79 (pre-migration baseline in `10-readiness-score.md`). |

To cross the 95-line, close the four P0 items: NULL `action_text` triage, unfireable hypotheses, CI-gate enforcement, and a drift monitor reading `version_hash`.

---

## 5. Recommended next actions (in execution order)

1. **(P0, SQL only)** Triage the 25 NULL-`action_text` rules; either author text or deactivate.
2. **(P0, SQL only)** Retire or map the 11 hypotheses with no rules.
3. **(P0, repo change)** Add the CI-gate from `migrations-draft/CI-gate.md` as an actual lint script in `package.json` + a `NOT VALID` CHECK constraint on `rule_id`.
4. **(P1, code change)** Make the three loader caches key on `version_hash`. Single-file change in `bundled-rules/loader.ts`.
5. **(P1, SQL)** Add `decision_rules_translations_archive.rule_id_lc` sidecar + dual-read in `observation-rule-lookup.ts`.
6. **(P1, ops)** Daily drift monitor → `governance_audit_reports`.
7. **(P2)** Consolidate the 13 `createClient` sites onto `scope.db`.
8. **(P2)** Deno tests covering `version_hash` trigger semantics and cache-key tenant isolation.

After (1)–(4) the brain meets the "world-class" bar named in the original audit brief. (5)–(8) are the production-grade hardening layer.
