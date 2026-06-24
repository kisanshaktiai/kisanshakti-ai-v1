# Multi-Tenant Developer Guide

## Overview

This white-label multi-tenant SaaS platform automatically resolves tenants based on the domain used to access the application. The system works seamlessly in both **development** and **production** environments.

## How Tenant Resolution Works

### Production Environment
- **Domain-based resolution**: The app detects the domain (e.g., `farmer1.example.com`) and fetches the corresponding tenant configuration from the database.
- **Automatic branding**: Each tenant's branding, theme, and features are applied automatically.
- **Strict isolation**: All data queries are automatically filtered by `tenant_id` to ensure complete data isolation.

### Development Environment (localhost)
The app supports multiple ways to specify which tenant to load during development:

1. **Environment Variable (Recommended)**: Set `VITE_DEFAULT_TENANT_ID` in your `.env` file
2. **LocalStorage**: The app remembers the last tenant you worked with
3. **Default Tenant**: Falls back to the tenant marked as `is_default=true` in the database
4. **First Active Tenant**: If no default is set, uses the first active tenant

## Configuration

### 1. Environment Variables

Create or update your `.env` file:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Multi-Tenant Configuration (Development Only)
# Specify which tenant to use during development
# Find tenant IDs in your Supabase `tenants` table
VITE_DEFAULT_TENANT_ID=your-tenant-uuid-here

# Example:
# VITE_DEFAULT_TENANT_ID=123e4567-e89b-12d3-a456-426614174000
```

### 2. Database Setup

Ensure your `tenants` table has at least one active tenant:

```sql
-- Check existing tenants
SELECT id, name, status, is_default, custom_domain, subdomain 
FROM tenants 
WHERE status = 'active';

-- Set a default tenant for development
UPDATE tenants 
SET is_default = true 
WHERE id = 'your-tenant-id';
```

### 3. White Label Configuration

Each tenant should have a corresponding entry in `white_label_configs`:

```sql
-- Check white label configuration
SELECT 
  tenant_id,
  brand_identity->>'company_name' as company_name,
  domain_config
FROM white_label_configs;
```

## Development Workflow

### Starting Development

1. **Set your preferred tenant** (optional but recommended):
   ```bash
   echo "VITE_DEFAULT_TENANT_ID=your-tenant-uuid" >> .env
   ```

2. **Start the dev server**:
   ```bash
   npm run dev
   ```

3. **Verify tenant loading**:
   - Check browser console for tenant resolution logs
   - Look for: `🔍 [TenantProvider] Loading tenant by ID: ...`
   - Verify branding is applied correctly

### Switching Between Tenants

**Method 1: Environment Variable**
```bash
# Update .env
VITE_DEFAULT_TENANT_ID=another-tenant-uuid
# Restart dev server
```

**Method 2: Browser Console**
```javascript
// Set tenant ID in localStorage
localStorage.setItem('tenantId', 'new-tenant-uuid');
// Reload page
location.reload();
```

**Method 3: Clear and Fallback**
```javascript
// Clear stored tenant to use default
localStorage.removeItem('tenantId');
location.reload();
```

## Data Isolation

### Automatic Isolation

All data operations are automatically scoped to the current tenant:

```typescript
// ✅ CORRECT - Uses supabaseWithAuth which includes tenant_id
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

function MyComponent() {
  const { user } = useAuthStore();
  
  const fetchData = async () => {
    const client = supabaseWithAuth(user.id, user.tenantId);
    
    // This query is automatically scoped to tenant_id
    const { data } = await client
      .from('lands')
      .select('*');
  };
}
```

```typescript
// ❌ WRONG - Direct supabase client bypasses tenant isolation
import { supabase } from '@/integrations/supabase/client';

const { data } = await supabase
  .from('lands')
  .select('*'); // This will NOT be scoped to tenant!
```

### Manual Isolation (for advanced use cases)

```typescript
import { tenantIsolationService } from '@/services/tenantIsolationService';

// Get current tenant context
const context = tenantIsolationService.getTenantContext();
console.log('Current tenant:', context.tenantId);

// Validate context before operations
const validation = tenantIsolationService.validateContext(true);
if (!validation.valid) {
  console.error('Invalid context:', validation.error);
  return;
}

// Manual filtering (when using plain supabase client)
const filter = tenantIsolationService.getTenantFilter();
const { data } = await supabase
  .from('lands')
  .select('*')
  .eq('tenant_id', filter.tenant_id);
```

## Debugging Tenant Issues

### Check Current Tenant

Open browser console and look for these logs:

```
🌍 [Environment] Current environment: { mode: 'DEVELOPMENT', domain: 'localhost', ... }
🔍 [TenantProvider] Fetching tenant config...
🔍 [TenantProvider] Tenant ID resolution: { envTenantId: '...', storedTenantId: '...', ... }
✅ [TenantProvider] Tenant loaded: TenantName
```

### Common Issues

**Issue: "No active tenants found in database"**
- **Solution**: Ensure at least one tenant exists with `status='active'`
- Check: `SELECT * FROM tenants WHERE status = 'active';`

**Issue: Wrong tenant loads**
- **Solution**: Check environment variable and localStorage
- Clear: `localStorage.removeItem('tenantId');`
- Set explicitly: `VITE_DEFAULT_TENANT_ID=correct-uuid`

**Issue: Data not loading**
- **Solution**: Verify `tenant_id` is set in your data
- Check: All user data must have `tenant_id` matching the current tenant
- Verify: Using `supabaseWithAuth()` instead of plain `supabase`

**Issue: Permission denied errors**
- **Solution**: Ensure `x-farmer-id` and `x-tenant-id` headers are sent
- Use: `supabaseWithAuth(user.id, user.tenantId)` for all operations
- Check: RLS policies in Supabase allow access with these headers

### Debug Console Commands

```javascript
// Check current tenant
console.log(tenantIsolationService.getTenantContext());

// Check environment
import { getEnvironment } from '@/utils/environment';
console.log(getEnvironment());

// Check auth state
import { useAuthStore } from '@/stores/authStore';
console.log(useAuthStore.getState());

// Verify tenant isolation service
console.log({
  tenantId: tenantIsolationService.getTenantId(),
  userId: tenantIsolationService.getUserId(),
  validation: tenantIsolationService.validateContext(true),
});
```

## Production Deployment

### DNS Configuration

For each tenant, configure DNS:

```
# A Record (if using IP)
farmer1.yourdomain.com  →  123.456.789.0

# CNAME Record (if using proxy)
farmer1.yourdomain.com  →  your-app.lovable.app
```

### Database Configuration

Update tenant records with production domains:

```sql
UPDATE tenants 
SET custom_domain = 'farmer1.yourdomain.com'
WHERE id = 'tenant-uuid';

UPDATE white_label_configs
SET domain_config = jsonb_set(
  domain_config,
  '{farmer_app,custom_domain}',
  '"farmer1.yourdomain.com"'
)
WHERE tenant_id = 'tenant-uuid';
```

### Verification

1. **Test domain resolution**:
   - Access: `https://farmer1.yourdomain.com`
   - Check console: Should show tenant loaded correctly
   - Verify: Branding and theme applied

2. **Test data isolation**:
   - Login with different tenant users
   - Verify: Each sees only their own data
   - Test: Cross-tenant data access blocked

3. **Test offline support**:
   - Disconnect network
   - Verify: App continues to work
   - Check: Cached tenant config loads

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Domain: farmer1.example.com                               │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                ┌───────────────▼───────────────┐
                │   TenantProvider              │
                │   (Domain Detection)          │
                └───────────────┬───────────────┘
                                │
                ┌───────────────▼───────────────┐
                │  Tenant Config API            │
                │  (Fetch branding & features)  │
                └───────────────┬───────────────┘
                                │
                ┌───────────────▼───────────────┐
                │ TenantIsolationService        │
                │ (Set global tenant context)   │
                └───────────────┬───────────────┘
                                │
                ┌───────────────▼───────────────┐
                │  App Initialization           │
                │  - LocalDB (tenant-scoped)    │
                │  - Auth (tenant-validated)    │
                │  - Data fetching (filtered)   │
                └───────────────────────────────┘
```

## Security Best Practices

1. **Always use `supabaseWithAuth()`** for database operations
2. **Verify tenant context** before critical operations
3. **Never trust client-side tenant ID** - validate on server
4. **Enable RLS policies** on all tables with tenant_id
5. **Log tenant mismatches** and force logout
6. **Use tenant-specific databases** for offline storage

## Testing

### Unit Tests

```typescript
import { getEnvironment, isDevelopmentMode } from '@/utils/environment';

describe('Environment Detection', () => {
  it('detects development mode correctly', () => {
    expect(isDevelopmentMode()).toBe(true);
  });
  
  it('loads tenant from environment variable', () => {
    const env = getEnvironment();
    expect(env.defaultTenantId).toBeTruthy();
  });
});
```

### Integration Tests

```typescript
describe('Tenant Resolution', () => {
  it('loads correct tenant in development', async () => {
    // Set environment
    process.env.VITE_DEFAULT_TENANT_ID = 'test-tenant-id';
    
    // Fetch tenant
    const tenant = await fetchTenantConfig();
    
    // Verify
    expect(tenant.id).toBe('test-tenant-id');
  });
  
  it('isolates data by tenant', async () => {
    // Set tenant A
    setTenantContext('tenant-a', 'farmer1.example.com');
    
    // Fetch data
    const dataA = await fetchLands();
    
    // Switch to tenant B
    setTenantContext('tenant-b', 'farmer2.example.com');
    
    // Fetch data
    const dataB = await fetchLands();
    
    // Verify isolation
    expect(dataA).not.toEqual(dataB);
  });
});
```

## Support

For issues or questions:
1. Check browser console for error logs
2. Verify database configuration
3. Review this guide for common issues
4. Check Supabase RLS policies
5. Contact platform support team

---

**Last Updated**: 2025-11-22  
**Version**: 2.0.0  
**Platform**: White-Label Multi-Tenant Farmer SaaS
