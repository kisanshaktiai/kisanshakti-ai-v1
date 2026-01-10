import { supabase } from '@/integrations/supabase/client';
import { localDB } from './localDB';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { tenantIsolationService } from './tenantIsolationService';
import { networkStatusService } from './networkStatusService';
import { landsApi } from './landsApi';
import { schedulesApi } from './schedulesApi';

interface SyncResult {
  success: boolean;
  message: string;
  conflicts?: any[];
  errors?: string[];
}

class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private syncInProgress: boolean = false;
  private isInitialized: boolean = false;

  constructor() {
    // PERFORMANCE FIX: Don't initialize listeners in constructor
    // They will be initialized lazily when first sync is requested
    console.log('🔄 [Sync] SyncService created (lazy initialization)');
  }

  /**
   * Initialize listeners and auto-sync lazily - only when needed
   * This prevents blocking app startup with unnecessary listeners
   */
  private ensureInitialized(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    
    console.log('🔄 [Sync] Initializing listeners and auto-sync...');
    this.initializeListeners();
    this.startAutoSync();
  }

  private initializeListeners(): void {
    // Subscribe to centralized network status
    networkStatusService.subscribe((isOnline) => {
      console.log(`🔄 [Sync] Network status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
      if (isOnline) {
        console.log('🔄 [Sync] Starting auto sync after coming online');
        this.performSync();
      }
    });

    // Sync on app visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && networkStatusService.getStatus()) {
        console.log('👁️ [Sync] Tab visible - performing sync');
        this.performSync();
      }
    });
  }

  private startAutoSync(): void {
    // Clear any existing interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Auto sync every 1 hour when online AND authenticated
    this.syncInterval = setInterval(() => {
      const authState = useAuthStore.getState();
      const isAuthenticated = authState.user?.id && authState.user?.tenantId;
      const isOnline = networkStatusService.getStatus();
      
      if (isOnline && !this.syncInProgress && isAuthenticated) {
        console.log('🔄 [Sync] Auto-sync triggered (hourly)');
        this.performSync();
      } else if (!isAuthenticated && isOnline) {
        console.log('⏸️ [Sync] Auto-sync deferred - waiting for authentication');
      }
    }, 60 * 60 * 1000); // 1 hour

    // REMOVED: Initial sync - now controlled by useOfflineData hook
    // This prevents premature sync attempts before authentication
    console.log('🔄 [Sync] Auto-sync initialized (waiting for authentication)');
  }

  async performSync(showToast: boolean = false): Promise<SyncResult> {
    // PERFORMANCE FIX: Initialize lazily on first sync request
    this.ensureInitialized();
    
    if (this.syncInProgress) {
      console.log('⚠️ [Sync] Sync already in progress, skipping');
      return { success: false, message: 'Sync already in progress' };
    }

    if (!networkStatusService.getStatus()) {
      console.log('📴 [Sync] Device offline, skipping sync');
      if (showToast) {
        toast({
          title: 'Offline',
          description: 'Cannot sync while offline',
          variant: 'destructive',
        });
      }
      return { success: false, message: 'Device is offline' };
    }

    const authState = useAuthStore.getState();
    const tenantId = authState.user?.tenantId;
    const userId = authState.user?.id;
    
    // CRITICAL: Validate tenant isolation context first
    const tenantContext = tenantIsolationService.validateContext(true);
    if (!tenantContext.valid) {
      // Double-check: If we have auth data but tenant context missing user, add it
      if (userId && tenantContext.tenantId && !tenantContext.userId) {
        console.log('🔧 [Sync] Adding missing user ID to tenant context');
        tenantIsolationService.setUserId(userId);
        // Re-validate after fixing
        const revalidated = tenantIsolationService.validateContext(true);
        if (!revalidated.valid) {
          console.log('⏸️ [Sync] Tenant context not ready - sync deferred:', revalidated.error);
          return { success: false, message: 'Waiting for tenant context' };
        }
      } else {
        console.log('⏸️ [Sync] Tenant context not ready - sync deferred:', tenantContext.error);
        return { success: false, message: 'Waiting for tenant context' };
      }
    }
    
    // CRITICAL: Strict validation - prevent sync without complete auth context
    if (!tenantId || !userId) {
      console.log('⏸️ [Sync] Waiting for authentication - sync deferred', { 
        userId: userId || 'not set',
        tenantId: tenantId || 'not set',
        hasUser: !!userId,
        hasTenant: !!tenantId
      });
      return { success: false, message: 'Waiting for authentication' };
    }
    
    // Additional validation: Check for empty strings
    if (tenantId.trim() === '' || userId.trim() === '') {
      console.error('❌ [Sync] Empty auth data detected:', { tenantId, userId });
      return { success: false, message: 'Invalid authentication data' };
    }
    
    // Cross-validate tenant IDs match
    if (tenantContext.tenantId !== tenantId) {
      console.error('❌ [Sync] Tenant ID mismatch:', { 
        contextTenantId: tenantContext.tenantId,
        authTenantId: tenantId 
      });
      return { success: false, message: 'Tenant context mismatch - security error' };
    }
    
    console.log('✅ [Sync] Auth context validated:', { userId, tenantId });

    this.syncInProgress = true;
    await localDB.updateSyncMetadata({ syncInProgress: true });

    try {
      const result: SyncResult = {
        success: true,
        message: 'Sync completed successfully',
        conflicts: [],
        errors: [],
      };

      // 1. ALWAYS download latest data from server FIRST
      // This ensures localDB has data even on first app load
      console.log('📥 [Sync] Downloading server data...');
      await this.downloadServerData(tenantId);
      console.log('✅ [Sync] Server data downloaded to localDB');

      // 2. Upload pending local changes
      const pendingChanges = await localDB.getPendingChanges();
      console.log('📤 [Sync] Pending changes:', {
        farmers: pendingChanges.farmers.length,
        lands: pendingChanges.lands.length,
        schedules: pendingChanges.schedules.length,
        messages: pendingChanges.messages.length,
      });
      
      if (pendingChanges.farmers.length > 0) {
        console.log('📤 [Sync] Uploading farmers...');
        await this.syncFarmers(pendingChanges.farmers, result, tenantId);
      }

      if (pendingChanges.lands.length > 0) {
        console.log('📤 [Sync] Uploading lands...');
        await this.syncLands(pendingChanges.lands, result, tenantId);
      }

      if (pendingChanges.messages.length > 0) {
        console.log('📤 [Sync] Uploading messages...');
        await this.syncChatMessages(pendingChanges.messages, result);
      }

      // Update sync metadata
      await localDB.updateSyncMetadata({
        lastSyncTime: Date.now(),
        syncInProgress: false,
      });

      // Check if there were any errors during sync
      if (result.errors && result.errors.length > 0) {
        result.success = false;
        result.message = `Sync completed with ${result.errors.length} error(s)`;
        console.warn('Sync completed with errors:', result.errors);
      }

      if (showToast) {
        if (result.success) {
          toast({
            title: 'Sync Complete',
            description: `${pendingChanges.farmers.length + pendingChanges.lands.length + pendingChanges.schedules.length + pendingChanges.messages.length} changes synced`,
          });
        } else {
          toast({
            title: 'Sync Partially Completed',
            description: result.errors?.join(', ') || 'Some items could not be synced',
            variant: 'destructive',
          });
        }
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
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to sync farmer ${farmer.id}:`, error);
        result.errors?.push(`Farmer "${farmer.name}": ${errorMsg}`);
        result.success = false;
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
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to sync land ${land.id}:`, error);
        result.errors?.push(`Land "${land.name}": ${errorMsg}`);
        result.success = false;
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
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to sync schedule ${schedule.id}:`, error);
        result.errors?.push(`Schedule for "${schedule.crop_id}": ${errorMsg}`);
        result.success = false;
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
    console.log('📥 [Sync] Starting server data download for tenant:', tenantId);
    
    try {
      const { supabaseWithAuth } = await import('@/integrations/supabase/client');
      const { useAuthStore } = await import('@/stores/authStore');
      
      // Get auth context from store
      const { user } = useAuthStore.getState();
      const userId = user?.id;
      const tenant = user?.tenantId || tenantId;
      
      console.log('🔐 [Sync] Auth context:', { userId, tenant, providedTenant: tenantId });
      
      // Strict validation: Check for missing OR empty string values
      if (!userId || !tenant || userId.trim() === '' || tenant.trim() === '') {
        console.error('❌ [Sync] Invalid auth context:', { userId, tenant });
        throw new Error('Missing or invalid authentication data for sync');
      }
      
      // Test database access with a simple, non-failing query
      console.log('🔍 [Sync] Testing database access...');
      const client = supabaseWithAuth(userId, tenant);
      
      // Fixed: Use a query that won't fail if farmer doesn't exist
      // Just test we can access the farmers table at all
      const testQuery = await client
        .from('farmers')
        .select('id')
        .eq('tenant_id', tenant)
        .limit(1);
      
      if (testQuery.error) {
        console.error('❌ [Sync] Database access test failed:', testQuery.error);
        throw new Error(`Database access failed: ${testQuery.error.message}. Your authentication may have expired.`);
      }
      
      console.log('✅ [Sync] Database access verified, proceeding with download');
      
      // Download farmers data
      console.log('📥 [Sync] Fetching farmers from server...');
      const { data: farmers, error: farmersError } = await client
        .from('farmers')
        .select('*')
        .eq('tenant_id', tenant)
        .eq('id', userId);

      if (farmersError) {
        console.error('❌ [Sync] Failed to fetch farmers:', farmersError);
      } else {
        console.log(`✅ [Sync] Fetched ${farmers?.length || 0} farmers from server`);
      }

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

      // Download lands data using edge function (bypasses RLS issues)
      console.log('📥 [Sync] Fetching lands via lands-api edge function...');
      let lands: any[] = [];
      let landsError: Error | null = null;
      
      try {
        lands = await landsApi.fetchLands();
        console.log(`✅ [Sync] Fetched ${lands?.length || 0} lands from server via API`);
      } catch (error) {
        landsError = error as Error;
        console.error('❌ [Sync] Failed to fetch lands via API:', landsError);
      }

      // CRITICAL: Clear existing lands before saving new data from server
      console.log('🗑️ [Sync] Clearing existing lands before server data download...');
      const existingLands = await localDB.getLands(undefined, userId);
      console.log(`📊 [Sync] Found ${existingLands.length} existing lands to clear`);
      
      // Clear all lands from the store
      if (existingLands.length > 0) {
        const db = (localDB as any).db;
        if (db) {
          const tx = db.transaction('lands', 'readwrite');
          const store = tx.objectStore('lands');
          for (const land of existingLands) {
            await store.delete(land.id);
          }
          await tx.done;
          console.log(`✅ [Sync] Cleared ${existingLands.length} existing lands`);
        }
      }

      if (lands && lands.length > 0) {
        console.log('💾 [Sync] Saving lands to localDB...');
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
        console.log(`✅ [Sync] Saved ${lands.length} lands to localDB`);
      } else {
        console.log('ℹ️ [Sync] No lands to save from server');
      }

      // Download schedules data using edge function (bypasses RLS issues)
      console.log('📥 [Sync] Fetching schedules via schedules-api edge function...');
      let schedules: any[] = [];
      let schedulesError: Error | null = null;
      
      try {
        schedules = await schedulesApi.fetchSchedules();
        console.log(`✅ [Sync] Fetched ${schedules?.length || 0} schedules from server via API`);
      } catch (error) {
        schedulesError = error as Error;
        console.error('❌ [Sync] Failed to fetch schedules via API:', schedulesError);
      }

      // Clear existing schedules before saving
      console.log('🗑️ [Sync] Clearing existing schedules before server data download...');
      const existingSchedules = await localDB.getAllSchedules(userId);
      console.log(`📊 [Sync] Found ${existingSchedules.length} existing schedules to clear`);
      
      // Clear all schedules from the store
      if (existingSchedules.length > 0) {
        const db = (localDB as any).db;
        if (db) {
          const tx = db.transaction('cropSchedules', 'readwrite');
          const store = tx.objectStore('cropSchedules');
          for (const schedule of existingSchedules) {
            await store.delete(schedule.id);
          }
          await tx.done;
          console.log(`✅ [Sync] Cleared ${existingSchedules.length} existing schedules`);
        }
      }

      if (schedules && schedules.length > 0) {
        console.log('💾 [Sync] Saving schedules to localDB...');
        await localDB.bulkSave({
          schedules: schedules.map(s => ({
            // Core fields
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
            // Weather
            last_weather_update: s.last_weather_update,
            last_weather_check: s.last_weather_check || null,
            weather_data: s.weather_data,
            weather_auto_update_enabled: s.weather_auto_update_enabled || null,
            ai_model: s.ai_model,
            // Status
            is_active: s.is_active,
            completed_at: s.completed_at,
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
            // Additional metadata
            metadata: s.metadata || null,
            // Timestamps
            created_at: s.created_at,
            updated_at: s.updated_at,
            lastModified: new Date(s.updated_at || s.created_at).getTime(),
            syncStatus: 'synced' as const,
          })),
        });
        console.log(`✅ [Sync] Saved ${schedules.length} schedules to localDB`);
      } else {
        console.log('ℹ️ [Sync] No schedules to save from server');
      }

      // Download schedule_tasks for all schedules
      console.log('📥 [Sync] Fetching schedule tasks...');
      let tasks: any[] = [];
      
      try {
        tasks = await schedulesApi.fetchTasks();
        console.log(`✅ [Sync] Fetched ${tasks?.length || 0} tasks from server`);
      } catch (error) {
        console.warn('⚠️ [Sync] Failed to fetch tasks (may not be implemented yet):', error);
      }

      // Clear existing tasks before saving
      if (tasks && tasks.length > 0) {
        console.log('🗑️ [Sync] Clearing existing tasks before server data download...');
        const db = (localDB as any).db;
        if (db) {
          const tx = db.transaction('scheduleTasks', 'readwrite');
          const store = tx.objectStore('scheduleTasks');
          await store.clear();
          await tx.done;
        }

        console.log('💾 [Sync] Saving tasks to localDB...');
        await localDB.bulkSave({
          tasks: tasks.map(t => ({
            id: t.id,
            schedule_id: t.schedule_id,
            tenant_id: tenantId,
            farmer_id: t.farmer_id || null,
            task_name: t.task_name,
            task_type: t.task_type,
            task_date: t.task_date,
            task_description: t.task_description || null,
            days_from_sowing: t.days_from_sowing || null,
            sequence_order: t.sequence_order || null,
            stage_key: t.stage_key || null,
            stage_name: t.stage_name || null,
            stage_order: t.stage_order || null,
            duration_hours: t.duration_hours || null,
            priority: t.priority || null,
            weather_dependent: t.weather_dependent || null,
            detailed_steps: t.detailed_steps || null,
            resources: t.resources || null,
            estimated_cost: t.estimated_cost || null,
            currency: t.currency || null,
            water_required_liters: t.water_required_liters || null,
            instructions: t.instructions || null,
            precautions: t.precautions || null,
            regional_terms: t.regional_terms || null,
            ideal_weather: t.ideal_weather || null,
            weather_risk_level: t.weather_risk_level || null,
            status: t.status || null,
            completed_at: t.completed_at || null,
            completed_by: t.completed_by || null,
            completion_notes: t.completion_notes || null,
            original_date: t.original_date || null,
            reschedule_reason: t.reschedule_reason || null,
            auto_rescheduled: t.auto_rescheduled || null,
            climate_adjusted: t.climate_adjusted || null,
            original_date_before_climate_adjust: t.original_date_before_climate_adjust || null,
            climate_adjustment_reason: t.climate_adjustment_reason || null,
            product_recommendations: t.product_recommendations || null,
            product_type: t.product_type || null,
            yield_boost_technique: t.yield_boost_technique || null,
            yield_impact: t.yield_impact || null,
            yield_impact_details: t.yield_impact_details || null,
            skip_penalty: t.skip_penalty || null,
            skip_penalty_details: t.skip_penalty_details || null,
            language: t.language || null,
            created_at: t.created_at || null,
            updated_at: t.updated_at || null,
            lastModified: new Date(t.updated_at || t.created_at || Date.now()).getTime(),
            syncStatus: 'synced' as const,
          })),
        });
        console.log(`✅ [Sync] Saved ${tasks.length} tasks to localDB`);
      }
      
      // VERIFY data was actually saved correctly
      const verifyLands = await localDB.getLands(undefined, userId);
      const verifySchedules = await localDB.getAllSchedules(userId);
      
      const expectedLands = lands?.length || 0;
      const expectedSchedules = schedules?.length || 0;
      
      console.log('🔍 [Sync] Data verification:', {
        landsInDB: verifyLands.length,
        schedulesInDB: verifySchedules.length,
        expectedLands,
        expectedSchedules,
        userId,
        tenant,
      });

      // Verify that what we saved matches what we fetched
      if (verifyLands.length !== expectedLands) {
        console.error('❌ [Sync] Land save mismatch!', {
          expected: expectedLands,
          actual: verifyLands.length
        });
        throw new Error(`LocalDB save verification failed for lands: expected ${expectedLands}, got ${verifyLands.length}`);
      }

      if (verifySchedules.length !== expectedSchedules) {
        console.error('❌ [Sync] Schedule save mismatch!', {
          expected: expectedSchedules,
          actual: verifySchedules.length
        });
        throw new Error(`LocalDB save verification failed for schedules: expected ${expectedSchedules}, got ${verifySchedules.length}`);
      }
      
      console.log('✅ [Sync] Data verification passed - LocalDB matches server data');
      console.log('✅ [Sync] Server data download complete');
    } catch (error) {
      console.error('❌ [Sync] Failed to download server data:', error);
      throw error;
    }
  }

  getSyncStatus(): boolean {
    return this.syncInProgress;
  }

  isNetworkAvailable(): boolean {
    return networkStatusService.getStatus();
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const syncService = new SyncService();
