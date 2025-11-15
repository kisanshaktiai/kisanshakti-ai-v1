import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { localDB } from '@/services/localDB';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';

/**
 * Unified hook for fetching schedules with:
 * - React Query caching
 * - Offline support
 * - Automatic refetching
 * - Real-time updates integration
 * - Waits for initial sync to complete
 */
export function useSchedules(landId?: string) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [headersReady, setHeadersReady] = useState(false);

  // Check if headers are ready before enabling query
  useEffect(() => {
    const checkHeaders = async () => {
      if (user?.id && user?.tenantId) {
        console.log('🔐 [useSchedules] User detected, checking headers readiness');
        try {
          const { waitForHeaders } = await import('@/integrations/supabase/client');
          await waitForHeaders();
          console.log('✅ [useSchedules] Headers confirmed ready');
          setHeadersReady(true);
        } catch (error) {
          console.error('❌ [useSchedules] Headers check failed:', error);
          setHeadersReady(false);
        }
      } else {
        console.log('⚠️ [useSchedules] No user yet, headers not ready');
        setHeadersReady(false);
      }
    };
    
    checkHeaders();
  }, [user?.id, user?.tenantId]);

  const query = useQuery({
    queryKey: ['schedules', landId, user?.id],
    queryFn: async () => {
      console.log('🔍 [useSchedules] Fetching schedules for user:', user?.id, 'landId:', landId);
      console.log('📊 [useSchedules] Query context:', {
        userId: user?.id,
        tenantId: user?.tenantId,
        landId,
        isOnline: navigator.onLine,
        headersReady,
      });
      
      if (!user?.id) {
        console.log('⚠️ [useSchedules] No user ID, returning empty array');
        return [];
      }
      
      if (!headersReady) {
        console.log('⚠️ [useSchedules] Headers not ready yet, waiting...');
        const { waitForHeaders } = await import('@/integrations/supabase/client');
        await waitForHeaders();
        console.log('✅ [useSchedules] Headers now ready after wait');
      }
      
      // STEP 1: If online, fetch from API FIRST (not localDB)
      if (navigator.onLine && user?.id) {
        console.log('🌐 [useSchedules] Online - fetching from API FIRST');
        try {
          // CRITICAL: Wait for headers to be set before making API calls
          const { waitForHeaders, supabaseWithAuth } = await import('@/integrations/supabase/client');
          console.log('⏳ [useSchedules] Waiting for headers...');
          await waitForHeaders();
          console.log('✅ [useSchedules] Headers ready, proceeding with API call');
          console.log('🔐 [useSchedules] Fetching with farmer_id:', user.id, 'tenant_id:', user.tenantId);
          
          // Use supabaseWithAuth to include custom headers for RLS
          const authClient = supabaseWithAuth(user.id, user.tenantId);
          
          let query = authClient
            .from('crop_schedules')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

          if (landId) {
            console.log('🎯 [useSchedules] Filtering by land_id:', landId);
            query = query.eq('land_id', landId);
          }
          
          console.log('🔍 [useSchedules] Query filters: is_active=true', landId ? `, land_id=${landId}` : '');

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

          // Save to localDB for offline use
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
            console.log('💾 [useSchedules] Saved to local DB for offline use');
          }

          return data || [];
        } catch (apiError) {
          // Only fall back to localDB if API fails
          console.warn('⚠️ [useSchedules] API failed, falling back to localDB:', apiError);
          const localData = landId 
            ? await localDB.getSchedulesByLand(landId)
            : await localDB.getAllSchedules(user.id);
          console.log(`📦 [useSchedules] Fallback: Local DB has ${localData?.length || 0} schedules for farmer ${user.id}`);
          return localData || [];
        }
      }
      
      // STEP 2: Offline - use localDB with farmer isolation
      console.log('📴 [useSchedules] Offline - using local DB');
      const localData = landId 
        ? await localDB.getSchedulesByLand(landId)
        : await localDB.getAllSchedules(user.id);
      console.log(`📦 [useSchedules] Local DB has ${localData?.length || 0} schedules for farmer ${user.id}`);
      return localData || [];
    },
    enabled: !!user?.id && headersReady, // Wait for user and headers only - no sync blocking
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2, // Retry twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000), // Exponential backoff
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
