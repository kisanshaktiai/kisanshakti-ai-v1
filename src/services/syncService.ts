import { supabase } from '@/integrations/supabase/client';
import { localDB } from './localDB';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';

interface SyncResult {
  success: boolean;
  message: string;
  conflicts?: any[];
  errors?: string[];
}

class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;

  constructor() {
    this.initializeListeners();
    this.startAutoSync();
  }

  private initializeListeners(): void {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('Network: Online - Starting auto sync');
      this.performSync();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('Network: Offline');
    });

    // Sync on app visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.performSync();
      }
    });
  }

  private startAutoSync(): void {
    // Clear any existing interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Auto sync every 5 minutes when online
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        console.log('Auto-sync triggered');
        this.performSync();
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Initial sync if online
    if (this.isOnline) {
      this.performSync();
    }
  }

  async performSync(showToast: boolean = false): Promise<SyncResult> {
    if (this.syncInProgress) {
      return { success: false, message: 'Sync already in progress' };
    }

    if (!this.isOnline) {
      if (showToast) {
        toast({
          title: 'Offline',
          description: 'Cannot sync while offline',
          variant: 'destructive',
        });
      }
      return { success: false, message: 'Device is offline' };
    }

    // Get tenant context from auth store
    const authState = useAuthStore.getState();
    const tenantId = authState.user?.tenantId;
    
    // Don't sync if user is not authenticated yet
    if (!tenantId) {
      console.log('Skipping sync: User not authenticated');
      return { success: false, message: 'User not authenticated' };
    }

    this.syncInProgress = true;
    await localDB.updateSyncMetadata({ syncInProgress: true });

    try {
      const result: SyncResult = {
        success: true,
        message: 'Sync completed successfully',
        conflicts: [],
        errors: [],
      };

      // 1. Upload pending local changes
      const pendingChanges = await localDB.getPendingChanges();
      
      if (pendingChanges.farmers.length > 0) {
        await this.syncFarmers(pendingChanges.farmers, result, tenantId);
      }

      if (pendingChanges.lands.length > 0) {
        await this.syncLands(pendingChanges.lands, result, tenantId);
      }

      if (pendingChanges.chatMessages.length > 0) {
        await this.syncChatMessages(pendingChanges.chatMessages, result);
      }

      // 2. Download latest data from server
      await this.downloadServerData(tenantId);

      // Update sync metadata
      await localDB.updateSyncMetadata({
        lastSyncTime: Date.now(),
        syncInProgress: false,
      });

      if (showToast) {
        toast({
          title: 'Sync Complete',
          description: `${pendingChanges.farmers.length + pendingChanges.lands.length + pendingChanges.schedules.length + pendingChanges.chatMessages.length} changes synced`,
        });
      }

      return result;
    } catch (error) {
      console.error('Sync error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      
      if (showToast) {
        toast({
          title: 'Sync Failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }

      return {
        success: false,
        message: errorMessage,
        errors: [errorMessage],
      };
    } finally {
      this.syncInProgress = false;
      await localDB.updateSyncMetadata({ syncInProgress: false });
    }
  }

  private async syncFarmers(farmers: any[], result: SyncResult, tenantId: string): Promise<void> {
    const syncedIds: string[] = [];
    
    for (const farmer of farmers) {
      try {
        // Check for existing farmer on server
        const { data: existing } = await supabase
          .from('farmers')
          .select('*')
          .eq('id', farmer.id)
          .maybeSingle();

        if (existing) {
          // Conflict resolution: Compare timestamps
          if (existing.updated_at && new Date(existing.updated_at).getTime() > farmer.lastModified) {
            // Server version is newer - keep server version
            result.conflicts?.push({
              type: 'farmer',
              id: farmer.id,
              resolution: 'server_win',
            });
          } else {
            // Local version is newer - update server
            await supabase
              .from('farmers')
              .update({
                farmer_name: farmer.name,
                mobile_number: farmer.phone,
                location: farmer.address,
                metadata: farmer.metadata,
                updated_at: new Date(farmer.lastModified).toISOString(),
              })
              .eq('id', farmer.id);
            
            syncedIds.push(farmer.id);
          }
        } else {
          // New farmer - insert to server
          await supabase
            .from('farmers')
            .insert({
              id: farmer.id,
              tenant_id: tenantId,
              farmer_name: farmer.name,
              mobile_number: farmer.phone,
              location: farmer.address,
              metadata: farmer.metadata,
              created_at: new Date(farmer.lastModified).toISOString(),
            });
          
          syncedIds.push(farmer.id);
        }
      } catch (error) {
        console.error(`Failed to sync farmer ${farmer.id}:`, error);
        result.errors?.push(`Failed to sync farmer ${farmer.name}`);
      }
    }

    // Mark synced items
    if (syncedIds.length > 0) {
      await localDB.markAsSynced('farmers', syncedIds);
    }
  }

  private async syncLands(lands: any[], result: SyncResult, tenantId: string): Promise<void> {
    const syncedIds: string[] = [];
    
    for (const land of lands) {
      try {
        const { data: existing } = await supabase
          .from('lands')
          .select('*')
          .eq('id', land.id)
          .maybeSingle();

        if (existing) {
          // Conflict resolution
          if (existing.updated_at && new Date(existing.updated_at).getTime() > land.lastModified) {
            result.conflicts?.push({
              type: 'land',
              id: land.id,
              resolution: 'server_win',
            });
          } else {
            await supabase
              .from('lands')
              .update({
                name: land.name,
                area_acres: land.area_acres,
                ownership_type: land.ownership_type,
                current_crop: land.crops?.[0] || null,
                boundary: land.boundary,
                updated_at: new Date(land.lastModified).toISOString(),
              })
              .eq('id', land.id);
            
            syncedIds.push(land.id);
          }
        } else {
          await supabase
            .from('lands')
            .insert({
              tenant_id: tenantId,
              farmer_id: land.farmer_id,
              name: land.name,
              area_acres: land.area_acres,
              ownership_type: land.ownership_type,
              current_crop: land.crops?.[0] || null,
              boundary: land.boundary,
              created_at: new Date(land.lastModified).toISOString(),
            });
          
          syncedIds.push(land.farmer_id);
        }
      } catch (error) {
        console.error(`Failed to sync land ${land.id}:`, error);
        result.errors?.push(`Failed to sync land ${land.name}`);
      }
    }

    if (syncedIds.length > 0) {
      await localDB.markAsSynced('lands', syncedIds);
    }
  }

  private async syncSchedules(schedules: any[], result: SyncResult): Promise<void> {
    const syncedIds: string[] = [];
    
    // Get tenant context from auth store
    const authState = useAuthStore.getState();
    const tenantId = authState.user?.tenantId;
    
    for (const schedule of schedules) {
      try {
        const { data: existing } = await supabase
          .from('crop_schedules')
          .select('*')
          .eq('id', schedule.id)
          .maybeSingle();

        if (existing) {
          if (existing.updated_at && new Date(existing.updated_at).getTime() > schedule.lastModified) {
            result.conflicts?.push({
              type: 'schedule',
              id: schedule.id,
              resolution: 'server_win',
            });
          } else {
            // Update existing schedule with available fields
            await supabase
              .from('crop_schedules')
              .update({
                generation_params: { tasks: schedule.tasks },
                updated_at: new Date(schedule.lastModified).toISOString(),
              })
              .eq('id', schedule.id);
            
            syncedIds.push(schedule.id);
          }
        } else {
          // Insert new schedule - using actual crop_schedules table structure
          await supabase
            .from('crop_schedules')
            .insert({
              farmer_id: schedule.land_id, // Using land_id as farmer reference
              land_id: schedule.land_id,
              tenant_id: tenantId || '',
              crop_name: schedule.crop_id,
              sowing_date: new Date().toISOString(),
              generation_params: { tasks: schedule.tasks },
              created_at: new Date(schedule.lastModified).toISOString(),
            });
          
          syncedIds.push(schedule.id);
        }
      } catch (error) {
        console.error(`Failed to sync schedule ${schedule.id}:`, error);
        result.errors?.push(`Failed to sync schedule`);
      }
    }

    if (syncedIds.length > 0) {
      await localDB.markAsSynced('schedules', syncedIds);
    }
  }

  private async syncChatMessages(messages: any[], result: SyncResult): Promise<void> {
    // Chat messages are stored locally only for now
    // Mark them as synced since there's no server table yet
    const syncedIds = messages.map(m => m.id);
    if (syncedIds.length > 0) {
      await localDB.markAsSynced('chatMessages', syncedIds);
    }
  }

  private async downloadServerData(tenantId: string): Promise<void> {
    try {
      // Download farmers data
      const { data: farmers } = await supabase
        .from('farmers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (farmers && farmers.length > 0) {
        await localDB.bulkSave({
          farmers: farmers.map(f => ({
            id: f.id,
            name: f.farmer_name || '',
            phone: f.mobile_number || '',
            address: f.location,
            metadata: f.metadata,
            lastModified: new Date(f.updated_at || f.created_at).getTime(),
            syncStatus: 'synced' as const,
          })),
        });
      }

      // Download lands data
      const { data: lands } = await supabase
        .from('lands')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (lands && lands.length > 0) {
        await localDB.bulkSave({
          lands: lands.map(l => ({
            id: l.id,
            farmer_id: l.farmer_id,
            name: l.name,
            area_acres: l.area_acres,
            ownership_type: l.ownership_type,
            crops: l.current_crop ? [l.current_crop] : [],
            boundary: l.boundary,
            metadata: {},
            lastModified: new Date(l.updated_at || l.created_at).getTime(),
            syncStatus: 'synced' as const,
          })),
        });
      }

      // Download schedules data
      const { data: schedules } = await supabase
        .from('crop_schedules')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (schedules && schedules.length > 0) {
        await localDB.bulkSave({
          schedules: schedules.map(s => ({
            id: s.id,
            land_id: s.land_id,
            crop_id: s.crop_name,
            tasks: (s.generation_params as any)?.tasks || [],
            lastModified: new Date(s.updated_at || s.created_at).getTime(),
            syncStatus: 'synced' as const,
          })),
        });
      }
    } catch (error) {
      console.error('Failed to download server data:', error);
      throw error;
    }
  }

  getSyncStatus(): boolean {
    return this.syncInProgress;
  }

  isNetworkAvailable(): boolean {
    return this.isOnline;
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const syncService = new SyncService();
