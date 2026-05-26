import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

/**
 * Subscribes to `white_label_configs` row changes for the active tenant and
 * triggers a tenant refetch so partners' theme/branding edits propagate to
 * already-mounted farmer sessions without requiring a reload.
 *
 * Mounted once inside AppLayout (after TenantProvider).
 */
export function TenantThemeRealtimeSync() {
  const { tenant, refetch } = useTenant();

  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel(`white-label-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'white_label_configs',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          console.log('🎨 [TenantThemeRealtimeSync] white_label_configs updated', {
            tenant_id: tenant.id,
            last_deployed_at: (payload.new as any)?.last_deployed_at,
          });
          // Drop the localStorage cache so the next fetch is unconditional.
          try {
            localStorage.removeItem('tenant_config_cache');
          } catch {}
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, refetch]);

  return null;
}
