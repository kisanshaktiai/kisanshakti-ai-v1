# End-to-End Pipeline Map (evidence-backed)

Captured from live trace `trace_mq3ffmsw_7ul7ef` (Marathi / Khari / NO_ACTIVE_CROP).

```
HTTP POST /ai-agriculture-chat
  │  Headers: Authorization (anon JWT), x-tenant-id, x-farmer-id
  │  Body:    { messages:[{role:"user",content:"…"}], language:"mr", landId, mode }
  ▼
index.ts
  ├─ Auth middleware (tenant + farmer header validation)              ✅
  ├─ Session resolve / create (ai_chat_sessions, land-scoped)         ✅
  ├─ Message persist (ai_chat_messages, role=user)                     ✅
  ├─ Language pipeline (mr, has_devanagari=true)                       ✅
  └─ runOrchestrator(...)
        │
        ▼
        agents/orchestrator.ts
          ├─ ContextTracer init                                        ✅
          ├─ Pre-fetch land context                                    ✅
          │    crop=null, soil=N260/P24/K320, NDVI=0.041
          ├─ Canonical-context contract → status=NO_ACTIVE_CROP        ✅
          ├─ Query route → GENERAL_INFO @ 50%                          ✅
          ├─ 🛑 NO_ACTIVE_CROP short-circuit                            ⚠️ logs only — payload built but downstream wrapper ignores it (see 15-live-trace-evidence.md §4)
          ├─ Static gate (skipped — short-circuit should have returned)
          ├─ Filtering audit (0 rules / 0 actions)                     ⚠️ should not have run
          ├─ Confidence bridge → symbolic_confidence=0                  ✅ (correctly 0 — no rules)
          ├─ Unified gate → FAIL → mode=INFORMATION                    ⚠️ should not have run
          ├─ Safety gate override → CLARIFY                             ⚠️ should not have run
          └─ Phase 5: LLM/template formatter                            ⚠️ emits template with unfilled `{symptom}`
  ▼
index.ts (post-orchestrator)
  ├─ ui-response-builder.ts (precedence fix in place)                  ✅
  ├─ Persist assistant message                                          ✅
  └─ HTTP 200 → {response, metadata:{confidence:0, ai_model:"template"}, …}
                                                          ▲
                                                          └── F1 + F3 surface here
```

## Tenant / farmer scoping

Every DB read on this trace was scoped by both `tenant_id` and `farmer_id`:

- `lands` lookup → 1 row (Khari).
- `crop_schedules` lookup → 0 rows (correct — no active crop).
- NDVI history → 10 rows, all tenant `a2a59533…`.
- `ai_chat_sessions` / `ai_chat_messages` → session `9a105ccf…` is bound to tenant + farmer + land.

**No cross-tenant leakage observed.**

## Rule engine coverage on this query

- `decision_rules` matched: 0 (expected — no symptoms, no active crop).
- `observation_master` matched: 0.
- `hypothesis_evaluator`: not entered (no symbolic decision).

The rule engine is **correctly silent** for this input. The wrong answer comes from the
post-orchestrator pipeline overwriting the short-circuit payload, not from the symbolic
brain.

## Confidence pipeline (this trace)

| Stage | Value | Source |
|---|---|---|
| decision_rules.confidence_score | n/a | no rules |
| symbolic-reasoner | 0 | no match |
| layered_rule_result.primary_decision | none | no match |
| symbolicConfidence (index.ts:1334) | 0 | fallback chain returned 0 (correct) |
| short-circuit payload `metadata.confidence_score` | **1.0** | NO_ACTIVE_CROP_GUARD |
| orchestratorResponse.metadata.confidence | **overwritten to 0** | ⚠️ F3 |
| ui-response-builder safeMeta.confidence | 0 | inherits F3 |
| client `metadata.confidence` | 0 | inherits F3 |

The precedence fix in `ui-response-builder.ts` is verified working in isolation
(see `tests/chat/confidence-pipeline.test.ts`); it cannot recover a value that was
already destroyed by the upstream overwrite (F3).
