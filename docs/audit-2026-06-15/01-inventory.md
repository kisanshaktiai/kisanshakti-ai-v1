# Phase 1 — Inventory

All counts from live DB at audit time (2026-06-15).

## Row counts (key tables)

| Table | Rows | Notes |
|---|---:|---|
| `decision_rules` | 1,852 | 1,846 active |
| `hypothesis_master` | 346 | |
| `observation_master` | 2,537 | All lowercase codes |
| `intent_observation_mapping` | 13,446 | |
| `decision_rules_translations_archive` | — | 1,846 active rules missing `mr`, same for `hi` |
| `observation_aliases` | — | 1 cause-encoded alias (violation) |
| `hypothesis_rule_mapping` | — | 0 orphans |

## Audit-column presence

```
table                                created_at  updated_at  deleted_at  version_hash  tenant_id
advisory_audit_log                       -          -           -            -            ✓
ai_chat_analytics                        ✓          -           -            -            ✓
ai_chat_audit_logs                       ✓          -           -            -            ✓
ai_chat_messages                         ✓          ✓           -            -            ✓
ai_chat_sessions                         ✓          ✓           -            -            ✓
ai_decision_log                          ✓          -           -            -            ✓
canonical_hint_mapping                   ✓          ✓           -            -            -
chemical_regulatory_status               ✓          -           -            -            -
crop_baseline_guidelines_v2              ✓          ✓           -            -            -
crop_groups                              ✓          ✓           -            -            -
crop_stage_master                        ✓          ✓           -            -            -
crop_synonyms                            ✓          ✓           -            -            -
crop_vocabulary                          ✓          ✓           -            -            -
crops                                    ✓          ✓           -            -            -
decision_rules                           ✓          ✓           -            -            -
etl_standards                            ✓          -           -            -            -
hallucination_detection_logs             ✓          ✓           -            -            ✓
hypothesis_conditions                    ✓          -           -            -            -
hypothesis_contradictions                ✓          -           -            -            -
hypothesis_integrity_alerts              ✓          -           -            -            -
hypothesis_master                        ✓          ✓           -            -            -
hypothesis_metrics                       -          -           -            -            -   ← gap
hypothesis_rule_mapping                  -          -           -            -            -   ← gap
hypothesis_versions                      ✓          -           -            -            -
intent_observation_mapping               ✓          ✓           -            -            -
intent_translations                      ✓          -           -            -            -
observation_aliases                      ✓          ✓           -            -            -
observation_differential_questions       ✓          ✓           -            -            -
observation_intent_master                ✓          ✓           -            -            -
observation_master                       ✓          ✓           -            -            -
observation_translations                 ✓          -           -            -            -
observation_versions                     ✓          -           -            -            -
orchestrator_metrics                     ✓          -           -            -            ✓
rule_approval_workflow                   ✓          ✓           -            -            -
rule_conflict_matrix                     -          -           -            -            -   ← gap
rule_explainability                      ✓          -           -            -            -
rule_lineage                             ✓          -           -            -            -
```

## RLS status (sampled)

All ai-chat tables (`ai_chat_sessions`, `ai_chat_messages`, `ai_chat_audit_logs`), audit tables, and all reference tables have RLS **enabled**. Policy counts range 1–4. Reference tables (rules / obs / hypotheses) have 1 policy each — typically "read by authenticated", which is correct for shared ontology.

## Index hot path (top by `idx_scan`)

```
idx_iom_intent_crop               64,457   intent_observation_mapping (intent, crop)
observation_master_pkey           18,347
decision_rules_rule_id_key         4,609
ai_chat_messages_pkey              2,231
uq_intent_crop_obs                   999
idx_ai_chat_messages_session         279
idx_decision_rules_crop_active       179
idx_dr_crop_stage                    123
```

Hot path is healthy: the symbolic core hits `intent_observation_mapping` 64k+ times, served by a composite index.

## Conclusion

Inventory is consistent with the AI chat traffic pattern: heavy reads on reference tables served by indexed lookups; multi-tenant data tables (`ai_chat_*`, `*_log`) carry `tenant_id` and RLS. Reference tables are global (no `tenant_id`) by design.
