

# Fix: Farmers Table RLS Blocks Auth Lookups

## Root Cause

The farmer with mobile `9860989495` **exists** in the database (confirmed via service role query). However, the client-side query returns `[]` because:

1. `AuthScreen.tsx` line 84 uses the base `supabase` client which sends **no `x-tenant-id` header**
2. The RLS SELECT policy `Auth: lookup by mobile within tenant` requires `tenant_id = get_current_tenant_id()`
3. `get_current_tenant_id()` reads from `request.headers->>'x-tenant-id'` — which is empty
4. So the RLS policy filters out ALL rows, returning `[]`
5. The app interprets this as "farmer not found" and shows the "account not found" error

The secondary runtime error (`useTenant must be used within a TenantProvider`) appears to be a transient hot-reload issue — the component tree in `App.tsx` correctly nests `AppInitializer` inside `TenantProvider`.

## Fix

**One code change in `AuthScreen.tsx`**: Pass the `x-tenant-id` header when querying the farmers table during auth lookup. The tenant ID is already available from `useTenant()`.

In `AuthScreen.tsx` line 84, change from:
```typescript
const { data: farmer, error: fetchError } = await supabase
  .from('farmers')
  .select('...')
  .eq('mobile_number', cleanMobile)
  .eq('tenant_id', tenant.id)
  .maybeSingle();
```

To use `supabaseWithAuth` or manually set the header on the base client before this pre-auth query. Since the user isn't authenticated yet, the cleanest approach is to create a temporary client with the tenant header:

```typescript
import { supabaseWithAuth } from '@/integrations/supabase/client';

// Use a client that sends x-tenant-id header for RLS
const authClient = supabaseWithAuth(undefined, tenant.id);
const { data: farmer, error: fetchError } = await authClient
  .from('farmers')
  .select('...')
  .eq('mobile_number', cleanMobile)
  .eq('tenant_id', tenant.id)
  .maybeSingle();
```

Wait — `supabaseWithAuth` requires both `farmerId` and `tenantId` and returns base `supabase` if either is missing. For pre-auth lookups where we don't have a farmerId yet, we need a different approach.

**Better fix**: Use `updateSupabaseHeaders` to set just the tenant header on the base client before the query, OR create a one-off fetch with the header.

**Simplest fix**: Modify the base `supabase` client's headers inline before the query:

```typescript
// Set tenant header for RLS policy
(supabase as any).rest.headers['x-tenant-id'] = tenant.id;

const { data: farmer, error: fetchError } = await supabase
  .from('farmers')
  .select(...)
```

This is the minimal, targeted fix. The `updateSupabaseHeaders` function already exists in `client.ts` and does exactly this.

## Files to Change

1. **`src/pages/AuthScreen.tsx`** — Import `updateSupabaseHeaders` and call it with tenant ID before the farmers query (around line 82)

