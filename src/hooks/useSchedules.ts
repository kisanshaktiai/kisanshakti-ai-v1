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
          
          // SPRINT 3: bound payload — a farmer should never need more than 100 active schedules.
          let query = authClient
            .from('crop_schedules')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(100);

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
                // Core fields
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
                // Weather
                last_weather_update: s.last_weather_update || null,
                last_weather_check: s.last_weather_check || null,
                weather_data: s.weather_data || null,
                weather_auto_update_enabled: s.weather_auto_update_enabled || null,
                ai_model: s.ai_model || null,
                // Status
                is_active: s.is_active || null,
                completed_at: s.completed_at || null,
                status: s.status || null,
                // Actual outcomes
                actual_harvest_date: s.actual_harvest_date || null,
                actual_profit: s.actual_profit || null,
                actual_total_cost: s.actual_total_cost || null,
                actual_yield_quintals: s.actual_yield_quintals || null,
                outcome_recorded_at: s.outcome_recorded_at || null,
                // Expected yields
                expected_gross_revenue: s.expected_gross_revenue || null,
                expected_market_price_per_quintal: s.expected_market_price_per_quintal || null,
                expected_net_profit: s.expected_net_profit || null,
                expected_profit: s.expected_profit || null,
                expected_yield_per_acre: s.expected_yield_per_acre || null,
                expected_yield_quintals: s.expected_yield_quintals || null,
                // Farm inputs - Fertilizers
                fertilizer_k_kg: s.fertilizer_k_kg || null,
                fertilizer_n_kg: s.fertilizer_n_kg || null,
                fertilizer_p_kg: s.fertilizer_p_kg || null,
                organic_fertilizer_kg: s.organic_fertilizer_kg || null,
                organic_manure_kg: s.organic_manure_kg || null,
                vermicompost_kg: s.vermicompost_kg || null,
                bio_fertilizer_units: s.bio_fertilizer_units || null,
                // Farm inputs - Pesticides
                bio_pesticide_ml: s.bio_pesticide_ml || null,
                fungicide_gm: s.fungicide_gm || null,
                herbicide_ml: s.herbicide_ml || null,
                insecticide_ml: s.insecticide_ml || null,
                pesticide_requirements: s.pesticide_requirements || null,
                // Farm inputs - Other
                seed_quantity_kg: s.seed_quantity_kg || null,
                pgr_hormone_ml: s.pgr_hormone_ml || null,
                growth_regulators: s.growth_regulators || null,
                organic_input_details: s.organic_input_details || null,
                // Water and irrigation
                irrigation_count_total: s.irrigation_count_total || null,
                water_per_irrigation_liters: s.water_per_irrigation_liters || null,
                water_requirement_liters_total: s.water_requirement_liters_total || null,
                total_water_requirement_liters: s.total_water_requirement_liters || null,
                // Cost breakdown
                cost_by_category: s.cost_by_category || null,
                cost_by_stage: s.cost_by_stage || null,
                total_estimated_cost: s.total_estimated_cost || null,
                total_labor_cost: s.total_labor_cost || null,
                total_material_cost: s.total_material_cost || null,
                labor_rate_used: s.labor_rate_used || null,
                // Task tracking
                tasks_completed_count: s.tasks_completed_count || null,
                tasks_on_time_count: s.tasks_on_time_count || null,
                tasks_total_count: s.tasks_total_count || null,
                total_duration_days: s.total_duration_days || null,
                stages_covered: s.stages_covered || null,
                // Location context
                agro_climatic_zone: s.agro_climatic_zone || null,
                district_name: s.district_name || null,
                state_region: s.state_region || null,
                taluka_name: s.taluka_name || null,
                regional_dialect_zone: s.regional_dialect_zone || null,
                // Farming details
                farming_type: s.farming_type || null,
                calculated_for_area_acres: s.calculated_for_area_acres || null,
                // Suitability and quality
                suitability_score: s.suitability_score || null,
                suitability_warnings: s.suitability_warnings || null,
                data_quality_score: s.data_quality_score || null,
                schedule_accuracy_score: s.schedule_accuracy_score || null,
                // Yield optimization
                yield_boosting_techniques: s.yield_boosting_techniques || null,
                yield_multiplier_target: s.yield_multiplier_target || null,
                // Product recommendations
                products_recommended_count: s.products_recommended_count || null,
                recommendation_order: s.recommendation_order || null,
                recommended_products: s.recommended_products || null,
                // Training data flags
                is_training_candidate: s.is_training_candidate || null,
                training_batch_id: s.training_batch_id || null,
                training_excluded_reason: s.training_excluded_reason || null,
                training_processed: s.training_processed || null,
                // Farmer feedback
                farmer_feedback: s.farmer_feedback || null,
                farmer_rating: s.farmer_rating || null,
                // Input data snapshots
                input_land_coordinates: s.input_land_coordinates || null,
                input_soil_data: s.input_soil_data || null,
                input_weather_data: s.input_weather_data || null,
                // Intercrop data
                backdated_consent: s.backdated_consent ?? null,
                backdated_consent_at: s.backdated_consent_at || null,
                intercrop_name: s.intercrop_name || null,
                intercrop_variety: s.intercrop_variety || null,
                intercrop_sowing_date: s.intercrop_sowing_date || null,
                intercrop_area_percent: s.intercrop_area_percent || null,
                intercrop_2_name: s.intercrop_2_name || null,
                intercrop_2_variety: s.intercrop_2_variety || null,
                intercrop_2_sowing_date: s.intercrop_2_sowing_date || null,
                intercrop_2_area_percent: s.intercrop_2_area_percent || null,
                intercrop_3_name: s.intercrop_3_name || null,
                intercrop_3_variety: s.intercrop_3_variety || null,
                intercrop_3_sowing_date: s.intercrop_3_sowing_date || null,
                intercrop_3_area_percent: s.intercrop_3_area_percent || null,
                // Additional metadata
                metadata: s.metadata || null,
                // Timestamps
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
    // PHASE 1A: Long stale window — realtime + manual refetch will invalidate when needed.
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
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
