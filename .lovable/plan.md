

# Database Architecture Audit Report: Supabase vs LocalDB (IndexedDB)

## 1. Supabase Schema Summary

The Supabase database contains 100+ tables. The 7 tables relevant to offline sync are:

| Table | Column Count | Key Role |
|-------|-------------|----------|
| `farmers` | 42 | Core farmer profiles + auth |
| `lands` | 55 | Farm parcels with soil/NDVI/GPS |
| `crop_schedules` | 85+ | AI-generated crop plans |
| `schedule_tasks` | 35 | Individual farming tasks |
| `ai_chat_sessions` | 10 | Chat session tracking |
| `ai_chat_messages` | 44 | Chat history with AI metadata |
| `crops` | 16 | Crop reference data |
| `farmer_alerts` | 16 | AI-generated alerts |

## 2. Local IndexedDB Schema Summary

LocalDB (`src/services/localDB.ts`) stores data in 10 object stores:

| Store | Interface | Sync Support | Notes |
|-------|-----------|-------------|-------|
| `farmers` | FarmerData (42 fields) | Download + Upload | Full parity |
| `lands` | LandData (55 fields) | Download + Upload | **5 columns missing** |
| `cropSchedules` | CropScheduleData (80+ fields) | Download + Upload | **12 columns missing** |
| `scheduleTasks` | ScheduleTaskData (35 fields) | Download only | Full parity |
| `aiChatSessions` | AIChatSessionData (10 fields) | Local only | No server sync |
| `aiChatMessages` | AIChatMessageData (44 fields) | Local only | No server sync |
| `crops` | CropData (14 fields) | **No sync at all** | **2 columns missing** |
| `weather` | WeatherData (local-only) | N/A | No Supabase table |
| `farmerAlerts` | FarmerAlertData (16 fields) | **No sync at all** | Never downloaded |
| `tenantConfig` | TenantConfigData (local cache) | N/A | Local cache only |

## 3. Schema Differences Detected

### Table: `lands` — 5 Missing Columns

| Supabase Column | Type | Impact |
|----------------|------|--------|
| `current_moisture_status` | string | Moisture data lost offline |
| `last_moisture_update` | string | Timestamp missing |
| `ndvi_geotiff_url` | string | NDVI GeoTIFF URL missing |
| `ndvi_status` | string | Processing status missing |
| `soil_confidence_level` | string | Soil data quality indicator missing |
| `soil_data_source` | string | Soil data provenance missing |

### Table: `crop_schedules` — 12 Missing Columns (Intercrop Support)

| Supabase Column | Type | Impact |
|----------------|------|--------|
| `backdated_consent` | boolean | Consent tracking missing |
| `backdated_consent_at` | string | Consent timestamp missing |
| `intercrop_name` | string | **Intercrop data completely lost** |
| `intercrop_variety` | string | Intercrop variety lost |
| `intercrop_sowing_date` | string | Intercrop dates lost |
| `intercrop_area_percent` | number | Intercrop area lost |
| `intercrop_2_name` | string | 2nd intercrop lost |
| `intercrop_2_variety` | string | 2nd intercrop variety lost |
| `intercrop_2_sowing_date` | string | 2nd intercrop dates lost |
| `intercrop_2_area_percent` | number | 2nd intercrop area lost |
| `intercrop_3_name` | string | 3rd intercrop lost |
| `intercrop_3_variety` | string | 3rd intercrop variety lost |
| `intercrop_3_sowing_date` | string | 3rd intercrop dates lost |
| `intercrop_3_area_percent` | number | 3rd intercrop area lost |

### Table: `crops` — 2 Missing Columns

| Supabase Column | Type | Impact |
|----------------|------|--------|
| `label_hi` | string | Hindi label missing offline |
| `label_mr` | string | Marathi label missing offline |

### Sync Upload: Critical Field Mapping Bugs

**`syncFarmers()` (line 277):** Maps `farmer.name` → `farmer_name`, `farmer.phone` → `mobile_number`, `farmer.address` → `location`. But the LocalDB interface uses `farmer_name`, `mobile_number`, `location` directly. The sync upload uses **wrong field names** that don't match the LocalDB interface, causing silent data loss on upload.

**`syncLands()` (line 343):** Only syncs 5 fields (`name`, `area_acres`, `ownership_type`, `current_crop`, `boundary`) out of 55. **50 fields are silently dropped** during upload.

**`syncSchedules()` (line 407):** Only syncs `generation_params` with tasks wrapped inside. All 80+ schedule fields are dropped.

## 4. Critical Risks for Offline Farmers

### RISK 1: Crops Never Downloaded (P0)
The sync service downloads farmers, lands, schedules, and tasks — but **never downloads crops**. Farmers offline see zero crop options. The crop selection dropdown would be empty.

### RISK 2: Farmer Alerts Never Downloaded (P0)
`farmerAlerts` store exists in LocalDB but `downloadServerData()` never fetches them. AI-generated weather/pest alerts are invisible offline.

### RISK 3: Chat Sessions/Messages Never Synced to Server (P1)
Chat messages are stored locally and `syncChatMessages()` just marks them as synced without uploading. If a farmer loses their phone, all chat history is permanently lost.

### RISK 4: Upload Sync Uses Wrong Field Names (P0)
`syncFarmers()` references `farmer.name`, `farmer.phone`, `farmer.address` — but `FarmerData` uses `farmer_name`, `mobile_number`, `location`. Every farmer upload silently sends `null` for these fields.

### RISK 5: Land Upload Drops 50 Fields (P1)
Only 5 of 55 land fields are uploaded during sync. If a farmer updates soil data, crop info, or GPS data offline, those changes are permanently lost on sync.

### RISK 6: Intercrop Data Silently Dropped (P1)
Supabase has 12 intercrop columns added after the LocalDB interface was created. When schedules are downloaded, intercrop data is silently discarded because the interface doesn't have those fields.

### RISK 7: Missing Hindi/Marathi Crop Labels (P2)
`CropData` interface lacks `label_hi` and `label_mr`. The sync service doesn't download crops at all, but even if it did, these localized labels would be dropped.

## 5. Safe Migration Plan

### Step 1: Add missing columns to LocalDB interfaces

**`LandData`** — add 6 fields:
```
current_moisture_status, last_moisture_update, ndvi_geotiff_url,
ndvi_status, soil_confidence_level, soil_data_source
```

**`CropScheduleData`** — add 14 fields:
```
backdated_consent, backdated_consent_at,
intercrop_name, intercrop_variety, intercrop_sowing_date, intercrop_area_percent,
intercrop_2_name, intercrop_2_variety, intercrop_2_sowing_date, intercrop_2_area_percent,
intercrop_3_name, intercrop_3_variety, intercrop_3_sowing_date, intercrop_3_area_percent
```

**`CropData`** — add 2 fields:
```
label_hi, label_mr
```

### Step 2: Fix sync upload field mappings

Rewrite `syncFarmers()`, `syncLands()`, `syncSchedules()` to use correct field names matching the LocalDB interface and include ALL fields.

### Step 3: Add crops download to `downloadServerData()`

Query `crops` table and save to `crops` store.

### Step 4: Add farmer alerts download to `downloadServerData()`

Query `farmer_alerts` table filtered by tenant_id and farmer_id.

### Step 5: Add chat session/message upload to sync

Implement actual upload logic in `syncChatMessages()` instead of just marking as synced.

### Step 6: Bump DB_VERSION and SCHEMA_VERSION

Increment `DB_VERSION` to 10 and `SCHEMA_VERSION` to 8 to trigger re-sync on all clients.

### Data Safety

All changes use IndexedDB's schemaless nature — adding new fields to existing objects requires NO migration. IndexedDB stores JavaScript objects as-is. Existing offline data is preserved because:
- No store deletions
- No index removals
- `put()` operations merge new fields into existing records
- Schema version bump triggers a full re-download from server, which repopulates all records with complete data

## 6. Offline Sync Architecture Recommendations

### Current State: Acceptable but Fragile

The current architecture (download-first, upload pending, server-wins conflict resolution) is sound for rural connectivity. Key improvements needed:

1. **Delta sync with timestamps** — Currently downloads ALL records every sync. Should track `last_sync_at` per table and only fetch `WHERE updated_at > last_sync_at`. Critical for 2G/3G connections.

2. **Retry queue for failed uploads** — Currently, failed uploads are logged but not retried. Need exponential backoff retry queue in `syncService`.

3. **Conflict UI** — Server-wins silently drops farmer edits. Should store conflicts and show a simple "Your change was overwritten" notification.

4. **Background sync via Service Worker** — The existing `sw-custom.ts` has a placeholder `periodicsync` handler. Should implement actual Background Sync API registration so sync happens even when app is closed.

5. **Bandwidth-aware sync** — Detect 2G/3G via `navigator.connection.effectiveType` and defer large syncs (full schedule data) until WiFi.

## 7. Final Production Readiness Verdict

**VERDICT: NOT PRODUCTION-READY for offline use**

| Category | Status | Risk Level |
|----------|--------|-----------|
| Farmers sync | Upload field names wrong | **P0 Critical** |
| Lands sync | Upload drops 50/55 fields | **P1 High** |
| Crops sync | Never downloaded | **P0 Critical** |
| Alerts sync | Never downloaded | **P0 Critical** |
| Chat sync | Never uploaded to server | **P1 High** |
| Schedule schema | 14 intercrop fields missing | **P1 High** |
| Land schema | 6 fields missing | **P2 Medium** |
| Crop schema | 2 localization fields missing | **P2 Medium** |

**Immediate action required:** Fix P0 issues (crop download, alert download, farmer upload field mapping) before any farmer relies on offline functionality. The current sync upload code would corrupt farmer data if it ever executed with pending changes.

