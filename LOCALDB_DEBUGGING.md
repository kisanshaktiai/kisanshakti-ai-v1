# LocalDB Debugging Guide

## Quick Start

Run this in your browser console:
```javascript
await window.__debugAuth()
```

This will show you:
- ✅ Current authentication state
- ✅ Database access test results
- ✅ LocalDB contents
- ✅ Sync status

---

## How to Inspect IndexedDB in Browser

### Chrome/Edge DevTools:
1. Open DevTools (`F12` or `Ctrl+Shift+I`)
2. Go to **Application** tab
3. Expand **IndexedDB** → **KisanDB**
4. Click on each store to see data:
   - `farmers` - Farmer profiles
   - `lands` - Land parcels
   - `cropSchedules` - Crop schedules
   - `scheduleTasks` - Individual tasks
   - `syncMetadata` - Last sync timestamp

### Firefox DevTools:
1. Open DevTools (`F12`)
2. Go to **Storage** tab
3. Expand **Indexed DB** → **https://your-app.lovable.app** → **KisanDB**
4. Click each object store to view data

### Safari DevTools:
1. Enable Developer menu: Safari → Preferences → Advanced → "Show Develop menu"
2. Open Web Inspector (`Cmd+Option+I`)
3. Go to **Storage** tab
4. Expand **Indexed Databases** → **KisanDB**

---

## Console Commands

### Check Authentication & Data Access
```javascript
// Full auth debug report
await window.__debugAuth()

// Quick checks
const { user } = useAuthStore.getState()
console.log('User:', user)

const lands = await localDB.getLands()
console.log('Lands:', lands)

const schedules = await localDB.getAllSchedules()
console.log('Schedules:', schedules)
```

### Check Sync Status
```javascript
const metadata = await localDB.getSyncMetadata()
console.log('Last Sync:', new Date(metadata.lastSyncTime))
console.log('Schema Version:', metadata.schemaVersion)
```

### Test Database Access
```javascript
const { supabaseWithAuth } = await import('@/integrations/supabase/client')
const { user } = useAuthStore.getState()

// Test lands query
const result = await supabaseWithAuth(user.id, user.tenantId)
  .from('lands')
  .select('*')

console.log('Lands from DB:', result.data)
console.log('Error:', result.error)
```

### Force Clear LocalDB
```javascript
// WARNING: This deletes ALL local data!
await localDB.clearAllData()
location.reload()
```

---

## Common Issues & Solutions

### ❌ Empty LocalDB After Login

**Symptoms:**
- Console shows "📦 [useLands] Local DB has 0 lands"
- No data appears in app
- IndexedDB is empty

**Diagnosis:**
```javascript
await window.__debugAuth()
// Look for:
// - "❌ Lands: ERROR" (database access failed)
// - "LocalDB Status: Lands: 0" (no data synced)
```

**Solutions:**

1. **Check if sync completed:**
```javascript
const metadata = await localDB.getSyncMetadata()
console.log('Last sync:', metadata.lastSyncTime)
// If null or very old, sync failed
```

2. **Check authentication headers:**
```javascript
const { user } = useAuthStore.getState()
console.log('User ID:', user?.id)
console.log('Tenant ID:', user?.tenantId)
// Both must be present
```

3. **Test database access manually:**
```javascript
await window.__debugAuth()
// Look at "Testing Database Access" section
// If any queries show "❌", RLS policies are blocking access
```

4. **Force re-sync:**
```javascript
const { syncService } = await import('@/services/syncService')
await syncService.performSync(true)
```

---

### ❌ "function has_tenant_access does not exist"

**Symptoms:**
- Console shows RLS policy errors
- Database queries return empty results
- Error message mentions missing function

**Solution:**
This means the database migration wasn't applied. Contact support or run:
```sql
-- In Supabase SQL editor
SELECT * FROM public.has_tenant_access('00000000-0000-0000-0000-000000000000');
-- If this fails, the function is missing
```

---

### ❌ Old/Stale Data

**Symptoms:**
- Seeing old data that was deleted
- Changes not appearing
- Data inconsistent with server

**Solutions:**

1. **Check last sync time:**
```javascript
const metadata = await localDB.getSyncMetadata()
console.log('Last sync:', new Date(metadata.lastSyncTime))
// Should be recent (within last few minutes)
```

2. **Force full re-sync:**
```javascript
// Clear and re-download
await localDB.clearAllData()
const { syncService } = await import('@/services/syncService')
await syncService.performSync(true)
location.reload()
```

---

### ❌ Queries Running Before Sync Completes

**Symptoms:**
- "📦 [useLands] Local DB has 0 lands" appears immediately on login
- Then data appears after a few seconds
- Race condition warnings in console

**Solution:**
The `useSyncReady()` hook should prevent this. Check:

```javascript
// In component
const syncReady = useSyncReady()
console.log('Sync ready:', syncReady)
// Should be false initially, then true after sync
```

If queries still run too early, increase grace period in `useSyncReady.ts`.

---

### ❌ Network Errors During Sync

**Symptoms:**
- "❌ [Sync] Download failed: NetworkError"
- Sync never completes
- App stuck in loading state

**Solutions:**

1. **Check network connectivity:**
```javascript
console.log('Online:', navigator.onLine)
```

2. **Check Supabase status:**
- Visit status.supabase.com
- Check if your project is accessible

3. **Try offline mode:**
```javascript
// If you have cached data, app should work offline
const lands = await localDB.getLands()
// Should return cached data even when offline
```

---

## Debugging Checklist

When farmer data doesn't load on new device:

- [ ] Run `await window.__debugAuth()` in console
- [ ] Check "User:" is present with `id` and `tenantId`
- [ ] Check "Testing Database Access" shows ✅ for all tables
- [ ] Check "LocalDB Status" shows data counts > 0
- [ ] Check "Last Sync" timestamp is recent
- [ ] Inspect IndexedDB in DevTools to verify data
- [ ] Check browser console for RLS policy errors
- [ ] Test network connectivity
- [ ] Try manual sync: `syncService.performSync(true)`

---

## Advanced: Schema Debugging

### Check Schema Version
```javascript
const metadata = await localDB.getSyncMetadata()
console.log('Schema version:', metadata.schemaVersion)
// Should be 4 (current version)
```

### Force Schema Upgrade
```javascript
// Only if schema is outdated
await localDB.initialize()
```

### Inspect All Object Stores
```javascript
const db = await localDB.db
const storeNames = Array.from(db.objectStoreNames)
console.log('Object stores:', storeNames)
// Should include: farmers, lands, cropSchedules, etc.
```

---

## Contact Support

If none of these solutions work, gather this information:

```javascript
// Run this and send output to support
const debugInfo = await window.__debugAuth()
console.log(JSON.stringify(debugInfo, null, 2))

// Also include:
// - Browser and version
// - Error messages from console
// - Network tab (any failed requests)
// - Screenshot of IndexedDB in DevTools
```
