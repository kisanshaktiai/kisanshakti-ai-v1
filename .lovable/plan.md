## Problem (audit findings)

Looking at `SmartLandConfirmCard.tsx` + `lands-api?action=infer-context` + `lands` table schema:

1. **`country` is never stored.** The `lands` table currently has `state, district, taluka, village` (text) and `state_id, district_id, taluka_id, village_id` (uuid) — but **no `country` / `country_id` column at all.** Country is also not in the form payload.
2. **Location is read-only.** AI-inferred Village › Taluka › District is shown as a tiny pill with no way to correct it. If Google returns the wrong village (very common in rural India) the farmer is stuck.
3. **Admin-ID resolution is fragile.** `lands-api` uses `ilike '<name>'` (exact match) against `states/districts/talukas/villages` to map names → UUIDs. Result on real data: `state_id` usually resolves, `district_id` sometimes, `taluka_id`/`village_id` almost never (villages table only has 8 rows total). So most lands get saved with text-only location and no FK linkage — breaks downstream joins (weather zones, market prices, govt scheme matching).
4. **Soil / Water / Irrigation are editable** (bottom-sheet picker) — that pattern works well and we'll re-use it for location.
5. **No "AI suggested vs farmer-confirmed" distinction** for location chips, even though the rest of the card already uses `FieldChip` with confidence + source badges.

## Goals

- Every saved land carries the **full administrative chain**: Country → State → District → Taluka → Village (both display name + FK id where available).
- Farmer can **correct any auto-filled location field** in one tap, with the same bottom-sheet UX used for soil/water/irrigation.
- Default country = **India** (single-country app today) but stored explicitly so future expansion is trivial.
- AI inference still pre-fills, but every value is overridable; manual edits flip confidence to 1.0 + source to `farmer` (already wired for the other chips).

## Plan

### 1. Database — add country columns to `lands`

Migration:
- `ALTER TABLE public.lands ADD COLUMN country text NOT NULL DEFAULT 'India';`
- `ALTER TABLE public.lands ADD COLUMN country_code text NOT NULL DEFAULT 'IN';`
- Backfill is automatic via DEFAULT.
- No RLS change needed (existing policies cover the row).

(We do **not** add a `countries` reference table — overkill for a single-country app. `country_code` ISO-2 is enough for future filtering.)

### 2. Edge function — harden `lands-api?action=infer-context`

In `supabase/functions/lands-api/index.ts`:
- Add `country` + `country_code` to the response (`'India'` / `'IN'` derived from Google `country` address component, defaulting to India if missing).
- Replace the brittle `ilike '<exact>'` admin-ID resolution with a **two-pass** match: (a) exact, then (b) `ilike '%<name>%'` scoped to the parent ID. This dramatically improves district/taluka hit-rate.
- When village can't be resolved against the (mostly empty) `villages` table, still return the Google `village` string — the form will treat it as free text.

### 3. Frontend — make location fully editable

**`useUnifiedLocation` is already in the codebase** (states/districts/talukas/villages with caching + cascade). Re-use it — no new hook needed.

In `SmartLandConfirmCard.tsx`:
- Add a new **"Location"** section above "Land character" with 5 `FieldChip` rows:
  Country · State · District · Taluka · Village
  Each shows current value + AI confidence badge + a tap target.
- Extend `PickerKind` with `'country' | 'state' | 'district' | 'taluka' | 'village'`.
- Picker bottom sheet:
  - Country: fixed list `[India]` for now (locked but visible — explicit beats hidden).
  - State: list from `useUnifiedLocation().states`.
  - District: list from `loadDistricts(state_id)` — picker is disabled with hint "Select State first" if `state_id` missing.
  - Taluka: list from `loadTalukas(district_id)` — same gating.
  - Village: list from `loadVillages(taluka_id)` **plus** a free-text input at the top (`Use "<typed>"`) because the villages table is sparse. Free text saves into `village` (string) without `village_id`.
- Cascading reset: changing State clears district/taluka/village; changing District clears taluka/village; etc.
- Add a search input inside the picker sheet (states ≈36, districts ≈767, talukas ≈3547 → search is mandatory for talukas).
- Manual selection sets `confidence[location] = 1.0`, `sources[location] = 'farmer'` (matches existing soil/water pattern).

### 4. Save payload

Update `landsApi.createLand` call in the card to include:
- `country: form.country || 'India'`
- `country_code: form.country_code || 'IN'`
All existing string + id fields for state/district/taluka/village stay (already wired).

### 5. Service layer

`src/services/landsApi.ts`: extend the create payload type with `country?: string; country_code?: string;`. The edge function passes the body straight to Supabase insert, so no further wiring needed.

### 6. Edit page parity

`src/pages/EditLand.tsx` already exists. Add the same 5 location chips + picker so corrections after creation are also possible (uses the exact same component logic — extract `LocationPickerSection` for reuse between Add and Edit).

## Files to touch

- **migration (new)** — add `country`, `country_code` to `lands`
- **edit** `supabase/functions/lands-api/index.ts` — country in infer-context, fuzzy ID resolver
- **edit** `src/services/landsApi.ts` — payload type
- **new** `src/components/land/LocationPickerSection.tsx` — 5 chips + picker sheet, reusable
- **edit** `src/components/land/SmartLandConfirmCard.tsx` — mount LocationPickerSection, pass country in save
- **edit** `src/pages/EditLand.tsx` — mount the same section

## Out of scope (intentionally)

- A real `countries` reference table — single-country app today, deferred.
- Bulk-importing villages — separate data-quality task; the free-text fallback in the village picker handles it for now.
- Renaming `irrigation_source` (legacy column) — already superseded by `irrigation_type`, keep both for back-compat.

## Rollback

- DB: `ALTER TABLE lands DROP COLUMN country, DROP COLUMN country_code;` (defaults make this safe).
- UI: `localStorage.setItem('smartLandConfirm','off')` already falls back to the legacy wizard.
