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
              ...l,
              id: l.id!,
              tenant_id: tenantId,
              farmer_id: farmerId,
              lastModified: new Date(l.updated_at || l.created_at || Date.now()).getTime(),
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
              ...s,
              tenant_id: s.tenant_id || '',
              farmer_id: s.farmer_id || '',
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
