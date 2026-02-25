

# Plan: Migrate Hardcoded Product Database to `master_products` Table

## Summary

Migrate ~40 products from the hardcoded `PRODUCT_DATABASE` array (lines 130-1256), ~50 IPM recommendations from `IPM_DATABASE` (lines 1381-2112), ~30 disease recommendations from `DISEASE_DATABASE` (lines 2129-2428), and banned/restricted chemical lists from `decision-graph-bridge.ts` into database tables. Then refactor the bridge to query the DB at runtime.

## Current State

- `decision-graph-bridge.ts` is **3,043 lines**, with ~2,300 lines being hardcoded data arrays
- `master_products` table exists with a rich schema (70+ columns) including `pest_targets`, `disease_targets`, `suitable_crops`, `ai_metadata`, `spray_volume_per_acre`, `pre_harvest_interval_days`, `translations`, etc.
- Only **3 products** currently exist in `master_products` with `ai_recommendable = true`
- `master_companies` table exists; no `icar-recommended` company yet
- `master_product_categories` table exists; `insecticides`, `fungicides`, `herbicides` slugs already present; need `biocontrol` and `botanical`
- `chemical_regulatory_status` table does **not** exist
- The orchestrator already has `this.supabase` and passes it to many subsystems, but `evaluateDecisionGraph()` currently does NOT receive a supabase client
- `evaluateDecisionGraph` is called from 3 places: `diagnostic-flow-controller.ts` (2x) and `rule-engine-executor.ts` (1x)

## Technical Plan

### File 1: Migration SQL
**Create**: `supabase/migrations/20260225_migrate_products_to_master.sql`

This single migration file will:

1. **Create `chemical_regulatory_status` table** with columns: `id`, `chemical_name` (UNIQUE), `status` (CHECK: banned/restricted/watch_list), `regulatory_body`, `ban_date`, `reason`, `alternatives` (jsonb), `created_at`. Enable RLS with a public read policy.

2. **Insert ICAR company** into `master_companies` (slug: `icar-recommended`, company_type: `regulatory`)

3. **Insert missing categories** into `master_product_categories`: `biocontrol`, `botanical`

4. **Insert all ~40 products** from `PRODUCT_DATABASE` into `master_products`, mapping:
   - `product_name` -> `name`
   - `brand_examples[0]` -> `brand`
   - `active_ingredient` -> `active_ingredients` jsonb array
   - `dosage` + `dosage_per_acre` -> `dosage_instructions`
   - `application_method` -> `application_method`
   - `target_pests` -> `pest_targets` jsonb array
   - `target_diseases` -> `disease_targets` jsonb array
   - `target_crops` -> `suitable_crops` jsonb array
   - `phi_days` -> `pre_harvest_interval_days`
   - `water_volume_per_acre` -> `spray_volume_per_acre` jsonb
   - `organic_approved` -> `organic_certified`
   - `ipm_level`, `efficacy_percent`, `mode_of_action`, `timing`, `weather_restrictions`, `safety_precautions`, `price_range_per_unit`, `repeat_interval_days`, `max_applications`, `nozzle_type`, `formulation`, `brand_examples` -> `ai_metadata` jsonb
   - `names` -> `translations` jsonb
   - SKU generated from normalized product name
   - `product_type` mapped: ipm_level 3 = `botanical`, ipm_level 4 (bio agents) = `biocontrol`, ipm_level 5-6 + pest targets = `pesticide`, ipm_level 5-6 + disease targets = `fungicide`
   - All set to `ai_recommendable = true`, `status = 'active'`

5. **Insert all 21 banned chemicals + 8 restricted + 1 watch_list** into `chemical_regulatory_status`

6. **Create performance indexes**:
   - GIN index on `(pest_targets, disease_targets, suitable_crops)` WHERE ai_recommendable
   - Index on `(ai_metadata->>'ipm_level')` WHERE ai_recommendable
   - Index on `organic_certified` WHERE ai_recommendable

### File 2: Product Repository
**Create**: `supabase/functions/ai-agriculture-chat/agents/product-repository.ts`

A DB-query layer providing:
- `findProductsForPest(supabase, crop, pest, severity, organicOnly)` - queries `master_products` filtering by `pest_targets ? pest`, `suitable_crops ? crop`, IPM level from `ai_metadata`, ordered by `effectiveness_rating` DESC
- `findProductsForDisease(supabase, crop, disease, severity, organicOnly)` - same but for `disease_targets`
- `checkChemicalStatus(supabase, chemicalName)` - queries `chemical_regulatory_status`
- `getIPMRecommendations(supabase, crop, pest, disease, severity)` - returns products grouped by IPM level for multi-tier response

Uses `.contains()` for jsonb array matching. Falls back gracefully if no results (returns null, letting existing fallback logic continue).

### File 3: Refactor `decision-graph-bridge.ts`
**Modify**: `supabase/functions/ai-agriculture-chat/agents/decision-graph-bridge.ts`

Changes:
1. **Add supabase parameter** to `evaluateDecisionGraph(supabase, context, traceId)` and `extractProductRecommendation(supabase, ...)`
2. **REMOVE** `PRODUCT_DATABASE` array (~1,126 lines: 130-1256)
3. **REMOVE** `IPM_DATABASE` array (~731 lines: 1381-2112)
4. **REMOVE** `DISEASE_DATABASE` array (~299 lines: 2129-2428)
5. **KEEP** `BANNED_CHEMICALS`, `RESTRICTED_CHEMICALS`, `NEONICOTINOIDS` as code-level safety failsafes (21 lines), but also query `chemical_regulatory_status` as backup
6. **Refactor** `extractProductRecommendation()` to call `product-repository.ts` functions instead of filtering hardcoded array
7. **Refactor** `evaluatePestIPM()` to query DB products grouped by IPM level
8. **Refactor** `evaluateDiseaseManagement()` to query DB products for disease targets
9. **Keep** all the `buildIPMRecommendation()`, `convertToRuleResults()`, `normalizeForMatching()`, `codesMatch()` helper functions

This reduces the file from ~3,043 lines to ~800 lines.

### File 4-6: Update callers to pass supabase
**Modify**: 3 files that call `evaluateDecisionGraph`:

1. `agents/diagnostic-flow-controller.ts` - Add supabase parameter, pass from session context or constructor
2. `agents/rule-engine-executor.ts` - Pass supabase from its existing context
3. `agents/index.ts` - No change needed (just re-exports)

### File 7: Update orchestrator
**Modify**: `agents/orchestrator.ts` - Ensure `this.supabase` is passed through to diagnostic-flow-controller and rule-engine-executor when they call `evaluateDecisionGraph`

## Data Inventory (40 products to migrate)

| Category | Products | IPM Level |
|----------|----------|-----------|
| Diamide insecticides | Chlorantraniliprole, Flubendiamide | 5 |
| Neonicotinoids | Imidacloprid, Thiamethoxam, Acetamiprid | 5 |
| Phenylpyrazoles | Fipronil | 5 |
| Spinosyns | Spinosad, Emamectin benzoate | 4-5 |
| Lipid inhibitors | Diafenthiuron, Spiromesifen | 5 |
| IGRs | Pyriproxyfen, Buprofezin | 4 |
| Pyrethroids | Lambda cyhalothrin, Cypermethrin | 6 |
| Botanicals | Neem oil, NSKE, Pongamia oil | 3 |
| Biocontrol agents | Trichogramma (x2), Cotesia, Beauveria, Metarhizium, Verticillium, NPV, Chrysoperla | 3-4 |
| Biofungicides | Trichoderma, Pseudomonas, Bacillus subtilis | 4 |
| Strobilurin fungicides | Azoxystrobin | 5 |
| Triazole fungicides | Propiconazole, Hexaconazole, Tebuconazole, Tricyclazole | 5 |
| Contact fungicides | Mancozeb, Copper oxychloride, Carbendazim | 4-5 |

## Risk Mitigation

- **Fallback safety**: If DB query returns 0 results, the system logs a warning but does not crash. The IPM/disease evaluation functions return empty arrays gracefully.
- **Code-level chemical bans kept**: `BANNED_CHEMICALS` array remains as a hard failsafe even though DB is also queried. A banned chemical will NEVER be recommended even if DB query fails.
- **No schema changes**: Uses existing `master_products` columns exactly as-is. All custom IPM data goes into `ai_metadata` jsonb.
- **Backward compatible**: The function signature change (`supabase` parameter added as first arg) requires updating only 3 call sites.

