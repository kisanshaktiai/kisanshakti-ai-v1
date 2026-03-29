

# Proactive Intelligence System — Deep Audit Report + Fix Plan

## Audit Status: 7 Issues Found (3 Critical, 2 High, 2 Medium)

---

## What Was Built (Sprint 1 Checklist)

| Item | Status |
|------|--------|
| DB tables: `proactive_rules`, `proactive_alerts`, `proactive_events`, `proactive_evaluation_log`, `disease_risk_model` | Done |
| `decision_rules` enhanced with `is_proactive_rule`, `prediction_type`, `forecast_horizon_days` | Done |
| Edge function: `proactive-evaluator` | Done (with bugs) |
| Frontend: `ProactiveAlerts.tsx` page | Done (with gaps) |
| Hook: `useProactiveAlerts.ts` | Done |
| Route: `/app/proactive-alerts` | Done |
| Config: `supabase/config.toml` entry | Done |
| RLS policies on `proactive_rules` | Done |
| 10 initial rules seeded | Done |

---

## Critical Issues Found

### Bug 1: Edge Function Queries WRONG Column Names (CRITICAL — Will Fail)

The `proactive-evaluator` queries `lands` table with these columns:
- `crop_type` — **DOES NOT EXIST** (correct: `current_crop`)
- `land_name` — **DOES NOT EXIST** (correct: `name`)
- `sowing_date` — **DOES NOT EXIST** (correct: `last_sowing_date` or from `crop_schedules`)
- `coordinates` — **DOES NOT EXIST** (correct: `center_lat` + `center_lon`)

The query will silently return null for all these fields, meaning:
- DAS = 0 for all lands (no sowing_date)
- Stage = always wrong
- Weather = never loaded (no coordinates)
- Crop matching = never matches (no crop_type)

**Result: ZERO alerts will ever be generated.**

### Bug 2: No Home Page Navigation (CRITICAL — Feature Unreachable)

- No alert bell icon on Home page
- No entry in `featureConfig.ts` for proactive alerts
- No navigation link anywhere in the app
- User can only reach `/app/proactive-alerts` by typing the URL manually

### Bug 3: Priority Labels Hardcoded in Marathi Only (HIGH)

`PRIORITY_CONFIG` in `ProactiveAlerts.tsx` has hardcoded Marathi labels:
- `'🔴 अत्यंत महत्त्वाचे'` — only Marathi
- `'🟠 महत्त्वाचे'` — only Marathi

Hindi and English users see Marathi priority labels regardless of their language setting.

### Bug 4: No i18n Translation Keys (HIGH)

Zero translation entries exist in any locale file (`en`, `hi`, `mr`) for the `proactive.*` namespace. All fallback strings are hardcoded Marathi in the component.

### Bug 5: Weather Location Key Mismatch (MEDIUM)

Edge function builds `location_key` from `coordinates` (which doesn't exist). Even if fixed to use `center_lat`/`center_lon`, it rounds to 2 decimals. Must verify this matches the format stored by the weather edge function.

### Bug 6: No Crop Schedule Integration (MEDIUM)

The edge function tries to get `sowing_date` from the `lands` table directly, but actual sowing dates are in `crop_schedules` table. Should JOIN with `crop_schedules` to get accurate DAS and crop stage.

### Bug 7: RLS Missing on `proactive_alerts` for farmer SELECT (MEDIUM)

The hook queries `proactive_alerts` with `.eq('farmer_id', user.id)`, but we need to verify RLS allows authenticated users to read their own alerts.

---

## Fix Plan

### Step 1: Fix Edge Function Column Names
Update `proactive-evaluator/index.ts`:
- `crop_type` → `current_crop`
- `land_name` → `name`
- Remove `sowing_date, coordinates` from lands query
- Use `center_lat, center_lon` for weather lookup
- JOIN `crop_schedules` to get `sowing_date` and crop info per land

### Step 2: Add Home Page Navigation
- Add proactive alerts entry to `featureConfig.ts` with Bell icon
- Add alert bell with unread badge to the Home page header area
- Link to `/app/proactive-alerts`

### Step 3: Fix Multilingual Priority Labels
Replace hardcoded Marathi with i18n-aware labels:
- Use `getLocalizedText` pattern or i18n keys for CRITICAL/HIGH/MEDIUM/LOW
- Add translation keys for all 3 languages

### Step 4: Add i18n Translation Entries
Add `proactive.*` keys to `en.json`, `hi.json`, `mr.json` locale files covering:
- `proactive.title`, `proactive.subtitle`, `proactive.allClear`, `proactive.noAlerts`, `proactive.done`
- Priority labels in all 3 languages

### Step 5: Fix Weather Location Matching
Use `center_lat, center_lon` from lands table, round to 2 decimals to match `weather_current.location_key` format.

### Step 6: Add RLS Policy for Farmer Alert Access
Add SELECT policy on `proactive_alerts`: farmers can only read their own alerts (migration).

### Step 7: Add Crop Schedule Join
Modify edge function to fetch from `crop_schedules` WHERE `land_id` matches AND `status = 'active'` to get accurate sowing date and crop code.

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/proactive-evaluator/index.ts` | Fix column names, add crop_schedule join, fix weather lookup |
| `src/pages/ProactiveAlerts.tsx` | Fix priority labels to be multilingual |
| `src/config/featureConfig.ts` | Add proactive alerts feature entry |
| `src/pages/Home.tsx` | Add alert bell icon with unread badge |
| `src/i18n/locales/mr.json` | Add `proactive.*` translations |
| `src/i18n/locales/hi/advisory.json` (or equivalent) | Add `proactive.*` Hindi translations |
| New migration | RLS SELECT policy on `proactive_alerts` for authenticated farmers |

