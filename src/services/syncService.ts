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

      if (pendingChanges.messages.length > 0) {
        await this.syncChatMessages(pendingChanges.messages, result);
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
          description: `${pendingChanges.farmers.length + pendingChanges.lands.length + pendingChanges.schedules.length + pendingChanges.messages.length} changes synced`,
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
    for (const id of syncedIds) {
      await localDB.markAsSynced('farmer', id);
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

    for (const id of syncedIds) {
      await localDB.markAsSynced('land', id);
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

    for (const id of syncedIds) {
      await localDB.markAsSynced('schedule', id);
    }
  }

  private async syncChatMessages(messages: any[], result: SyncResult): Promise<void> {
    // Chat messages are stored locally only for now
    // Mark them as synced since there's no server table yet
    for (const message of messages) {
      await localDB.markAsSynced('message', message.id);
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
            tenant_id: tenantId,
            farmer_name: f.farmer_name,
            farmer_code: f.farmer_code,
            mobile_number: f.mobile_number,
            aadhaar_number: f.aadhaar_number,
            shc_id: f.shc_id,
            location: f.location,
            pin: f.pin,
            pin_hash: f.pin_hash,
            pin_updated_at: f.pin_updated_at,
            failed_login_attempts: f.failed_login_attempts,
            last_failed_login: f.last_failed_login,
            last_login_at: f.last_login_at,
            login_attempts: f.login_attempts,
            farming_experience_years: f.farming_experience_years,
            farm_type: f.farm_type,
            total_land_acres: f.total_land_acres,
            primary_crops: f.primary_crops,
            annual_income_range: f.annual_income_range,
            has_loan: f.has_loan,
            loan_amount: f.loan_amount,
            has_tractor: f.has_tractor,
            has_irrigation: f.has_irrigation,
            irrigation_type: f.irrigation_type,
            has_storage: f.has_storage,
            associated_tenants: f.associated_tenants,
            preferred_dealer_id: f.preferred_dealer_id,
            is_verified: f.is_verified,
            verified_at: f.verified_at,
            verified_by: f.verified_by,
            verification_documents: f.verification_documents,
            app_install_date: f.app_install_date,
            last_app_open: f.last_app_open,
            total_app_opens: f.total_app_opens,
            total_queries: f.total_queries,
            language_preference: f.language_preference,
            preferred_contact_method: f.preferred_contact_method,
            notes: f.notes,
            metadata: f.metadata,
            seller_profile: f.seller_profile,
            seller_rating: f.seller_rating,
            seller_verified: f.seller_verified,
            total_sales: f.total_sales,
            store_name: f.store_name,
            store_description: f.store_description,
            current_subscription_id: f.current_subscription_id,
            subscription_status: f.subscription_status,
            subscription_expires_at: f.subscription_expires_at,
            is_active: f.is_active,
            archived: f.archived,
            user_profile_id: f.user_profile_id,
            created_at: f.created_at,
            updated_at: f.updated_at,
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
            tenant_id: tenantId,
            farmer_id: l.farmer_id,
            name: l.name,
            area_acres: l.area_acres,
            area_guntas: l.area_guntas,
            area_sqft: l.area_sqft,
            state: l.state,
            state_id: l.state_id,
            district: l.district,
            district_id: l.district_id,
            taluka: l.taluka,
            taluka_id: l.taluka_id,
            village: l.village,
            village_id: l.village_id,
            survey_number: l.survey_number,
            boundary: l.boundary,
            boundary_geom: l.boundary_geom,
            boundary_polygon_old: l.boundary_polygon_old,
            boundary_method: l.boundary_method,
            center_lat: l.center_lat,
            center_lon: l.center_lon,
            center_point_old: l.center_point_old,
            location_coords: l.location_coords,
            location_context: l.location_context,
            gps_accuracy_meters: l.gps_accuracy_meters,
            gps_recorded_at: l.gps_recorded_at,
            elevation_meters: l.elevation_meters,
            slope_percentage: l.slope_percentage,
            ownership_type: l.ownership_type,
            land_type: l.land_type,
            soil_type: l.soil_type,
            soil_tested: l.soil_tested,
            last_soil_test_date: l.last_soil_test_date,
            soil_ph: l.soil_ph,
            organic_carbon_percent: l.organic_carbon_percent,
            nitrogen_kg_per_ha: l.nitrogen_kg_per_ha,
            phosphorus_kg_per_ha: l.phosphorus_kg_per_ha,
            potassium_kg_per_ha: l.potassium_kg_per_ha,
            water_source: l.water_source,
            irrigation_source: l.irrigation_source,
            irrigation_type: l.irrigation_type,
            current_crop: l.current_crop,
            current_crop_id: l.current_crop_id,
            crop_stage: l.crop_stage,
            planting_date: l.planting_date,
            cultivation_date: l.cultivation_date,
            last_sowing_date: l.last_sowing_date,
            harvest_date: l.harvest_date,
            expected_harvest_date: l.expected_harvest_date,
            previous_crop: l.previous_crop,
            previous_crop_id: l.previous_crop_id,
            last_crop: l.last_crop,
            last_harvest_date: l.last_harvest_date,
            ndvi_tested: l.ndvi_tested,
            last_ndvi_calculation: l.last_ndvi_calculation,
            last_ndvi_value: l.last_ndvi_value,
            ndvi_thumbnail_url: l.ndvi_thumbnail_url,
            last_processed_at: l.last_processed_at,
            tile_id: l.tile_id,
            tile_ids: l.tile_ids,
            mgrs_tile_id: l.mgrs_tile_id,
            land_documents: l.land_documents,
            notes: l.notes,
            marketplace_enabled: l.marketplace_enabled,
            is_active: l.is_active,
            deleted_at: l.deleted_at,
            created_at: l.created_at,
            updated_at: l.updated_at,
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
            tenant_id: tenantId,
            farmer_id: s.farmer_id,
            land_id: s.land_id,
            crop_name: s.crop_name,
            crop_variety: s.crop_variety,
            sowing_date: s.sowing_date || new Date().toISOString(),
            expected_harvest_date: s.expected_harvest_date,
            schedule_version: s.schedule_version,
            generated_at: s.generated_at,
            generation_language: s.generation_language,
            generation_params: s.generation_params,
            country: s.country,
            last_weather_update: s.last_weather_update,
            weather_data: s.weather_data,
            ai_model: s.ai_model,
            is_active: s.is_active,
            completed_at: s.completed_at,
            created_at: s.created_at,
            updated_at: s.updated_at,
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
