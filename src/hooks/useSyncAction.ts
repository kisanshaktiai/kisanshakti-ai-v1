import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { syncService } from '@/services/syncService';

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
    async () => {
      setSyncing(true);
      setSyncSuccess(false);
      setSyncError(false);

      try {
        toast({
          title: t('sync.syncing'),
          description: t('sync.please_wait'),
          duration: 2000,
        });

        const result = await syncService.performSync(true);        const result = await syncService.performSync(!forceFull);

        if (result.success) {
          await queryClient.invalidateQueries();
          await queryClient.refetchQueries();
          setSyncSuccess(true);

          toast({
            title: t('sync.sync_complete'),
            description: result.message || t('sync.all_up_to_date'),
            duration: 3000,
          });

          setTimeout(() => setSyncSuccess(false), 2000);          setTimeout(() => setSyncSuccess(false), 2000);
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
