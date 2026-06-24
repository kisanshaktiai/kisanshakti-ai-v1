import { localDB } from './localDB';
import { landsApi } from './landsApi';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { networkStatusService } from './networkStatusService';

/**
 * Offline-first data service
 * Provides a unified interface for data access that works both online and offline
 */
class OfflineDataService {
  constructor() {
    // Monitor network status via centralized service
    networkStatusService.subscribe((isOnline) => {
      console.log(`📡 [OfflineData] Network: ${isOnline ? 'Online' : 'Offline - Using local database'}`);
    });
  }

  /**
   * Fetch lands with offline fallback
   */
  async fetchLands(): Promise<any[]> {
    if (networkStatusService.getStatus()) {
      try {
        // Try to fetch from API
        const data = await landsApi.fetchLands();
        
        // Save to local DB for offline access
        if (data && data.length > 0) {
          // Get tenant_id from auth store
          const { user } = await import('@/stores/authStore').then(m => m.useAuthStore.getState());
          const tenantId = user?.tenantId || '';
          const farmerId = user?.id || '';
          
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
              soil_confidence_level: null,
              soil_data_source: null,
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
              current_moisture_status: null,
              last_moisture_update: null,
              previous_crop: null,
              previous_crop_id: null,
              last_crop: null,
              last_harvest_date: null,
              ndvi_tested: null,
              last_ndvi_calculation: null,
              last_ndvi_value: null,
              ndvi_thumbnail_url: null,
              ndvi_geotiff_url: null,
              ndvi_status: null,
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
        }
        
        return data;
      } catch (error) {
        console.warn('Failed to fetch from API, falling back to local DB:', error);
        const authState = useAuthStore.getState();
        const userId = authState.user?.id;
        return await localDB.getLands(undefined, userId);
      }
    } else {
      // Offline: Use local database with farmer isolation
      console.log('📴 Offline mode: Loading lands from local DB');
      const authState = useAuthStore.getState();
      const userId = authState.user?.id;
      return await localDB.getLands(undefined, userId);
    }
  }

  /**
   * Fetch schedules with offline fallback
   */
  async fetchSchedules(landId?: string): Promise<any[]> {
    if (networkStatusService.getStatus()) {
      try {
        // Try to fetch from Supabase
        let query = supabase
          .from('crop_schedules')
          .select('*')
          .order('created_at', { ascending: false });

        if (landId) {
          query = query.eq('land_id', landId);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Save to local DB
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
        }

        return data || [];
      } catch (error) {
        console.warn('Failed to fetch schedules from API, falling back to local DB:', error);
        return landId 
          ? await localDB.getSchedulesByLand(landId)
          : await localDB.getAllSchedules();
      }
    } else {
      // Offline: Use local database
      console.log('📴 Offline mode: Loading schedules from local DB');
      return landId 
        ? await localDB.getSchedulesByLand(landId)
        : await localDB.getAllSchedules();
    }
  }

  /**
   * Fetch schedule tasks with offline fallback
   */
  async fetchTasks(scheduleId?: string): Promise<any[]> {
    if (networkStatusService.getStatus()) {
      try {
        const { schedulesApi } = await import('./schedulesApi');
        const data = await schedulesApi.fetchTasks(scheduleId);
        
        // Save to local DB
        if (data && data.length > 0) {
          await localDB.saveTasks(data);
        }
        
        return data;
      } catch (error) {
        console.warn('Failed to fetch tasks from API, falling back to local DB:', error);
        return scheduleId 
          ? await localDB.getTasksBySchedule(scheduleId)
          : await localDB.getAllTasks();
      }
    } else {
      console.log('📴 Offline mode: Loading tasks from local DB');
      return scheduleId 
        ? await localDB.getTasksBySchedule(scheduleId)
        : await localDB.getAllTasks();
    }
  }

  /**
   * Fetch chat messages with offline fallback
   * Currently stores messages in local DB only (no server table yet)
   */
  async fetchChatMessages(landId?: string | null): Promise<any[]> {
    // For now, always use local database since chat_history table doesn't exist yet
    console.log('Loading chat messages from local DB');
    return await localDB.getChatMessages(landId);
  }

  /**
   * Save land (works offline)
   */
  async saveLand(landData: any): Promise<any> {
    // Save to local DB immediately
    await localDB.saveLand(landData);

    if (networkStatusService.getStatus()) {
      try {
        // Try to sync with server
        return await landsApi.createLand(landData);
      } catch (error) {
        console.warn('Failed to sync land to server, will retry on next sync');
      }
    }

    return landData;
  }

  /**
   * Save schedule (works offline)
   */
  async saveSchedule(scheduleData: any): Promise<any> {
    // Save to local DB immediately
    await localDB.saveSchedule(scheduleData);

    if (networkStatusService.getStatus()) {
      try {
        // Try to sync with server
        const { data, error } = await supabase
          .from('crop_schedules')
          .insert(scheduleData)
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (error) {
        console.warn('Failed to sync schedule to server, will retry on next sync');
      }
    }

    return scheduleData;
  }

  /**
   * Save chat message (works offline)
   * Currently stores in local DB only (no server table yet)
   */
  async saveChatMessage(messageData: any): Promise<any> {
    // Save to local DB immediately
    await localDB.saveChatMessage(messageData);
    console.log('Chat message saved to local DB');
    return messageData;
  }

  /**
   * Check if device is online
   */
  isDeviceOnline(): boolean {
    return networkStatusService.getStatus();
  }
}

export const offlineDataService = new OfflineDataService();
