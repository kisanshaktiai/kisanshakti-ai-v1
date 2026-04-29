# 2030-Ready Land Capture — Voice-First, AI-Assisted, Data-Complete (Revised)

## Constraints Honored
- **No new edge functions.** Reuse `lands-api`, `ai-query-understanding`, `transcribe-voice`, `text-to-speech`, `weather`, `google-maps-config`. One extension only: add a `?action=infer-context` branch to **`lands-api`** (same function, new code path).
- **Data completeness is non-negotiable.** Every existing column on the `lands` table is captured — directly, AI-prefilled, or as a deferred follow-up — but never silently dropped.

---

## `lands` Table — What We Must Capture (74 columns audited)

Grouped by responsibility:

**A. Identity & ownership (must collect now)**
`name, survey_number, ownership_type, farmer_id, tenant_id`

**B. Geometry (already captured by map)**
`area_acres, area_guntas, area_sqft, boundary_polygon_old, center_point_old, center_lat, center_lon, boundary_geom, location_coords, boundary_method, gps_accuracy_meters, gps_recorded_at, elevation_meters, slope_percentage`

**C. Administrative location (AI prefills, farmer confirms)**
`state, state_id, district, district_id, taluka, taluka_id, village, village_id, location_context (jsonb)`

**D. Land character (AI prefills with confidence)**
`land_type, soil_type, water_source, irrigation_type, irrigation_source`

**E. Soil chemistry (deferred — separate flow)**
`soil_tested, soil_ph, organic_carbon_percent, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, last_soil_test_date, soil_data_source, soil_confidence_level`

**F. Crop lifecycle — CRITICAL per your note (must collect now, with dates)**
`current_crop, current_crop_id, crop_stage, planting_date, cultivation_date, last_sowing_date, expected_harvest_date, harvest_date, previous_crop, previous_crop_id, last_crop, last_harvest_date`

**G. NDVI / processing (system-managed)**
`ndvi_tested, last_ndvi_value, last_ndvi_calculation, ndvi_thumbnail_url, ndvi_geotiff_url, ndvi_status, last_processed_at, tile_id, tile_ids, mgrs_tile_id`

**H. Moisture (system-managed)**
`current_moisture_status, last_moisture_update`

**I. Misc**
`notes, land_documents (jsonb), marketplace_enabled, is_active, deleted_at, created_at, updated_at`

### Crop date contract (your explicit requirement)
For Group F we will store **all four canonical dates**:
- `last_harvest_date` + `last_crop` / `previous_crop` / `previous_crop_id` → records the **previous cycle**.
- `cultivation_date` (land prep) **and** `planting_date` / `last_sowing_date` (sowing) → records the **current cycle start**. We populate all three from a single farmer input ("when did you sow?") plus an optional "land preparation was X days earlier" chip; otherwise `cultivation_date = planting_date`.
- `expected_harvest_date` → auto-derived from `crops.duration_days` table (already exists) at save-time, editable.
- `crop_stage` → derived from `(today − planting_date) / duration_days` and stored.

This guarantees downstream NDVI scheduling, scheduler, proactive evaluator, and decision graph all have the dates they need.

---

## Audit of Current Wizard (`ModernLandWizard.tsx`) — Data Loss Risks

| Issue | Impact |
|---|---|
| `state_id/district_id/taluka_id/village_id` collected but **`state/district/taluka/village` strings sent without IDs** in `landsApi.createLand` payload | Joins to `villages` table fail; weather + decision graph cannot resolve location |
| `cultivation_date` collected, `planting_date` and `last_sowing_date` **never set** | NDVI scheduler + crop-stage engine read `planting_date` → silently degraded |
| `expected_harvest_date` **never computed** | Harvest reminders & PHI calculations broken |
| `crop_stage` **never set on create** | Decision graph stage matching fails on day 0 |
| `previous_crop_id` **never resolved** from `previous_crop` string | Crop rotation rules can't fire |
| `elevation_meters`, `slope_percentage` **never captured** despite Google Elevation API being available | Drainage + irrigation rules degraded |
| `location_context` jsonb **never populated** with reverse-geocoded address | Weather function falls back to coarse lookup |
| Hardcoded soil/water/irrigation lists in component | Drift from `soil_types/water_sources/irrigation_types` reference tables |
| `notes`, `land_documents`, `marketplace_enabled` not exposed | Lost forever after creation unless edited |

---

## New Flow (Single Screen, Progressive)

```text
[Map Save tapped → boundary + area in hand]
        ↓
[lands-api?action=infer-context  POST {centroid, boundary, language}]
   server-side, no new function:
     1. Reverse-geocode via Google (key from google-maps-config) → village/taluka/district/state + IDs
     2. Google Elevation API (same key) → elevation_meters, derived slope
     3. weather function (internal fetch) → current weather + season hint
     4. Nearest 5 lands within 5km (PostGIS ST_DWithin, tenant-scoped)
        → mode of soil_type / water_source / irrigation_type / common current_crop
     5. SoilGrids REST → soil_type fallback if no neighbors
     6. crops table lookup → if neighbor crop dominates, surface as suggestion
     7. Return { fields:{...}, confidence:{...}, sources:{...} }
        ↓
[SmartLandConfirmCard.tsx — single scrollable screen, mobile-first]

  ┌─ Map thumbnail + 1.24 ac (2.4 guntha · 54k sqft) ────┐
  │                                                      │
  │  📍 Pune › Haveli › Wagholi              [edit ▸]   │  ← prefilled chip
  │  ⛰  Elevation 562 m · Slope 1.8%                     │  (auto, hidden detail)
  │                                                      │
  │  🏷  Name:  [ North Field ▾ ]   🎤                  │  ← AI suggests 3, voice override
  │  🧾  Survey No: [ 123/A ]       🎤  (optional)      │
  │  🏡  Owned ●  Leased ○  Shared ○                     │  ← required, big tiles
  │                                                      │
  │  ─── Land character (AI suggested) ───              │
  │  🌱 Soil: Black ●●●●○ (95%)             [change ▸] │  ← confidence dot
  │  💧 Water: Borewell ●●●○○ (70%)        [change ▸] │
  │  🚜 Irrigation: Drip ●●●●● (98%)       [change ▸] │
  │                                                      │
  │  ─── Crop cycle (REQUIRED for accuracy) ───         │
  │  🌾 Current crop:  [ Sugarcane ▾ ]   🎤             │  ← from crops table
  │  📅 Sowed on:  [ Kharif '26 ▾ ] or pick date        │  ← season chip OR date
  │  🛠  Land prepared:  [ same day ▾ | 7d earlier | 14d ] │
  │  📆 Expected harvest: 2027-01-15 (auto, editable)   │
  │  🌿 Stage now: Tillering (auto)                     │
  │                                                      │
  │  ─── Previous cycle (optional but recommended) ───  │
  │  🌾 Previous crop: [ — ▾ ]                          │
  │  📅 Last harvest:  [ — ▾ ]                          │
  │                                                      │
  │  ▸ More details (notes, documents, marketplace)     │  ← collapsed accordion
  │                                                      │
  │  [🎤 Hold to talk]              [💾 Save Land]      │
  └──────────────────────────────────────────────────────┘
```

### Voice layer (uses existing functions)
- **Hold-to-talk mic** → `transcribe-voice` → vernacular text.
- Text → `ai-query-understanding` (existing) with a new *intent profile* `LAND_FORM_FILL` that returns slot JSON (`crop`, `sowing_date`, `irrigation`, `water_source`, `previous_crop`, `last_harvest_date`, `ownership`).
- Slots merge into form state with confidence; TTS confirms via `text-to-speech` ("ठीक आहे, पीक ऊस म्हणून जतन केले").
- Falls back to typing if mic permission denied.

### Offline-safe save
- Reuse existing `useSyncAction` + `offlineDataService` (already in repo).
- Online → `landsApi.createLand` (existing).
- Offline → local IndexedDB write, optimistic id, sync when reconnected.

### Draft resume
- Replace silent `localStorage` overwrite with a one-time modal: "Continue 'North Field' draft from 2 hours ago?" [Resume] [Start fresh].

---

## Edge Function Changes (zero new functions)

### `supabase/functions/lands-api/index.ts` — add ONE branch
```ts
// At top of switch, before existing cases:
if (req.method === 'POST' && url.searchParams.get('action') === 'infer-context') {
  // Body: { centroid:{lat,lng}, boundary:LatLng[], language:string }
  // 1. Google reverse-geocode  (key from Deno.env GOOGLE_MAPS_API_KEY)
  // 2. Google elevation
  // 3. Internal: supabase.rpc('nearest_lands_summary', { lat, lng, radius_m: 5000, p_tenant_id: tenantId })
  // 4. Internal fetch to /weather function (cached)
  // 5. crops table lookup for canonical crop names + duration_days
  // Return { fields:{...}, confidence:{...}, sources:{...} } with corsHeaders
}
```
- All work happens **inside the existing `lands-api` function**; no new function file, no new deploy target.
- Reuses the same `guardTenantAccess` so multi-tenant isolation is automatic.

### New Postgres function (migration only, not an edge function)
`nearest_lands_summary(lat, lng, radius_m, p_tenant_id)` — returns mode of soil/water/irrigation/crop within radius for that tenant. Pure SQL, called from the inference branch.

### No changes to other edge functions
`transcribe-voice`, `text-to-speech`, `ai-query-understanding`, `weather`, `google-maps-config` are used as-is. We only add a new **intent profile name** `LAND_FORM_FILL` recognized inside `ai-query-understanding` (which already accepts a `mode` parameter — verified by reading the existing function in earlier turns).

---

## Files to Create / Edit

**New (frontend only):**
- `src/components/land/SmartLandConfirmCard.tsx` — the single-screen UI.
- `src/components/land/FieldChip.tsx` — confidence dot + inline bottom-sheet picker.
- `src/components/land/SeasonPicker.tsx` — Kharif/Rabi/Summer chips that map to dates.
- `src/components/land/LandVoiceCapture.tsx` — hold-to-talk wrapper around existing voice hooks.
- `src/components/land/CropCycleSection.tsx` — current + previous cycle with date derivation.
- `src/hooks/useLandContextInference.ts` — React Query wrapper that calls `lands-api?action=infer-context`.
- `src/lib/cropStage.ts` — pure helper: `(planting_date, duration_days) → stage_label + expected_harvest_date`.

**Edit:**
- `supabase/functions/lands-api/index.ts` — add `action=infer-context` branch + Google reverse-geocode + elevation + internal proximity SQL.
- `src/services/landsApi.ts` — add `inferLandContext(centroid, boundary, language)` method.
- `src/services/landsApi.ts` `createLand()` — extend to accept and forward all Group A–F + I fields (currently it strips many).
- `src/pages/AddLand.tsx` — render `SmartLandConfirmCard` instead of `ModernLandWizard` (behind feature flag `smartLandConfirm`).
- `src/i18n/locales/{en,hi,mr,pa,ta}.json` — add `lands.smartConfirm.*` strings + season names.
- `src/config/featureConfig.ts` — add `smartLandConfirm: true` flag.

**Database migration (no edge function impact):**
- `nearest_lands_summary(lat, lng, radius_m, p_tenant_id)` Postgres function (SECURITY DEFINER, search_path locked).

**Keep as fallback (don't delete):**
- `ModernLandWizard.tsx` — behind the off state of the feature flag for safe rollback.

---

## Field-by-field Capture Strategy (closes the data-loss gaps)

| Column | How it's set | When |
|---|---|---|
| `state/district/taluka/village` + `*_id` | `infer-context` reverse-geocode → matched against `villages` table for IDs | Auto, farmer can correct |
| `location_context` jsonb | Filled with full Google address_components + raw response | Auto |
| `elevation_meters`, `slope_percentage` | Google Elevation API (4 sample points) | Auto |
| `soil_type`, `water_source`, `irrigation_type`, `irrigation_source`, `land_type` | Neighbor-mode + SoilGrids; confidence chip; from `useLandFormData` reference lists | Confirmed |
| `current_crop` + `current_crop_id` | From `crops` table picker, AI suggests neighbor's crop | Required |
| `planting_date` + `last_sowing_date` + `cultivation_date` | Single sowing date input → all three populated; `cultivation_date = planting_date − landPrepDays` | Required |
| `expected_harvest_date` | `planting_date + crops.duration_days` (live preview) | Auto, editable |
| `crop_stage` | `cropStage()` helper at save | Auto |
| `previous_crop` + `previous_crop_id` + `last_crop` | Optional picker | Optional |
| `last_harvest_date` | Optional date / season chip | Optional |
| `notes`, `land_documents`, `marketplace_enabled` | Inside collapsed "More details" | Optional |
| `gps_accuracy_meters`, `gps_recorded_at`, `boundary_method` | Already set by map drawer | Auto |
| Soil chemistry (Group E) | **Out of scope here** — separate "Add soil test" CTA on land card | Deferred |
| NDVI/moisture (Groups G,H) | System-managed by existing pipelines | Background |

---

## Technical Section

- **Confidence model:** 0–1 float per **Confidence Scoring Migrations** memory. UI dots: ≥0.8 green, 0.5–0.8 amber, <0.5 red (red forces explicit pick).
- **Vernacular voice extractor (in `ai-query-understanding`):** new `mode: 'LAND_FORM_FILL'` returns strict JSON schema, post-validated against reference enums per **LLM Output Validation Gate**. No agronomic generation — translation/extraction only, per **Symbolic Engine Strict Invariants**.
- **Canonical script enforced** per **Canonical Language Governance** — Devanagari for hi/mr farmers throughout chips and TTS.
- **Mobile invariants:** opaque cards (no `backdrop-blur`), `e.stopPropagation()` on touch, max-scale=5.0, safe-area insets, 48 px min targets — all per **Mobile Viewport Standard** & **System Optimization** memories.
- **Performance budget:** `infer-context` p95 ≤ 1.5 s. UI renders the card immediately with skeleton chips and streams suggestions in (`useDeferredValue`) so the farmer is never blocked.
- **Multi-tenant safety:** every neighbor query uses `tenant_id = $tenant` filter inside `nearest_lands_summary`; `guardTenantAccess` already enforces tenant scoping for the edge call. Honors **Proactive Multi-Tenant Isolation**.
- **Telemetry:** log `land_infer_accepted_fields`, `land_infer_overridden_fields`, `voice_slot_fill_success` to feed the **Proactive Feedback Learning Loop**.
- **Feature flag rollout:** `smartLandConfirm` on in dev, gradual canary in prod; old wizard remains one toggle away.

---

## Out of Scope (future iterations)
- WhatsApp Bridge to add land via voice note.
- Drone-photo auto-boundary.
- Co-ownership flow with OTP consent.
- Soil test result capture flow (separate "Add soil test" card on land detail).

After approval, I will implement in this order: (1) `lands-api` infer branch + Postgres helper, (2) `SmartLandConfirmCard` + sub-components, (3) voice layer, (4) offline-safe save + draft-resume, (5) i18n strings, (6) feature-flag wiring.
