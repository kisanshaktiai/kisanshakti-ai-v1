import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { localDB } from '@/services/localDB';
import { useToast } from '@/hooks/use-toast';

/**
 * Unified hook for fetching schedules with:
 * - React Query caching
 * - Offline support
 * - Automatic refetching
 * - Real-time updates integration
 */
export function useSchedules(landId?: string) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['schedules', landId, user?.id],
    queryFn: async () => {
      console.log('🔍 [useSchedules] Fetching schedules for user:', user?.id, 'landId:', landId);
      console.log('📊 [useSchedules] Query context:', {
        userId: user?.id,
        tenantId: user?.tenantId,
        landId,
        isOnline: navigator.onLine,
      });
      
      if (!user?.id) {
        console.log('⚠️ [useSchedules] No user ID, returning empty array');
        return [];
      }
      
      try {
        // STEP 1: Try to load from local DB immediately for instant display
        const localData = landId 
          ? await localDB.getSchedulesByLand(landId)
          : await localDB.getAllSchedules();
        console.log(`📦 [useSchedules] Local DB has ${localData?.length || 0} schedules`);
        
        // STEP 2: If online, fetch fresh data from server
        if (navigator.onLine) {
          console.log('🌐 [useSchedules] Online - fetching from API');
          try {
            // CRITICAL: Wait for headers to be set before making API calls
            const { waitForHeaders } = await import('@/integrations/supabase/client');
            console.log('⏳ [useSchedules] Waiting for headers...');
            await waitForHeaders();
            console.log('✅ [useSchedules] Headers ready, proceeding with API call');
            console.log('🔐 [useSchedules] Fetching with farmer_id:', user.id, 'tenant_id:', user.tenantId);
            
            let query = supabase
              .from('crop_schedules')
              .select('*')
              .order('created_at', { ascending: false });

            if (landId) {
              console.log('🎯 [useSchedules] Filtering by land_id:', landId);
              query = query.eq('land_id', landId);
            }

            console.log('📡 [useSchedules] Executing Supabase query...');
            const { data, error } = await query;

            if (error) {
              console.error('❌ [useSchedules] Supabase query error:', error);
              throw error;
            }

            console.log(`✅ [useSchedules] API returned ${data?.length || 0} schedules`);
            if (data && data.length > 0) {
              console.log('📋 [useSchedules] Sample schedule:', {
                id: data[0].id,
                crop_name: data[0].crop_name,
                land_id: data[0].land_id,
                farmer_id: data[0].farmer_id,
                tenant_id: data[0].tenant_id,
              });
            }

            // Save to local DB for offline access
            if (data && data.length > 0) {
              await localDB.bulkSave({
                schedules: data.map(s => ({
                  id: s.id,
                  tenant_id: s.tenant_id || '',
                  farmer_id: s.farmer_id || '',
                  land_id: s.land_id,
                  crop_name: s.crop_name,
                  crop_variety: s.crop_variety || null,
                  sowing_date: s.sowing_date || new Date().toISOString(),
                  expected_harvest_date: s.expected_harvest_date || null,
                  schedule_version: s.schedule_version || null,
                  generated_at: s.generated_at || null,
                  generation_language: s.generation_language || null,
                  generation_params: s.generation_params || null,
                  country: s.country || null,
                  last_weather_update: s.last_weather_update || null,
                  weather_data: s.weather_data || null,
                  ai_model: s.ai_model || null,
                  is_active: s.is_active || null,
                  completed_at: s.completed_at || null,
                  created_at: s.created_at || null,
                  updated_at: s.updated_at || null,
                  lastModified: new Date(s.updated_at || s.created_at || Date.now()).getTime(),
                  syncStatus: 'synced' as const,
                })),
              });
              console.log('💾 [useSchedules] Saved to local DB');
            }

            return data || [];
          } catch (apiError) {
            console.error('❌ [useSchedules] API error, using local cache:', apiError);
            // Return local data if API fails
            return localData || [];
          }
        } else {
          // Offline: Use local database
          console.log('📴 [useSchedules] Offline - using local DB');
          return localData || [];
        }
      } catch (error) {
        console.error('❌ [useSchedules] Critical error:', error);
        
        // Final fallback to local DB
        try {
          const localData = landId 
            ? await localDB.getSchedulesByLand(landId)
            : await localDB.getAllSchedules();
          
          if (localData && localData.length > 0) {
            console.log('💾 [useSchedules] Recovered from local DB');
            return localData;
          }
        } catch (localError) {
          console.error('❌ [useSchedules] Local DB also failed:', localError);
        }
        
        return [];
      }
    },
    enabled: !!user?.id,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1, // Reduced retry for faster fallback
    retryDelay: 1000, // Quick retry
  });

  // Mutation for deleting a schedule
  const deleteMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const { error } = await supabase
        .from('crop_schedules')
        .delete()
        .eq('id', scheduleId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: 'Success',
        description: 'Schedule deleted successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete schedule',
        variant: 'destructive',
      });
    },
  });

  return {
    schedules: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    deleteSchedule: deleteMutation.mutate,
    isDeletingSchedule: deleteMutation.isPending,
  };
}
