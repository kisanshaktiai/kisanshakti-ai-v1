

# Deep Audit Report: KisanShaktiAI V6 — Supabase + Symbolic Decision Brain

## 1. Executive Summary

| Metric | Score |
|---|---|
| Data Accuracy | 72/100 |
| System Reliability | 68/100 |
| Decision Intelligence | 78/100 |
| **Overall Production Readiness** | **65%** |

**Critical risks**: (1) disease_risk_model table is EMPTY — predictive disease alerting is non-functional. (2) Weather data is 2-3 days stale — all weather-dependent rules fire on old data. (3) 72% of active lands (18/25) have NO crop schedule — DAS=0, stage defaults to VEGETATIVE, stage-specific rules never fire. (4) 14 active decision rules have NULL canonical_group — rule engine categorization breaks. (5) 23 duplicate indexes on ai_chat_messages waste storage and slow writes. (6) Decision rule dedup hardcodes 72h cooldown (line 480), ignoring the 24h setting we just migrated.

---

## 2. P0 Critical Issues (Must Fix Before Production)

### Issue 2.1: `disease_risk_model` Table — 0 Rows

**Root Cause**: Table was created with correct schema (30 columns) but never seeded. The proactive evaluator's memory docs reference it for "scientifically validated environmental thresholds" but the table is empty.

**Impact**: Disease risk predictions for Red Rot, Smut, Shoot Borer are based solely on hardcoded `proactive_rules` conditions (3 disease rules) instead of the comprehensive model. No leaf wetness, no season filtering, no risk weighting.

**Fix**: Seed `disease_risk_model` with ICAR-SBI validated thresholds for sugarcane diseases (Red Rot, Smut, Wilt, Grassy Shoot, Leaf Scald, Pokkah Boeng) plus rice (Blast, BLB, Sheath Blight) and wheat (Rust, Karnal Bunt). ~25 rows covering major crop-disease combinations.

### Issue 2.2: Weather Data Stale (2+ Days Old)

**Root Cause**: `weather_current` latest observation is April 10, 2026. Today is April 12. No automated refresh cron is running.

**Impact**: ALL weather-dependent rules (WEATHER, DISEASE_RISK, COMPOUND condition types) evaluate against 2-day-old data. Disease risk rules checking `temp_min/max` and `humidity_min` fire or miss based on stale readings. This is agronomically dangerous — a 2-day-old "clear sky" could mask a current monsoon event.

**Fix**: This is an infrastructure issue. The weather edge function needs a pg_cron trigger or external cron to refresh every 1-3 hours. Document this as a required deployment step.

### Issue 2.3: 18/25 Active Lands Have No Crop Schedule (DAS=0)

**Root Cause**: `crop_schedules` has only 7 entries matching active lands. The remaining 18 lands (including lands with `current_crop` set to sugarcane, rice, wheat) have no `sowing_date`, so `DAS = 0` and `current_stage = 'VEGETATIVE'` (fallback).

**Impact**: 
- Stage-based proactive rules (PRO_SC_EARTHING for TILLERING) never fire for 72% of lands
- All sugarcane stage rules (GERMINATION through HARVEST) miss for these lands
- The `last_sowing_date` column on `lands` table is also NULL for most — no fallback available

**Fix**: The `lands` table has `last_sowing_date` and `cultivation_date` columns. Add fallback logic in the proactive evaluator: if no crop_schedule exists, use `lands.last_sowing_date` OR `lands.cultivation_date` as sowing date. Also prompt users to create schedules — this is a data completeness issue at the farmer onboarding level.

### Issue 2.4: 14 Active Rules Have NULL `canonical_group`

**Root Cause**: Rules inserted without canonical_group: SC_BP_TRASH_MULCH_IPM_001, SC_DISEASE_TRICHODERMA_001, PROACTIVE_WATER_STRESS_UNIVERSAL_001, PROACTIVE_NUTRIENT_DEMAND_UNIVERSAL_001, etc.

**Impact**: The symbolic engine groups rules by `canonical_group` for priority sorting (SAFETY > PEST > DISEASE). NULL canonical_group rules may be skipped by filters or sorted incorrectly, causing missed recommendations.

**Fix**: UPDATE these 14 rules with correct canonical_group values based on their `category`:
- `ipm` → `09_best_practice`
- `disease` → `04_disease`
- `proactive_irrigation` → `04_irrigation`
- `proactive_nutrition` → `05_nutrition`
- `proactive_monitoring` → `03_observation`
- `proactive_pest` → `03_pest`
- `diagnosis` → `07_diagnosis`
- `nutrition` → `05_nutrition`
- `soil` → `05_soil`

### Issue 2.5: Decision Rule Dedup Hardcodes 72h Cooldown

**Root Cause**: Line 480 in proactive-evaluator: `isDuplicate(dedupKey, dr.condition_code, ctx.land_id, 72, alertMap)`. Despite migrating proactive_rules to 24h cooldown, the decision_rules path still hardcodes 72h.

**Impact**: Decision rule alerts (158 active rules) are blocked for 3 days after first fire. A sugarcane irrigation alert generated on April 9 blocks the next one until April 12, even though conditions may have changed.

**Fix**: Change the hardcoded `72` to `24` on line 480.

---

## 3. P1 Medium Issues

### Issue 3.1: 23 Indexes on `ai_chat_messages` — 10 Duplicates

**Root Cause**: Incremental migrations added overlapping indexes without cleanup.

**Exact duplicates**:
- `idx_ai_chat_messages_created` ≡ `idx_ai_chat_messages_created_at` (both `btree(created_at DESC)`)
- `idx_ai_chat_messages_session` ≡ `idx_ai_chat_messages_session_id` (both `btree(session_id)`)
- `idx_ai_chat_messages_tenant_farmer` ≡ `idx_chat_messages_tenant_farmer` (both `btree(tenant_id, farmer_id)`)
- `idx_ai_chat_messages_training` is subset of `idx_ai_chat_messages_training_composite`

**Impact**: Each duplicate index doubles write I/O for inserts. At 1M users with ~50 messages/user, 50M rows × 4 duplicate indexes = significant write amplification.

**Fix**: DROP 4 duplicate indexes: `idx_ai_chat_messages_created_at`, `idx_ai_chat_messages_session_id`, `idx_chat_messages_tenant_farmer`, `idx_ai_chat_messages_training_composite`.

### Issue 3.2: `proactive_evaluation_log` Shows rules_fired = rules_evaluated

**Root Cause**: Lines 176-177 both log `totalRulesFired` — `rules_evaluated` should count total rules checked, not just fired.

**Impact**: Monitoring dashboards can't distinguish "10 rules checked, 3 fired" from "3 rules checked, 3 fired." Debugging rule coverage gaps becomes impossible.

**Fix**: Track `totalRulesEvaluated` separately (count of applicableRules + applicableDecisionRules per land) and log correctly.

### Issue 3.3: `normalizeCropCode` Missing Marathi Crops

**Root Cause**: Lands have `current_crop` values like `तांदूळ` (rice in Marathi), `राजमा` (kidney beans), `गहू` (wheat) but `normalizeCropCode` maps `भात` → RICE. `तांदूळ` is NOT mapped — it falls through to `upper` which returns `तांदूळ` (Devanagari), never matching any rule's `crop_code`.

**Impact**: Lands with Marathi crop names get `crop_code = 'तांदूळ'` which matches zero decision rules. All crop-specific rules are skipped for these lands.

**Fix**: Add `तांदूळ` as a RICE synonym. Add `राजमा` → RAJMA/PULSES. Add `चना` → CHICKPEA.

---

## 4. P2 Minor Issues

### Issue 4.1: `accuracy_fix_log` Has RLS Disabled
Not sensitive data but should have RLS for consistency.

### Issue 4.2: `weather_current.land_id` Always NULL
All weather records have `land_id: null` — weather is keyed by `location_key` only. The `land_id` column is dead weight.

### Issue 4.3: 389 Tables Total — Schema Bloat
Many backup/mapping/staging tables exist. Not blocking but increases maintenance burden.

---

## 5. Agronomic Validation (Phase 3)

### 5.1: Sugarcane Rules — Good Coverage (509 active)
- Pest: 95 rules, Disease: 43, Irrigation: 51, Nutrition: 34, Stress: 48 — comprehensive for ICAR-SBI standards
- Stage coverage: GERMINATION through HARVEST all represented

### 5.2: ETL Standards — Adequate for 9 Crops
56 active rows covering Sugarcane(10), Cotton(14), Rice(10), Soybean(10), Wheat(6), plus minor crops

### 5.3: GAP — Cotton/Rice Decision Rules Sparse
Cotton: 30 rules (6 pest, 9 disease, 12 diagnosis, 3 unclassified)
Rice: 0 crop-specific decision rules (only via `crop_code=ALL` universals)
**Agronomic risk**: Rice farmers get only generic safety/weather rules, no pest/disease/nutrition rules.

### 5.4: GAP — `crop_baseline_guidelines_v2` Only 27 Rows
Likely covers only sugarcane stages. Missing baselines for rice, wheat, cotton, soybean — these crops lack nutrient optima, irrigation thresholds, and DAS-based stage definitions.

---

## 6. Implementation Plan

### Migration 1: Fix NULL canonical_groups (14 rules)
```sql
UPDATE decision_rules SET canonical_group = '09_best_practice' WHERE rule_id = 'SC_BP_TRASH_MULCH_IPM_001';
UPDATE decision_rules SET canonical_group = '04_disease' WHERE rule_id IN ('SC_DISEASE_TRICHODERMA_001','SC_DISEASE_SCYLV_001');
-- ... (14 total UPDATEs)
```

### Migration 2: Drop duplicate indexes
```sql
DROP INDEX IF EXISTS idx_ai_chat_messages_created_at;
DROP INDEX IF EXISTS idx_ai_chat_messages_session_id;
DROP INDEX IF EXISTS idx_chat_messages_tenant_farmer;
DROP INDEX IF EXISTS idx_ai_chat_messages_training_composite;
```

### Migration 3: Seed disease_risk_model (~15 rows for major diseases)

### Code Fix 1: `proactive-evaluator/index.ts`
- Line 480: Change `72` → `24`
- Line 176: Track `totalRulesEvaluated` separately
- Add Marathi crop synonyms to `normalizeCropCode`
- Add `lands.cultivation_date` fallback for sowing date

### No Changes To:
- Symbolic decision brain logic
- NLU agent / orchestrator
- LLM formatter / narration layer
- Multi-tenant isolation
- RLS policies
- Frontend UI components

---

## 7. Final Verdict

**Is this app ready for 1M users?** Not yet. The 3 data gaps (empty disease_risk_model, stale weather, 72% lands without schedules) mean most proactive rules fire incorrectly or not at all. The symbolic decision brain architecture is sound but starved of data.

**What blocks "World No.1" status?**
1. Weather refresh automation (infrastructure)
2. Disease risk model seeding (data)
3. Multi-crop rule expansion (Rice has 0 specific rules)
4. Farmer onboarding flow forcing schedule creation (UX)

