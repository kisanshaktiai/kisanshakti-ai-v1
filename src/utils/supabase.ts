/**
 * Compatibility re-export.
 *
 * Historically this file created a *second* Supabase client using
 * `VITE_SUPABASE_ANON_KEY`. That env var name no longer exists in this
 * project (we use `VITE_SUPABASE_PUBLISHABLE_KEY`), so the old client
 * silently became `null` — which then caused `landsApi.getHeaders()` to
 * crash with `TypeError: Cannot read property 'auth' of null` after every
 * fresh login, leaving the home screen empty.
 *
 * Fix: re-export the canonical singleton from
 * `@/integrations/supabase/client`. This eliminates the null failure mode
 * AND prevents the "Multiple GoTrueClient instances" warning by ensuring
 * the entire app shares one client.
 *
 * Existing imports `import { supabase } from '@/utils/supabase'` continue
 * to work unchanged.
 */
export { supabase } from '@/integrations/supabase/client';

import { supabase as canonicalClient } from '@/integrations/supabase/client';

/** Always true now — kept for API compatibility with old callers. */
export const isSupabaseConfigured = () => !!canonicalClient;

// Legacy hand-rolled Database typing — kept as a no-op type so old imports
// don't break. Real types live in `@/integrations/supabase/types`.
export type Database = unknown;
