# 🚀 Multi-Tenant Quick Start Guide

## 🎯 For Developers: Getting Started in 5 Minutes

### Step 1: Check Your Database
```sql
-- Verify you have at least one active tenant
SELECT id, name, status, is_default 
FROM tenants 
WHERE status = 'active'
LIMIT 5;
```

### Step 2: (Optional) Set Default Tenant
```bash
# Add this to your .env file
echo 'VITE_DEFAULT_TENANT_ID=your-tenant-uuid-here' >> .env
```

### Step 3: Start Development
```bash
npm run dev
```

### Step 4: Verify It's Working
1. Open browser console
2. Look for: `✅ [TenantProvider] Tenant loaded: TenantName`
3. Check the app displays correct branding

---

## 🏗️ Environment Modes

### Development Mode (localhost)
**How it works:**
- Detects localhost automatically
- Uses `VITE_DEFAULT_TENANT_ID` from `.env` (if set)
- Falls back to localStorage cached tenant
- Falls back to default tenant (`is_default=true`)
- Falls back to first active tenant

**To switch tenants:**
```javascript
// Option 1: Update .env and restart
VITE_DEFAULT_TENANT_ID=new-tenant-uuid

// Option 2: Use browser console
localStorage.setItem('tenantId', 'new-tenant-uuid');
location.reload();
```

### Production Mode (custom domain)
**How it works:**
- Detects domain automatically (e.g., `farmer1.example.com`)
- Fetches tenant configuration from API
- Applies tenant-specific branding and theme
- All data automatically filtered by `tenant_id`

**Requirements:**
- DNS must point to your app
- Tenant must have `custom_domain` configured
- White label config must include domain mapping

---

## ✅ Data Isolation Checklist

When writing code that fetches or updates data:

- [ ] ✅ Import `supabaseWithAuth` instead of `supabase`
- [ ] ✅ Create authenticated client: `supabaseWithAuth(user.id, user.tenantId)`
- [ ] ✅ All queries automatically filtered by `tenant_id`
- [ ] ✅ Check console for tenant context logs
- [ ] ✅ Test with multiple tenants

**Good Pattern:**
```typescript
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

const { user } = useAuthStore();
const client = supabaseWithAuth(user.id, user.tenantId);

// ✅ Automatically scoped to current tenant
const { data } = await client.from('lands').select('*');
```

**Bad Pattern:**
```typescript
import { supabase } from '@/integrations/supabase/client';

// ❌ NOT scoped to tenant - will leak data!
const { data } = await supabase.from('lands').select('*');
```

---

## 🐛 Common Issues & Solutions

### Issue: "No active tenants found"
```sql
-- Solution: Create or activate a tenant
UPDATE tenants SET status = 'active' WHERE id = 'your-tenant-id';

-- Or set one as default
UPDATE tenants SET is_default = true WHERE id = 'your-tenant-id';
```

### Issue: Wrong tenant loads
```bash
# Clear cached tenant
localStorage.removeItem('tenantId');

# Or set explicit tenant in .env
echo 'VITE_DEFAULT_TENANT_ID=correct-uuid' >> .env
```

### Issue: Data not showing
```typescript
// Check tenant context
import { tenantIsolationService } from '@/services/tenantIsolationService';
console.log(tenantIsolationService.getTenantContext());

// Verify user has correct tenant_id
import { useAuthStore } from '@/stores/authStore';
console.log(useAuthStore.getState().user);
```

---

## 📊 Monitoring Tenant Activity

### Browser Console Logs

Watch for these key log messages:

```
✅ Good Signs:
🌍 [Environment] Current environment: { mode: 'DEVELOPMENT' }
✅ [TenantProvider] Tenant loaded: YourTenant
🔐 [Security] Tenant context set: { tenantId: '...', domain: '...' }
✅ [Auth] User authenticated with tenant

❌ Warning Signs:
⚠️ [TenantProvider] No tenant found for domain
❌ [Security] TENANT MISMATCH DETECTED
❌ [TenantProvider] Error fetching tenant
```

### Debug Commands

```javascript
// Check full environment
import { getEnvironment, logEnvironmentInfo } from '@/utils/environment';
logEnvironmentInfo();

// Check tenant isolation
import { tenantIsolationService } from '@/services/tenantIsolationService';
console.log({
  tenantId: tenantIsolationService.getTenantId(),
  validation: tenantIsolationService.validateContext(true),
  filter: tenantIsolationService.getTenantFilter()
});

// Check auth state
import { useAuthStore } from '@/stores/authStore';
const state = useAuthStore.getState();
console.log({
  isAuthenticated: state.isAuthenticated,
  userId: state.user?.id,
  tenantId: state.user?.tenantId,
  sessionTenant: state.session?.tenantId
});
```

---

## 🔐 Security Best Practices

1. **Never bypass tenant isolation**
   - Always use `supabaseWithAuth()`
   - Never use plain `supabase` client for user data

2. **Validate tenant context**
   - Check `tenantIsolationService.validateContext()` before critical ops
   - Log and alert on tenant mismatches

3. **RLS Policies**
   - All tables must have tenant_id column
   - Enable RLS on all user data tables
   - Use `get_farmer_id_from_header()` in policies

4. **Testing**
   - Test with multiple tenants
   - Verify data isolation between tenants
   - Check offline mode preserves tenant context

---

## 📚 Additional Resources

- **Full Developer Guide**: `MULTI_TENANT_DEVELOPER_GUIDE.md`
- **Architecture Docs**: `TENANT_ISOLATION_IMPLEMENTATION.md`
- **Domain Configuration**: `FARMER_APP_DOMAIN_CONFIG.md`
- **Phase 4 Context**: `PHASE4_TENANT_PROVIDER.md`

---

## 🆘 Need Help?

1. **Check console logs** - Most issues show detailed error messages
2. **Verify database** - Ensure tenant exists and is active
3. **Review environment** - Check `.env` configuration
4. **Read full guide** - `MULTI_TENANT_DEVELOPER_GUIDE.md` has detailed solutions
5. **Contact support** - Reach out to platform team

---

**Quick Reference Card**

| What | Command |
|------|---------|
| Start dev | `npm run dev` |
| Set tenant | Add `VITE_DEFAULT_TENANT_ID=uuid` to `.env` |
| Switch tenant | `localStorage.setItem('tenantId', 'uuid'); location.reload()` |
| Check tenant | `tenantIsolationService.getTenantContext()` |
| Debug logs | Look for `[TenantProvider]`, `[Security]`, `[Auth]` in console |
| Clear cache | `localStorage.removeItem('tenantId')` |

---

**Remember:** The system automatically handles tenant resolution in both development and production. You just need to ensure your database has at least one active tenant! 🎉
