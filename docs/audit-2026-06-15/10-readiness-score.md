# Phase 10 — Production Readiness Score

Each dimension scored 0–100 with evidence. Final = weighted average.

| Dimension | Score | Evidence |
|---|---:|---|
| **Architecture** | 85 | RequestScope contract enforced. Symbolic core deterministic. Layered: orchestrator → reasoner → gate → narrator. Gaps: 13 `createClient` sites not yet on `scope.db`. |
| **Multi-tenancy** | 82 | RLS enabled on every multi-tenant table (20/20 sampled). Module-level caches reviewed and confirmed global-only. Missing: explicit cross-tenant leakage regression test. |
| **AI Safety** | 78 | FK integrity perfect. `prohibited`-grade rules all gated by `action_type=block`. Hazard: case-mismatch (`BIOTIC_OBS_KEYS` uppercase vs lowercase DB) can silently drop a safety branch. 1 alias still cause-encoded. |
| **Determinism** | 88 | Tiebreaks deterministic (`priority + rule_id`). Pagination enforced on bundled-rules loader. Risk: 0 Marathi/Hindi translations → LLM narration is the de-facto translator on every turn (non-deterministic). |
| **Scalability** | 86 | Hot-path indexes serving 64k+ scans on intent map. RequestScope contains per-turn state. Reference data global + cacheable. No N+1 patterns in symbolic core. |
| **Data Quality** | 70 | Observation ontology canonical (2,537 lowercase). Rules + hypotheses split between UPPER (legacy) and a phased lowercase target. Translation table 0% populated for `mr`/`hi`. |
| **Auditability** | 65 | `*_versions` tables exist; live rows have no `version_hash` column to pin a decision to a version. `hypothesis_metrics`, `hypothesis_rule_mapping`, `rule_conflict_matrix` lack `created_at/updated_at`. `ai_decision_log`, `advisory_audit_log` present and populated. |

**Weighted average (equal weights): 79 / 100.**

## Top-5 levers (in priority order)

1. **Translation backfill** (Quality 70 → 88, Determinism 88 → 95): bulk-load `decision_rules_translations_archive` for `mr` and `hi`. Estimated 1,846 rows × 2 languages.
2. **Case normalization shim** (AI Safety 78 → 90): lowercase every symptom code at the orchestrator boundary; fix `BIOTIC_OBS_KEYS`.
3. **`version_hash` + audit-column hardening** (Auditability 65 → 85): additive migration drafted in `03-schema-gaps.md`.
4. **Finish `scope.db` migration** (Architecture 85 → 93): 13 files identified, mechanical refactor.
5. **Drop cause-encoded alias + review `caution+no_action_required` cohort** (AI Safety 90 → 95): 1 + ~30 rows.

Re-score target after hot-fixes: **≥ 90 / 100**, achievable inside one build sprint without any breaking migration.
