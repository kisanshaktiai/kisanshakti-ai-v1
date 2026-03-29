

# Proactive Intelligence System — Land-Specific Actionable Alerts Fix Plan

## The Critical Gap

The proactive evaluator loads only 8 columns from `lands`:
```
id, farmer_id, tenant_id, current_crop, name, last_sowing_date, center_lat, center_lon
```

But the `lands` table has **65+ columns** including:
- `area_acres` — needed for "how many liters of water"
- `soil_type` — needed for water retention calculations
- `irrigation_type` — DRIP/FLOOD/SPRINKLER efficiency
- `water_source` — well/canal/borewell capacity
- `soil_ph`, `nitrogen_kg_per_ha`, `phosphorus_kg_per_ha`, `potassium_kg_per_ha` — inline soil data
- `current_moisture_status` — direct moisture signal

**Result**: Every alert is generic. An NDVI-drop alert says "check your field" instead of "your 2.5 acre Sugarcane field needs 40,500 liters of water via drip irrigation over 1.5 hours."

The existing `irrigation-decision-module.ts` already has ICAR-based water calculation logic, but it is NEVER called by the proactive evaluator.

## What Changes

### 1. Expand LandContext with land-specific columns (evaluator)

**File**: `supabase/functions/proactive-evaluator/index.ts`

Add to `LandContext` interface:
- `area_acres`, `soil_type`, `irrigation_type`, `water_source`

Update the lands query (line 140) to also select these 4 columns. Populate them in the context-building loop (line 244-296).

### 2. Integrate irrigation-decision-module into evaluator

**File**: `supabase/functions/proactive-evaluator/index.ts`

When an NDVI-drop, CROP_STRESS, or IRRIGATION alert fires, call `calculateIrrigationRecommendation()` with the land's actual data:
- `crop_code` from context
- `growth_stage` from computed stage
- `days_after_sowing` from DAS
- `soil_type` from land
- `irrigation_type` from land (DRIP/FLOOD/SPRINKLER/FURROW)
- `area_acres` from land
- Weather forecast data from context

Embed the result into `trigger_data` so the UI can display it:
```json
{
  "irrigation": {
    "water_liters_total": 101175,
    "water_liters_per_acre": 40470,
    "urgency": "TODAY",
    "duration_hours": 1.5,
    "timing": "Before sunset today",
    "frequency_days": 7
  }
}
```

### 3. Enrich alert messages with land-specific solutions

**File**: `supabase/functions/proactive-evaluator/index.ts`

Update `generateTrilingualMessage()` and `generateTrilingualAction()` to include computed irrigation/fertilizer quantities using `area_acres`. Example output:

- **MR**: `तुमच्या "शिवार 1" शेतात (2.5 एकर) NDVI कमी झाला. ठिबक सिंचनाने 40,470 लिटर पाणी द्या (1.5 तास).`
- **HI**: `आपके "शिवार 1" खेत (2.5 एकर) में NDVI कम हुआ. ड्रिप सिंचाई से 40,470 लीटर पानी दें (1.5 घंटे).`
- **EN**: `NDVI dropped on "Shivar 1" (2.5 acres). Give 40,470 liters via drip irrigation (1.5 hours).`

### 4. Add irrigation solution card to AlertEvidenceSection UI

**File**: `src/components/proactive/AlertEvidenceSection.tsx`

Add display logic for `trigger_data.irrigation` object:
- Show water amount in liters (total for farmer's area)
- Show urgency badge (IMMEDIATE/TODAY/TOMORROW)
- Show duration and timing
- Show irrigation method icon

Add new evidence labels: `water_liters_total`, `irrigation_urgency`, `irrigation_duration`, `irrigation_timing`, `irrigation_method`.

### 5. Add land-filter tabs to ProactiveAlerts page

**File**: `src/pages/ProactiveAlerts.tsx`

Add horizontal scrollable land-name filter chips at the top. Farmer taps a land name to see only that land's alerts. "All" chip shown by default. Uses the existing `land_name` field from the alert join.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/proactive-evaluator/index.ts` | Expand lands query + LandContext, integrate irrigation module, enrich messages with quantities |
| `src/components/proactive/AlertEvidenceSection.tsx` | Add irrigation solution display card |
| `src/pages/ProactiveAlerts.tsx` | Add land-filter tabs |

## What This Does NOT Change

- No changes to AI Chat pipeline
- No changes to crop schedule system
- No new database tables or schema changes
- No changes to `irrigation-decision-module.ts` (used as-is)
- No changes to LLM formatter or narration layer

## Expected Outcome

- NDVI-drop alert on a 2.5-acre sugarcane drip field → "Give 40,470 liters via drip (1.5 hrs)"
- Irrigation alert on a 5-acre cotton flood field → "Give 161,880 liters via flood (3 hrs)"
- Every alert shows the land name prominently and includes computed quantities
- Farmer can filter alerts by specific land/field

