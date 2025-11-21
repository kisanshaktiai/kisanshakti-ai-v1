# Farmer App Domain Configuration Guide

## Overview

This is a **Farmer App Skeleton** - a white-label mobile/web application designed for farmers. The domain resolution is optimized for `farmer_app` domains from the `white_label_configs` table.

---

## Domain Structure in Database

### White Label Configs Table Structure

The `white_label_configs.domain_config` field supports a nested structure for multi-app deployments:

```json
{
  "farmer_app": {
    "custom_domain": "app.kisanshaktiai.in",
    "dns_verified": false,
    "ssl_enabled": true,
    "status": "pending"
  },
  "public_website": {
    "custom_domain": "kisanshaktiai.in",
    "dns_verified": false,
    "ssl_enabled": true,
    "status": "pending"
  },
  "tenant_portal": {
    "custom_domain": "partner.kisanshaktiai.in",
    "dns_verified": false,
    "ssl_enabled": true,
    "status": "pending"
  }
}
```

### Farmer App Skeleton Focus

Since this codebase is the **Farmer App Skeleton**, the domain resolution prioritizes:
1. ✅ `domain_config.farmer_app.custom_domain` (PRIMARY)
2. ✅ `domain_config.custom_domain` (LEGACY fallback)
3. ✅ `domain_config.subdomain` (LEGACY fallback)

**NOT USED** (for other app types):
- ❌ `domain_config.public_website.custom_domain` (Public marketing site)
- ❌ `domain_config.tenant_portal.custom_domain` (Partner/admin portal)

---

## Domain Resolution Flow

### Frontend (tenantStore.ts)

```typescript
// STAGE 3: White Label Config Lookup
// PRIORITY 1: farmer_app.custom_domain ✅
if (domainConfig?.farmer_app?.custom_domain === domain) {
  return tenant;
}

// PRIORITY 2: custom_domain (flat structure - legacy) ✅
if (domainConfig?.custom_domain === domain) {
  return tenant;
}

// PRIORITY 3: subdomain (legacy) ✅
if (domainConfig?.subdomain === domain) {
  return tenant;
}
```

### Backend Edge Function (get-white-label-config)

```typescript
// Step 2: FARMER APP PRIORITY
const matchedConfig = allConfigs.find((config: any) => {
  const domainConfig = config.domain_config;
  
  // PRIORITY: Check farmer_app.custom_domain first
  if (domainConfig?.farmer_app?.custom_domain === domain) {
    return true;
  }
  
  // Fallback: Check flat custom_domain (legacy)
  if (domainConfig?.custom_domain === domain) {
    return true;
  }
  
  return false;
});
```

---

## Setting Up Tenant Domains

### Option 1: Nested Structure (Recommended for New Tenants)

```sql
-- Update white_label_configs for a tenant
UPDATE white_label_configs
SET domain_config = '{
  "farmer_app": {
    "custom_domain": "app.yourdomain.com",
    "ssl_enabled": true,
    "status": "pending",
    "dns_verified": false
  }
}'::jsonb
WHERE tenant_id = 'your-tenant-uuid';
```

### Option 2: Flat Structure (Legacy Support)

```sql
-- Update white_label_configs with flat structure
UPDATE white_label_configs
SET domain_config = '{
  "custom_domain": "app.yourdomain.com",
  "subdomain": "app",
  "ssl_enabled": true
}'::jsonb
WHERE tenant_id = 'your-tenant-uuid';
```

### Option 3: Tenants Table (Simple Setup)

```sql
-- Set domain directly in tenants table
UPDATE tenants
SET 
  custom_domain = 'app.yourdomain.com',
  subdomain = 'app'
WHERE id = 'your-tenant-uuid';
```

---

## Domain Resolution Priority (Complete Flow)

### Stage 1: Tenants Table Direct Match
```sql
SELECT * FROM tenants 
WHERE custom_domain = 'app.kisanshaktiai.in';
```

### Stage 2: Tenants Table Subdomain Match
```sql
SELECT * FROM tenants 
WHERE subdomain = 'app.kisanshaktiai.in';
```

### Stage 3: White Label Configs - Farmer App (PRIMARY)
```sql
SELECT tenant_id FROM white_label_configs
WHERE domain_config->>'farmer_app'->>'custom_domain' = 'app.kisanshaktiai.in';
```

### Stage 4: White Label Configs - Flat Structure (Legacy)
```sql
SELECT tenant_id FROM white_label_configs
WHERE domain_config->>'custom_domain' = 'app.kisanshaktiai.in'
   OR domain_config->>'subdomain' = 'app.kisanshaktiai.in';
```

### Stage 5: Partial Match (Development Fallback)
```sql
-- Extracts subdomain and tries to match
SELECT * FROM tenants
WHERE subdomain LIKE '%app%'
   OR custom_domain LIKE '%kisanshaktiai%';
```

---

## Example Configurations

### Example 1: KisanShakti Ai (Nested Structure)

**Tenant**: KisanShakti Ai  
**ID**: `a2a59533-b5d2-450c-bd70-7180aa40d82d`

**white_label_configs.domain_config**:
```json
{
  "farmer_app": {
    "custom_domain": "app.kisanshaktiai.in",
    "dns_verified": false,
    "ssl_enabled": true,
    "status": "pending"
  }
}
```

**Result**: When user visits `app.kisanshaktiai.in`, the app loads with KisanShakti Ai branding.

---

### Example 2: Legacy Tenant (Flat Structure)

**Tenant**: Patil Agro Services  
**ID**: `a3be7054-fae1-438d-b731-3f40cad40dd5`

**white_label_configs.domain_config**:
```json
{
  "custom_domain": "app.agriempower.in",
  "subdomain": "app",
  "ssl_enabled": true
}
```

**Result**: When user visits `app.agriempower.in`, the app loads with Patil Agro branding.

---

## DNS Configuration

For custom domains to work, you need to configure DNS:

### A Record (Recommended)
```
Type: A
Name: app
Value: <your-server-ip>
TTL: 3600
```

### CNAME Record (Alternative)
```
Type: CNAME
Name: app
Value: your-hosting-provider.com
TTL: 3600
```

### SSL Certificate
After DNS is configured, enable SSL:
```sql
UPDATE white_label_configs
SET domain_config = jsonb_set(
  domain_config,
  '{farmer_app,ssl_enabled}',
  'true'::jsonb
)
WHERE tenant_id = 'your-tenant-uuid';
```

---

## Debugging Domain Issues

### Check Console Logs

When the app loads, watch for these logs:

```
✅ [Stage 1] Found by tenants.custom_domain
✅ [Stage 2] Found by tenants.subdomain
✅ [Stage 3] Matched farmer_app.custom_domain
✅ [Stage 3] Matched flat custom_domain (legacy)
✅ [Security] Tenant loaded: { id, name, domain }
```

### Verify Database Configuration

```sql
-- Check tenant configuration
SELECT 
  t.id,
  t.name,
  t.custom_domain,
  t.subdomain,
  wl.domain_config
FROM tenants t
LEFT JOIN white_label_configs wl ON wl.tenant_id = t.id
WHERE t.name ILIKE '%kisan%';
```

### Edge Function Logs

Check edge function logs for domain resolution:
```
[get-white-label-config] 🌾 Farmer App Skeleton - Domain Resolution
[get-white-label-config] 🌾 PRIORITY: Checking farmer_app domains...
[get-white-label-config] ✅ Matched farmer_app.custom_domain
```

---

## Multi-App Architecture (Future)

While this skeleton focuses on the farmer app, the architecture supports multiple apps per tenant:

```
┌─────────────────────────────────────┐
│         Tenant Organization         │
└─────────────────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼────┐  ┌───▼────┐  ┌───▼────┐
│Farmer  │  │Public  │  │Partner │
│App     │  │Website │  │Portal  │
│(THIS)  │  │        │  │        │
└────────┘  └────────┘  └────────┘
app.domain   domain     partner.domain
```

**Current Skeleton**: Farmer App only  
**Other Apps**: Require separate codebases (Public Website skeleton, Partner Portal skeleton)

---

## Migration from Flat to Nested Structure

If you have existing tenants with flat structure and want to migrate:

```sql
-- Migration script
UPDATE white_label_configs
SET domain_config = jsonb_build_object(
  'farmer_app', jsonb_build_object(
    'custom_domain', domain_config->>'custom_domain',
    'ssl_enabled', (domain_config->>'ssl_enabled')::boolean,
    'dns_verified', false,
    'status', 'active'
  )
)
WHERE domain_config ? 'custom_domain'
  AND NOT domain_config ? 'farmer_app';
```

---

## Testing Checklist

- [ ] Test with full domain (e.g., `app.kisanshaktiai.in`)
- [ ] Test with localhost:5173 (should load default tenant)
- [ ] Test with Lovable preview domain (should load default tenant)
- [ ] Verify console logs show correct stage match
- [ ] Verify theme/branding loads correctly
- [ ] Verify tenant_id is set in localStorage
- [ ] Verify LocalDB creates tenant-scoped database

---

## Conclusion

This farmer app skeleton is optimized for `farmer_app` domain resolution, ensuring:
1. ✅ Fast and accurate tenant identification
2. ✅ Support for both nested and flat domain structures
3. ✅ Clear priority system for domain matching
4. ✅ Comprehensive logging for debugging
5. ✅ Backward compatibility with legacy configurations

**For Production**: Always use nested structure with `farmer_app.custom_domain` for clarity and future extensibility.
