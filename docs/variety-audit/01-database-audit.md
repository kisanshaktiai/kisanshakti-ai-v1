# 01 — Database Audit: Variety Intelligence

_Audit window: 2026-06-06. Read-only inspection of `public` schema._

## 1. Variety Core Inventory

| Table | Rows | Purpose | RLS | Notes |
|---|---|---|---|---|
| `master_products` (`product_type='seed'`) | **90** | SSOT for varieties (Phase 1+2 backfill complete) | ✅ | All 90 carry maturity, climate, soil, irrigation_sensitivity, agro_ecological_suitability; 89/90 have `water_demand_mm_per_season`. |
| `variety_resistance` | **131** | CIMMYT-scale resistance per pathogen | ✅ | **CRITICAL — see §3.1** |
| `variety_translations` | **720** | Per-language names + synonyms | ✅ | 8 langs × 90 varieties (avg) — healthy. |
| `variety_source_references` | **101** | Gazette / ICAR / SAU evidence | ✅ | OK. |
| `variety_review_queue` | n/a | Curator workflow | ✅ | Not consumed by runtime. |
| `master_companies` | n/a | Breeder / seed company directory | ✅ | Linked via `master_products.company_id`. |
| `master_product_variety_crops` | n/a | M:N crop applicability | ✅ | Currently unused by runtime loaders. |
| `v_crop_varieties` | view | Convenience view for UI dropdowns | n/a | Used by `VarietySelector.tsx` only. |

## 2. Consumer Surface Map

Every column anywhere in `public` named `*variety*`:

| Table | Column | Type | Has FK → master_products? |
|---|---|---|---|
| `lands` | `current_crop_variety_id` | uuid | **NO** |
| `farmer_plans` | `current_crop_variety_id` | uuid | **NO** |
| `crop_schedules` | `variety_id` | uuid | **NO** |
| `crop_schedules` | `crop_variety`, `intercrop_variety`, `intercrop_2_variety`, `intercrop_3_variety` | text | text-only, no FK |
| `land_crops` | `variety_id` | uuid | **NO** |
| `land_crops` | `crop_variety` | text | — |
| `crop_history` | `variety_id`, `variety` | uuid+text | **NO** |
| `crop_baseline_guidelines_v2` | `variety_id` | uuid | **NO** |
| `market_prices` | `variety_id`, `variety` | uuid+text | **NO** |
| `decision_rules` | `variety_applicable` | text[] | informational tag only |
| `produce_listings` | `variety` | text | — |
| `yield_predictions` | `variety` | text | — |

### Implication
Zero foreign keys point at `master_products`. Every `variety_id` column is a **dangling uuid** — nothing prevents orphaned references, no cascade on variety retirement, no join validation by the planner.

## 3. Data Quality Findings

### 3.1 CRITICAL — `variety_resistance.observation_code` orphans
```
SELECT COUNT(*) FROM variety_resistance vr
LEFT JOIN observation_master om USING (observation_code)
WHERE om.observation_code IS NULL;
→ 131 / 131
```
**Every single resistance row** references an observation code that does not exist in `observation_master`. Until this is reconciled, the symbolic brain cannot join resistance to observations, and Phase 4 (resistance-aware confidence) is a no-op. Likely root causes:
- Resistance rows use threat-centric codes (e.g. `RED_ROT`, `DOWNY_MILDEW`) while `observation_master` uses crop-prefixed observation codes (e.g. `SC_DISEASE_RED_ROT_001`).
- Backfill seeded codes from a different taxonomy.

**Fix path (next round):** add `variety_resistance.canonical_observation_code` resolved through `observation_aliases`, plus a curation script that maps each of the 131 distinct codes to an existing `observation_master.observation_code`. Add an FK + NOT VALID constraint to prevent future drift.

### 3.2 CRITICAL — variety adoption is 0%
| Surface | With variety_id | Total |
|---|---|---|
| `lands.current_crop_variety_id` | **0** | 40 |
| `crop_schedules.variety_id` | **0** | 27 |

Despite the columns existing (Phase 1) and `ai-smart-schedule` persisting `variety_id` on insert (Phase 3), no production rows carry it yet. This means:
- The variety-aware schedule path has never executed against real farmer data.
- `VarietySelector` writes are not reaching `lands` (column wiring gap, see §5).
- Existing 27 schedules were generated pre-Phase 3 or with `cropVariety` as free text.

### 3.3 Intercrop variety columns are text
`lands.intercrop_variety`, `intercrop_2_variety`, `intercrop_3_variety` and the matching columns on `crop_schedules` are `text`. Intercrops cannot benefit from variety intelligence today.

### 3.4 Duplicate-shape variety storage
The same logical fact lives in three places:
- `crop_schedules.crop_variety` (text) + `crop_schedules.variety_id` (uuid)
- `lands.current_crop_variety_id` (uuid) — no text mirror
- `crop_history.variety` (text) + `crop_history.variety_id` (uuid)

Risk: schedule rows are reachable by text but not by uuid, defeating join-based intelligence.

### 3.5 Missing indexes (relative to next-round joins)
Present (good):
- `idx_master_products_state_ids` GIN, `idx_master_products_state_suitability` GIN
- `idx_variety_resistance_variety/obs/level`
- `idx_variety_translations_variety/lang` + unique (variety_id, language_code)
- `idx_crop_schedules_variety`, `idx_lands_current_crop_variety_id`

Missing / recommended:
- Composite `(variety_id, observation_code)` on `variety_resistance` (currently two separate b-trees).
- GIN on `master_products.agro_ecological_suitability` for upcoming JSONB filters.
- Partial index `master_products(crop_id) WHERE product_type='seed'` for VarietySelector queries.
- `farmer_plans(current_crop_variety_id)` — missing.

## 4. Relationship Matrix (current vs required)

```text
                            current FK     required FK / behaviour
master_products(id) ◀───── lands.current_crop_variety_id          NONE    →  FK + partial CHECK product_type='seed'
                    ◀───── farmer_plans.current_crop_variety_id   NONE    →  FK
                    ◀───── crop_schedules.variety_id              NONE    →  FK
                    ◀───── land_crops.variety_id                  NONE    →  FK
                    ◀───── crop_history.variety_id                NONE    →  FK
                    ◀───── proactive_alerts.variety_id            COLUMN MISSING → add nullable uuid + FK
variety_resistance ─────▶ observation_master(observation_code)   BROKEN  →  curate + FK
variety_translations ───▶ master_products(id)                    OK (ON DELETE CASCADE)
variety_source_references ─▶ master_products(id)                 OK
```

## 5. Frontend Write-Path Gap

`src/components/crops/VarietySelector.tsx` returns a `VarietyOption` to its parent via `onChange`. Searched `src/services/landsApi.ts` and `src/hooks/useLands.ts` — **neither references `variety_id` or `current_crop_variety_id`**. So the picker exists but its chosen value is not persisted to `lands`, which fully explains the 0% adoption in §3.2.

## 6. Ranked Action List (passed to `05-backlog-and-migration-plan.md`)

| # | Severity | Action |
|---|---|---|
| 1 | 🔴 P0 | Reconcile `variety_resistance.observation_code` ↔ `observation_master.observation_code` (131 rows). Without this, resistance-aware reasoning is dead. |
| 2 | 🔴 P0 | Wire `VarietySelector` → `landsApi` → `lands.current_crop_variety_id` so adoption can begin. |
| 3 | 🔴 P0 | Add FKs `lands / farmer_plans / crop_schedules / land_crops / crop_history . variety_id → master_products(id)` with partial CHECK on `product_type='seed'`. |
| 4 | 🟡 P1 | Add `variety_id uuid` column + FK on `proactive_alerts`, `proactive_evaluation_log`. |
| 5 | 🟡 P1 | Add composite index `variety_resistance(variety_id, observation_code)`, GIN on `agro_ecological_suitability`, partial `master_products(crop_id) WHERE product_type='seed'`. |
| 6 | 🟢 P2 | Migrate intercrop_variety columns from text → uuid with text mirror retained for legacy. |
| 7 | 🟢 P2 | Introduce `variety_completeness_score` trigger replacing manual `data_completeness_score` bumps. |
