import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
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
 * - Waits for initial sync to complete
 */
export function useLands() {
  const { user } = useAuthStore();
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
                id: l.id!,
                tenant_id: tenantId,
                farmer_id: farmerId,
                name: l.name,
                area_acres: l.area_acres,
                area_guntas: null,
                area_sqft: null,
                ownership_type: l.ownership_type || null,
                state: l.state || null,
                state_id: null,
                district: l.district || null,
                district_id: null,
                taluka: null,
                taluka_id: null,
                village: l.village || null,
                village_id: null,
                survey_number: null,
                boundary: l.boundary_polygon_old,
                boundary_geom: null,
                boundary_polygon_old: l.boundary_polygon_old,
                boundary_method: null,
                center_lat: null,
                center_lon: null,
                center_point_old: null,
                location_coords: null,
                location_context: null,
                gps_accuracy_meters: null,
                gps_recorded_at: null,
                elevation_meters: null,
                slope_percentage: null,
                land_type: null,
                soil_type: l.soil_type || null,
                soil_tested: null,
                last_soil_test_date: null,
                soil_ph: null,
                organic_carbon_percent: null,
                nitrogen_kg_per_ha: null,
                phosphorus_kg_per_ha: null,
                potassium_kg_per_ha: null,
                water_source: l.water_source || null,
                irrigation_source: null,
                irrigation_type: null,
                current_crop: l.current_crop || null,
                current_crop_id: null,
                crop_stage: null,
                planting_date: null,
                cultivation_date: null,
                last_sowing_date: null,
                harvest_date: null,
                expected_harvest_date: null,
                previous_crop: null,
                previous_crop_id: null,
                last_crop: null,
                last_harvest_date: null,
                ndvi_tested: null,
                last_ndvi_calculation: null,
                last_ndvi_value: null,
                ndvi_thumbnail_url: null,
                last_processed_at: null,
                tile_id: null,
                tile_ids: null,
                mgrs_tile_id: null,
                land_documents: null,
                notes: null,
                marketplace_enabled: null,
                is_active: null,
                deleted_at: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                lastModified: Date.now(),
                syncStatus: 'synced' as const,
              })),
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
    enabled: !!user?.id, // No sync blocking - fetch immediately
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1, // Reduced retry for faster fallback
    retryDelay: 1000, // Quick retry
  });

  // Mutation for deleting a land
  const deleteMutation = useMutation({
    mutationFn: async (landId: string) => {
      await landsApi.deleteLand(landId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lands'] });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast({
        title: 'Success',
        description: 'Land deleted successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete land',
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
