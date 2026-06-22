import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { syncService } from '@/services/syncService';
import { localDB } from '@/services/localDB';

/**
 * Shared sync handler used by SyncButton and UnifiedSyncButton.
 * Returns the action + transient UI state.
 */
export function useSyncAction() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncError, setSyncError] = useState(false);

  const handleSync = useCallback(
    async (forceFull: boolean = false) => {
      setSyncing(true);
      setSyncSuccess(false);
      setSyncError(false);

      try {
        toast({
          title: forceFull ? t('sync.full_sync_starting') : t('sync.syncing'),
          description: forceFull
            ? t('sync.clearing_and_reloading')
            : t('sync.please_wait'),
          duration: 2000,
        });

        if (forceFull) {
          await localDB.forceClearAndReload();
          const { resetHeadersState } = await import('@/integrations/supabase/client');
          resetHeadersState();
        }

        const result = await syncService.performSync(!forceFull);

        if (result.success) {
          await queryClient.invalidateQueries();
          await queryClient.refetchQueries();
          setSyncSuccess(true);

          toast({
            title: t('sync.sync_complete'),
            description: forceFull
              ? t('sync.data_reloaded')
              : result.message || t('sync.all_up_to_date'),
            duration: 3000,
          });

          if (forceFull) {
            setTimeout(() => {
              toast({
                title: t('sync.tip'),
                description: t('sync.refresh_suggestion'),
                duration: 5000,
              });
            }, 2000);
          }

          setTimeout(() => setSyncSuccess(false), 2000);
        } else {
          setSyncError(true);
          toast({
            title: t('sync.sync_partial'),
            description: result.errors?.join(', ') || t('sync.some_data_failed'),
            variant: 'destructive',
            duration: 4000,
          });
          setTimeout(() => setSyncError(false), 2000);
        }
      } catch (error) {
        setSyncError(true);
        console.error('❌ [useSyncAction] Sync failed:', error);
        toast({
          title: t('sync.sync_failed'),
          description: t('sync.check_connection'),
          variant: 'destructive',
          duration: 4000,
        });
        setTimeout(() => setSyncError(false), 2000);
      } finally {
        setSyncing(false);
      }
    },
    [queryClient, t, toast]
  );

  return { handleSync, syncing, syncSuccess, syncError };
}
