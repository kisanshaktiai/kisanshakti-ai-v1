

# Product Mapping: Ingredient → Market Products

## Problem
When a rule fires (e.g., `active_ingredient: "Chlorpyrifos 20% EC"`), the farmer sees only the scientific ingredient name. The `master_products` table contains real market product names (`brand` field like "Coragen/Ferterra/Ampligo") but is never queried during response generation.

## Current State
- `decision_rules.active_ingredient` → directly shown to farmer as product name
- `master_products` has `active_ingredients` (JSONB array with `{name, percentage, formulation}`) and `brand` (market names)
- **Missing data**: No Chlorpyrifos product exists in `master_products` — needs insertion
- `supabase_client` is already passed through the formatter pipeline

## Architecture

```text
decision_rules.active_ingredient ("Chlorpyrifos 20% EC")
       ↓
  extractIngredientKeyword("Chlorpyrifos")
       ↓
  master_products WHERE active_ingredients->name ILIKE '%Chlorpyrifos%'
       AND suitable_crops contains crop
       AND status = 'active'
       ↓
  brand: "Dursban/Lorsban/Chlorban"  →  split into array
       ↓
  Attach to response: ingredient + recommended_products[]
```

## Implementation Steps

### Step 1: Insert Missing Chlorpyrifos Product
Insert into `master_products` table via data operation — Chlorpyrifos 20% EC with brands "Dursban/Lorsban/Tafaban" for sugarcane.

### Step 2: Create `lookupMarketProducts` Helper
New function in `index.ts` (or a small helper module):
- Input: `supabaseClient`, `activeIngredient` string, `cropCode` string
- Extract keyword from ingredient (e.g., "Chlorpyrifos 20% EC" → "Chlorpyrifos")
- Query `master_products` WHERE `active_ingredients::text ILIKE '%keyword%'` AND `suitable_crops::text ILIKE '%crop%'` AND `status = 'active'`
- Return top 3 brand names (split `/` delimiter)
- In-memory cache with 6-hour TTL

### Step 3: Integrate into `buildFormattedRecommendationsList`
After line 3151 where `richData.active_ingredient` is resolved:
- Call `lookupMarketProducts(supabase, richData.active_ingredient, cropCode)`
- If products found: append "📦 बाजारात उपलब्ध: Dursban 20 EC, Lorsban 20 EC" (localized)
- If no products found: show ingredient-only with "स्थानिक उपलब्ध फॉर्म्युलेशन तपासा" fallback

### Step 4: Integrate into LLM Formatter Prompt
In `llm-response-formatter.ts`, add `recommended_products` to the structured data block sent to the LLM so it can narrate product names in farmer language.

### Step 5: Integrate into `buildResponseFromDecisionOutput`
Same product lookup at line 3366 where `richData.active_ingredient` is used.

### Step 6: Pass `supabaseClient` to fallback builders
`buildFormattedRecommendationsList` and `buildResponseFromDecisionOutput` currently don't receive `supabase`. Add it as a parameter so they can call `lookupMarketProducts`.

## Files to Modify

| File | Change |
|------|--------|
| Database (`master_products`) | Insert Chlorpyrifos 20% EC product record |
| `supabase/functions/ai-agriculture-chat/index.ts` | Add `lookupMarketProducts()` helper with cache; integrate into `buildFormattedRecommendationsList` and `buildResponseFromDecisionOutput`; pass `supabase` to both functions |
| `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` | Add `recommended_products` field to LLM prompt data block |

## Farmer Output (Before → After)

**Before:**
```
📌 शिफारसी:
1. Chlorpyrifos 20% EC @ 500ml/acre in 200L water
```

**After:**
```
📌 शिफारसी:
1. Chlorpyrifos 20% EC @ 500ml/acre in 200L water
   📦 बाजारात उपलब्ध: Dursban 20 EC, Lorsban 20 EC, Tafaban 20 EC
```

## Safety
- If `master_products` query fails or returns empty → show ingredient-only (never block advisory)
- Cache prevents repeated DB calls (6h TTL)
- No new response builders introduced — augments existing paths only

