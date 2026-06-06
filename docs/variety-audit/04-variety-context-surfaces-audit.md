# 04 — VarietyContext Consumer Surfaces

You selected four surfaces to consume the unified `VarietyContext`: **ai-agriculture-chat**, **proactive evaluator / alerts**, **schedules-api + farmer_plans**, **frontend land/plan UI**. This file maps current state → required wiring for each.

## 0. Shared Loader (prerequisite)

`supabase/functions/ai-smart-schedule/variety-context-loader.ts` is currently private to one function. Extract to:
```
supabase/functions/_shared/variety-context.ts
  ├─ loadVarietyContext(supabase, { landId?, varietyId?, cropName?, cropVariety?, stateName? })
  ├─ formatVarietyContextForPrompt(ctx, language)
  └─ type VarietyContext
```
All four consumers import from this module. Cache by `variety_id` per request (request-scoped Map) to avoid N+1.

---

## 1. ai-agriculture-chat

**Current:** zero variety lookups; `crop_variety` is passed as text only.

**Wiring:**
| Step | File | Change |
|---|---|---|
| Load on every chat turn | `agents/orchestrator.ts` (land context block ~line 3192) | After `landContext` resolves, call `loadVarietyContext({ landId, cropName: landContext.current_crop, cropVariety: landContext.crop_variety, stateName: landContext.state })`. Attach to `landContext.variety_context`. |
| Inject into LLM prompt | `agents/orchestrator.ts` prompt assembly | Append `formatVarietyContextForPrompt(ctx, language)` after the existing CROP block, dedup against any free-text variety already mentioned. |
| Feed reasoner | `decision/symbolic-reasoner.ts`, `decision/hypothesis-evaluator.ts` | Accept `variety_context` in their input bag; apply resistance multiplier table from `03-symbolic-brain-audit.md` §2.1. |
| Suppress chemical recs | `decision/prescription-gate-enforcer.ts` | Apply suppression rules from `03-…` §2.2. |
| Narration | `decision/response-generator.ts` | Use `ctx.label_<lang>` for farmer-visible mentions; never expose `ctx.variety_code` in body. |

**Memory touched:** none new; reuses `canonical-language-governance`, `symbolic-confidence-ssot-authority`.

---

## 2. Proactive Evaluator / Alerts

**Current:** `proactive_alerts` and `proactive_evaluation_log` have no `variety_id` column. Disease-risk rules in `proactive_rules` fire purely from weather + crop stage. The memory `proactive-disease-risk-modeling` doesn't yet consider variety resistance.

**Wiring:**
| Step | Where | Change |
|---|---|---|
| Migration | DB | `ALTER TABLE proactive_alerts ADD COLUMN variety_id uuid REFERENCES master_products(id); ALTER TABLE proactive_evaluation_log ADD COLUMN variety_id uuid REFERENCES master_products(id);` (next round). |
| Disease gate | proactive evaluator edge function | For each candidate disease alert, look up `variety_resistance` for the land's variety; suppress when level ∈ {HR, R} and downgrade severity by 1 when level = MR. Log skip reason. |
| Irrigation gate | irrigation alert rule | Pull `water_demand_mm_per_season` + `irrigation_sensitivity.critical_stages`; only fire when current stage ∈ `critical_stages` OR rolling water deficit exceeds `water_demand × stage_share × 0.6`. |
| Persistence | both tables | Always write `variety_id` so retrospection can re-evaluate. |

**Memory touched:** add note to `proactive-disease-risk-modeling` and `proactive-irrigation-quantification-logic` after implementation lands.

---

## 3. schedules-api + farmer_plans

**Current:** `schedules-api/index.ts` returns schedule rows + tasks; variety surfaces as `crop_variety` text. `farmer_plans.current_crop_variety_id` exists but no API consumer reads it.

**Wiring:**
| Step | Where | Change |
|---|---|---|
| API enrichment | `schedules-api/index.ts` `GET /schedules` | Join `master_products` on `crop_schedules.variety_id` and return `variety: { id, name, label_<lang>, maturity_days_max, yield_potential_qtl_per_acre, state_match, data_confidence_score, availability_status }`. |
| API enrichment | `schedules-api/index.ts` `GET /farmer-plans` | Same shape, sourced from `farmer_plans.current_crop_variety_id`. |
| Persistence | every POST that writes `crop_schedules` or `farmer_plans` | Always set `variety_id` when resolvable; never overwrite with NULL when input lacks it but DB has it. |
| Persist on `schedule_tasks` | new column `variety_id` (additive) | Lets task retirement/migration follow variety changes. |

---

## 4. Frontend Land/Plan UI

**Current:** `VarietySelector` exists and reads from `master_products`. **Its `onChange` callback is not wired to a persistence path** (see DB audit §5). Land cards and schedule view show `crop_variety` as plain text.

**Wiring (uses existing design tokens, no new direction):**
| Component | Change |
|---|---|
| `src/services/landsApi.ts` | Accept `current_crop_variety_id` in create/update payloads; pass through to Supabase. |
| `src/hooks/useLands.ts` | Surface `current_crop_variety_id` in returned shape. |
| `src/pages/AddLand.tsx` / `EditLand.tsx` | Render `VarietySelector`; persist selected id to `lands.current_crop_variety_id`. |
| `LandCard` (search & locate the existing card component) | Show variety badge `name [code]`, small resistance chip when ≥1 HR/R row exists, availability flag when ≠ `available`. |
| `AIScheduleDashboard.tsx` | When schedule row has `variety` payload, render header chip with `state_match` warning if false; show `data_confidence_score` pill. |
| Optional | New `useVarietyContext(landId)` hook calling a new `schedules-api?action=variety-context&landId=…` endpoint so the UI never re-implements join logic. |

**Out of scope:** redesigning the dropdown, adding visual directions, or changing color tokens — purely additive chips/badges using current `Badge` variants.

---

## 5. Multi-Tenant + Auth Safety

All four surfaces already enforce tenant isolation upstream (`tenantMiddleware`, RLS on `lands`). The variety join is read-only and uses `master_products` (catalog, tenant-agnostic) — no new RLS surface introduced.
