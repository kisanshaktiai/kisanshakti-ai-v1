# Production Readiness Audit — AI Chat × Symbolic Brain × Variety × Crop Schedule
**Date:** 2026-06-07  
**Scope:** End-to-end pipeline test for ALL crops, DB integrity, variety propagation into the Symbolic Decision Brain graph, production-readiness scoring.

---

## 1. Executive verdict

| Area | Status | Score |
|------|--------|-------|
| Confidence pipeline (UI ↔ metadata ↔ DB) | ✅ Fixed & regression-tested | 9 / 10 |
| AI Chat — Symbolic Brain rule coverage | 🔴 Critical gap | 3 / 10 |
| AI Chat — Variety context integration | 🔴 **Not wired at all** | 0 / 10 |
| AI Crop Schedule — Variety integration | 🟡 Partially wired, not persisting | 4 / 10 |
| DB integrity (variety / rules / observations) | 🟡 Coverage gaps | 5 / 10 |
| Multi-tenant isolation | ✅ Header-scoped, verified | 9 / 10 |
| Observability (`ai_decision_log`) | 🔴 0 rows in last 7 days | 1 / 10 |
| **Overall production readiness** | 🔴 **NOT READY** | **4.4 / 10** |

**Bottom line:** The system is production-ready *only* for Sugarcane in Marathi/Hindi. For the other 100+ crops in `crops` it will silently degrade to LLM-templated responses with no symbolic backing and no variety-aware reasoning.

---

## 2. Live database measurements

Pulled via `supabase--read_query` at audit time.

### 2.1 Crop / rule coverage

| Metric | Value |
|---|---|
| `crops` total | **112** |
| `observation_master` total | 2 532 |
| `decision_rules` total | 1 824 |
| **Crops with ≥1 decision_rule** | **12 / 112  (10.7 %)** |
| Crops with zero rules | **100** |

Per-crop rule distribution:

```
SUGARCANE 529  BRINJAL 134  RICE 133  POTATO 132  TOMATO 130
ONION 128      COTTON 121   MAIZE 120 SOYBEAN 120 CHILI 120
WHEAT 117      ALL 40
```

> 🔴 100 of 112 crops fall through to LLM template fallback — the very codepath that produced the `{symptom}` placeholder bug in trace `trace_mq3ffmsw_7ul7ef`.

### 2.2 Variety master (`master_products WHERE product_type='seed'`)

| Metric | Value |
|---|---|
| Varieties total | **103** |
| With `maturity_days_max` | 103 (100 %) |
| With `water_demand_mm_per_season` | 102 (99 %) |
| With `climate_suitability` | 103 (100 %) |
| With `soil_suitability` | 103 (100 %) |
| Crops covered by at least one variety | **23 / 112  (20.5 %)** |
| `variety_resistance` rows | 150 (98 varieties) |
| `variety_translations` rows | 824 |

> 🟡 Variety profile data quality is excellent where it exists, but 89 crops have **no varieties at all** → variety-aware planning is impossible for them.

### 2.3 Persistence reality check

| Metric | Value |
|---|---|
| `lands` total | 40 |
| `lands.current_crop_variety_id` populated | **1 / 40** |
| `crop_schedules` total | 28 |
| `crop_schedules.variety_id` populated | **0 / 28** |
| `schedule_tasks` total | 526 |

> 🔴 Although `ai-smart-schedule/index.ts:4268` claims to write `variety_id: varietyProfile?.variety_id`, **zero schedules in the production DB carry one**. Either (a) `varietyProfile` is always null because `lands.current_crop_variety_id` is unset, or (b) the insert column never reaches the row. Both root causes need fixing.

### 2.4 Observability

```
ai_decision_log: total=0, latest=NULL
```

> 🔴 The decision log table is **completely empty**. Either no chat traffic has run since the schema was created, or the writer is silently failing. Cannot validate the confidence-bridge fixes against real production rows — only against the 14 unit tests (all green).

---

## 3. AI Chat × Variety — the missing wire

Code search across `supabase/functions/ai-agriculture-chat/` for any of `loadVarietyProfile | variety_id | variety_resistance | variety_translations`:

```
(no matches)
```

The Symbolic Decision Brain that powers chat **has no awareness** of:

1. Which variety the farmer is growing (`lands.current_crop_variety_id`).
2. Whether that variety is resistant/susceptible to the candidate hypothesis (`variety_resistance.resistance_level`).
3. Variety-specific water demand or critical irrigation stages.
4. Climate / soil suitability mismatch warnings for the variety.

This directly contradicts the consumer contract in `mem://database/variety-master-schema-v1` §3.1, §3.4, §3.5:

> "Hypothesis confidence is downweighted when a matching `variety_resistance` row exists with `R`/`HR`."  
> "Schedule builder must skip prophylactic chemical tasks when … resistance_level IN ('R','HR') …"

**Impact:** The brain may recommend a fungicide for a disease the variety is resistant to, with no degradation of confidence and no `VARIETY_RESISTANT` flag in the response.

---

## 4. Cross-crop pipeline test (deterministic, code-level)

Without live `ai_decision_log` rows we cannot replay. Instead we mapped the routing path per crop family from `agents/intent-classifier.ts` + `decision/response-generator.ts`:

| Crop family | Has rules? | Has varieties? | Will reach symbolic engine? | Outcome on diagnostic query |
|---|---|---|---|---|
| Sugarcane | ✅ 529 | ✅ 5 | ✅ | Deterministic |
| Cotton/Rice/Wheat/Maize/Soybean | ✅ 117–133 | ✅ partial | ✅ | Deterministic |
| Tomato/Brinjal/Potato/Onion/Chili | ✅ 120–134 | ✅ partial | ✅ | Deterministic |
| **All other 100 crops** (pulses, oilseeds, spices, horticulture, plantation, fodder) | ❌ 0 | ❌ mostly 0 | ❌ falls to LLM template | 🔴 `{symptom}` placeholder bug or generic clarification |

**Conclusion:** "Works for all crops" is currently false. Works for 12 / 112.

---

## 5. AI Crop Schedule × Variety — gap re-confirmation

Re-verified findings from `docs/variety-audit/02-ai-crop-schedule-audit.md`:

1. ✅ `loadVarietyProfile` and `formatVarietyProfileForPrompt` are wired (lines 2545–2546, 4340).
2. 🟡 The variety profile reaches the LLM prompt but the deterministic post-processor in `post-processor.ts` does **not** down-rank tasks against `variety_resistance` — the LLM is asked nicely to skip resistant-pathogen sprays, but nothing enforces it.
3. 🔴 `schedule_tasks` rows do not carry `variety_id`, breaking variety-filtered task retrieval.
4. 🔴 `getMaxDASForCrop()` no longer exists in `index.ts` (replaced by `variety-aware-planner.ts` which is correctly variety-first — good), but downstream task generation still consults `agro-knowledge-base.ts` per-crop matrices that pre-date varieties (violates Core rule "100% of agronomic advice MUST originate from database").

---

## 6. Confidence pipeline (post-fix status)

- `tests/chat/confidence-pipeline.test.ts` → **14 / 14 passing** (rerun this session).
- `ui-response-builder.ts:195` precedence bug fixed.
- `index.ts:1334-1374` widened fallback chain in place.
- DB column drift (`symbolic_confidence` vs `confidence_score`) — no live rows to verify; cannot prove writer runs end-to-end until real traffic generates a log row.

---

## 7. Multi-tenant

- Verified in live trace evidence (`docs/audit-2026-06-07/15-live-trace-evidence.md` §F5).
- `tenant_id` carried via headers, RLS scopes all reads, no leakage observed.
- 1 tenant in DB (`a2a59533…`) → cross-tenant scenarios untestable without a second seed tenant.

---

## 8. Production-readiness blockers (ranked)

| # | Severity | Blocker | Fix surface |
|---|---|---|---|
| **B1** | 🔴 P0 | AI Chat ignores variety entirely | Add `loadVarietyProfile` call in `agents/canonical-state-builder.ts` (or equivalent) and pass profile into `layered-rule-evaluator.ts` + `llm-response-formatter.ts` |
| **B2** | 🔴 P0 | 100 of 112 crops have 0 decision_rules → template fallback emits `{symptom}` | Either: seed minimum rules per crop, OR refuse to leave template placeholders unfilled (sanitizer in `llm-response-formatter.ts`) |
| **B3** | 🔴 P0 | `crop_schedules.variety_id` never persisted (0/28) | Trace insert path in `ai-smart-schedule/index.ts:4243-4268`; confirm `varietyProfile` resolves before insert |
| **B4** | 🔴 P0 | `ai_decision_log` 0 rows → no observability of confidence bridge in prod | Wrap insert in try/catch + structured error log; verify RLS / GRANT on the table |
| **B5** | 🟡 P1 | Resistance gating only narrative, not deterministic | Add `post-processor.ts` filter: skip preventive sprays when `variety_resistance.level ∈ {R, HR}` |
| **B6** | 🟡 P1 | Hard-coded crop matrices in `agro-knowledge-base.ts` violate Core SSOT rule | Demote to DB-fallback-only behind a feature flag |
| **B7** | 🟡 P1 | NO_ACTIVE_CROP short-circuit overwritten downstream (from `15-live-trace-evidence.md` F1-F3) | Bypass filtering/unified-gate/LLM after orchestrator short-circuit |
| **B8** | 🟢 P2 | Single tenant in DB — cannot regression-test leakage | Seed a second test tenant in staging |

---

## 9. Recommended remediation order

1. **B4 first** — without observability we cannot validate any other fix in production.
2. **B7** — completes the confidence-pipeline work already in-flight.
3. **B2** — sanitize template output so worst-case responses are at least coherent.
4. **B1 + B3 + B5** — wire variety into chat and persist it into schedules.
5. **B6** — retire hard-coded matrices.

Estimated effort: **~3 engineering days** for B1–B5, additional 2 days for B6 + regression suite expansion.

---

## 10. What is already production-ready

- ✅ Confidence resolution chain (UI / metadata / persistence — once `ai_decision_log` writes succeed).
- ✅ Multi-tenant header & RLS scoping.
- ✅ Variety master data model & translations (data quality near 100 % on the 23 crops covered).
- ✅ Frontend lazy-loading, PWA caching, build pipeline.
- ✅ Sugarcane-Marathi end-to-end path (with caveats from `15-live-trace-evidence.md`).

---

## 11. Final score

```
Production Readiness Score: 4.4 / 10
Verdict: NOT READY for general release.
Ready for: Sugarcane farmers in Maharashtra (Marathi/Hindi) with NO_ACTIVE_CROP bug fixed.
```

Re-audit gate after B1–B5 land and `ai_decision_log` shows ≥100 rows with non-zero `confidence_score` from real traffic.
