import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useAuthReady } from '@/hooks/useAuthReady';
import { offlineDataService } from '@/services/offlineDataService';
import { landsApi } from '@/services/landsApi';
import { localDB } from '@/services/localDB';
import { useToast } from '@/hooks/use-toast';

/**
 * Unified hook for fetching lands with:
 * - React Query caching
 * - Offline support
 * - Automatic refetching
 * - Real-time updates integration
 * - Auth-readiness gating (waits for global headers to propagate)
 */
export function useLands() {
  const { user } = useAuthStore();
  const { isReady: authReady } = useAuthReady();
  const tenantId = user?.tenantId;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['lands', user?.id],
    queryFn: async () => {
      console.log('🔍 [useLands] Fetching lands for user:', user?.id);
      console.log('📊 [useLands] Query context:', {
        userId: user?.id,
        tenantId: user?.tenantId,
        isOnline: navigator.onLine,
      });
      
      if (!user?.id) {
        console.log('⚠️ [useLands] No user ID, returning empty array');
        return [];
      }
      
      // STEP 1: If online, fetch from API FIRST (not localDB)
      if (navigator.onLine && user?.id) {
        console.log('🌐 [useLands] Online - fetching from API FIRST');
        try {
          // CRITICAL: Wait for headers to be set before making API calls
          const { waitForHeaders } = await import('@/integrations/supabase/client');
          console.log('⏳ [useLands] Waiting for headers...');
          await waitForHeaders();
          console.log('✅ [useLands] Headers ready, proceeding with API call');
          console.log('🔐 [useLands] Fetching with farmer_id:', user.id, 'tenant_id:', user.tenantId);
          
          console.log('📡 [useLands] Calling lands API...');
          const data = await landsApi.fetchLands();
          console.log(`✅ [useLands] API returned ${data?.length || 0} lands`);
          if (data && data.length > 0) {
            console.log('📋 [useLands] Sample land:', {
              id: data[0].id,
              name: data[0].name,
              area_acres: data[0].area_acres,
            });
          }
          
          // Save to localDB for offline use
          if (data && data.length > 0) {
            const tenantId = user.tenantId || '';
            const farmerId = user.id;
            
            await localDB.bulkSave({
              lands: data.map(l => ({
                ...l,
                id: l.id!,
                tenant_id: tenantId,
                farmer_id: farmerId,
                lastModified: new Date(l.updated_at || l.created_at || Date.now()).getTime(),
                syncStatus: 'synced' as const,
              })) as unknown as Parameters<typeof localDB.bulkSave>[0]['lands'],
            });
            console.log('💾 [useLands] Saved to local DB for offline use');
          }
          
          return data || [];
        } catch (apiError) {
          // Only fall back to localDB if API fails
          console.warn('⚠️ [useLands] API failed, falling back to localDB:', apiError);
          const localData = await localDB.getLands(undefined, user.id);
          console.log(`📦 [useLands] Fallback: Local DB has ${localData?.length || 0} lands for farmer ${user.id}`);
          return localData || [];
        }
      }
      
      // STEP 2: Offline - use localDB with farmer isolation
      console.log('📴 [useLands] Offline - using local DB');
      const localData = await localDB.getLands(undefined, user.id);
      console.log(`📦 [useLands] Local DB has ${localData?.length || 0} lands for farmer ${user.id}`);
      return localData || [];
    },
    enabled: authReady, // Gate on full auth-readiness (user + tenant + headers)
    // PHASE 1A: Long stale window — realtime + manual refetch will invalidate when needed.
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1, // Reduced retry for faster fallback
    retryDelay: 1000, // Quick retry
  });

  // Mutation for deleting a land (soft delete - marks as inactive)
  const deleteMutation = useMutation({
    mutationFn: async (landId: string) => {
      console.log('🗑️ [useLands] Delete mutation started for:', landId);
      await landsApi.deleteLand(landId);
      console.log('✅ [useLands] Delete mutation completed for:', landId);
    },
    onSuccess: () => {
      console.log('✅ [useLands] Delete successful, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ['lands'] });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast({
        title: 'Land Removed',
        description: 'Land has been removed from your list',
      });
    },
    onError: (error: any) => {
      console.error('❌ [useLands] Delete mutation error:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to remove land',
        variant: 'destructive',
      });
    },
  });

  return {
    lands: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    deleteLand: deleteMutation.mutate,
    isDeletingLand: deleteMutation.isPending,
  };
}
