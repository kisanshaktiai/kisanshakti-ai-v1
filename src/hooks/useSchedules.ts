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
      if (!user?.id) return [];
      
      try {
        if (navigator.onLine) {
          // Try online fetch first
          let query = supabase
            .from('crop_schedules')
            .select('*')
            .order('created_at', { ascending: false });

          if (landId) {
            query = query.eq('land_id', landId);
          }

          const { data, error } = await query;

          if (error) throw error;

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
          }

          return data || [];
        } else {
          // Offline: Use local database
          const localData = landId 
            ? await localDB.getSchedulesByLand(landId)
            : await localDB.getAllSchedules();
          return localData || [];
        }
      } catch (error) {
        console.error('Error fetching schedules:', error);
        
        // Fallback to local DB on error
        const localData = landId 
          ? await localDB.getSchedulesByLand(landId)
          : await localDB.getAllSchedules();
        
        if (localData && localData.length > 0) {
          return localData;
        }
        
        throw error;
      }
    },
    enabled: !!user?.id,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
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
