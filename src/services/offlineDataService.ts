import { localDB } from './localDB';
import { landsApi } from './landsApi';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

/**
 * Offline-first data service
 * Provides a unified interface for data access that works both online and offline
 */
class OfflineDataService {
  private isOnline: boolean = navigator.onLine;

  constructor() {
    // Monitor network status
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('📡 Network: Online');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📴 Network: Offline - Using local database');
    });
  }

  /**
   * Fetch lands with offline fallback
   */
  async fetchLands(): Promise<any[]> {
    if (this.isOnline) {
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
    if (this.isOnline) {
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
              syncStatus: 'synced',
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

    if (this.isOnline) {
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

    if (this.isOnline) {
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
    return this.isOnline;
  }
}

export const offlineDataService = new OfflineDataService();
