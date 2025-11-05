import { localDB } from './localDB';
import { landsApi } from './landsApi';
import { supabase } from '@/integrations/supabase/client';

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
              ownership_type: l.ownership_type,
              state: l.state,
              district: l.district,
              village: l.village,
              soil_type: l.soil_type,
              water_source: l.water_source,
              crops: l.current_crop ? [l.current_crop] : [],
              boundary: l.boundary_polygon_old,
              metadata: {},
              lastModified: Date.now(),
              syncStatus: 'synced' as const,
            })),
          });
        }
        
        return data;
      } catch (error) {
        console.warn('Failed to fetch from API, falling back to local DB:', error);
        return await localDB.getLands();
      }
    } else {
      // Offline: Use local database
      console.log('📴 Offline mode: Loading lands from local DB');
      return await localDB.getLands();
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
              sowing_date: s.sowing_date || new Date().toISOString(),
              tasks: (s.generation_params as any)?.tasks || [],
              generation_params: s.generation_params,
              lastModified: new Date(s.updated_at || s.created_at).getTime(),
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
