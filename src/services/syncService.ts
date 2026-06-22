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
  // PHASE 1C: Debounce + throttle visibility-triggered syncs.
  private lastSyncAt: number = 0;
  private visibilityDebounceTimer: NodeJS.Timeout | null = null;
  private static readonly VISIBILITY_DEBOUNCE_MS = 30 * 1000; // 30s debounce
  private static readonly VISIBILITY_MIN_GAP_MS = 5 * 60 * 1000; // 5min throttle

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

    // PHASE 1C: Sync on visibility change — debounced 30s + only if last sync > 5min ago.
    // Prevents redundant 9.5s cold-syncs on every tab focus (huge egress saver at scale).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !networkStatusService.getStatus()) return;

      const sinceLast = Date.now() - this.lastSyncAt;
      if (sinceLast < SyncService.VISIBILITY_MIN_GAP_MS) {
        // Recent sync — skip silently to avoid log spam
        return;
      }

      if (this.visibilityDebounceTimer) clearTimeout(this.visibilityDebounceTimer);
      this.visibilityDebounceTimer = setTimeout(() => {
        if (!document.hidden && networkStatusService.getStatus()) {
          console.log('👁️ [Sync] Tab visible >5min idle — debounced sync');
          this.performSync();
        }
      }, SyncService.VISIBILITY_DEBOUNCE_MS);
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

      if (pendingChanges.schedules.length > 0) {
        console.log('📤 [Sync] Uploading schedules...');
        await this.syncSchedules(pendingChanges.schedules, result);
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
      // PHASE 1C: Stamp last sync time so visibility-change throttle can skip recent syncs.
      this.lastSyncAt = Date.now();
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
            const { lastModified, syncStatus, ...uploadData } = farmer;
            await supabase
              .from('farmers')
              .update({
                ...uploadData,
                updated_at: new Date(farmer.lastModified).toISOString(),
              })
              .eq('id', farmer.id);
            
            syncedIds.push(farmer.id);
          }
        } else {
          // New farmer - insert to server
          const { lastModified, syncStatus, ...uploadData } = farmer;
          await supabase
            .from('farmers')
            .insert({
              ...uploadData,
              tenant_id: tenantId,
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
            const { lastModified, syncStatus, ...uploadData } = land;
            await supabase
              .from('lands')
              .update({
                ...uploadData,
                updated_at: new Date(land.lastModified).toISOString(),
              })
              .eq('id', land.id);
            
            syncedIds.push(land.id);
          }
        } else {
          const { lastModified, syncStatus, ...uploadData } = land;
          await supabase
            .from('lands')
            .insert({
              ...uploadData,
              tenant_id: tenantId,
              created_at: new Date(land.lastModified).toISOString(),
            });
          
          syncedIds.push(land.id);
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
            // Update existing schedule with ALL fields
            const { lastModified, syncStatus, ...uploadData } = schedule;
            await supabase
              .from('crop_schedules')
              .update({
                ...uploadData,
                updated_at: new Date(schedule.lastModified).toISOString(),
              })
              .eq('id', schedule.id);
            
            syncedIds.push(schedule.id);
          }
        } else {
          // Insert new schedule with ALL fields
          const { lastModified, syncStatus, ...uploadData } = schedule;
          await supabase
            .from('crop_schedules')
            .insert({
              ...uploadData,
              tenant_id: tenantId || '',
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
    // SPRINT 2 FIX: Previously this was a no-op that silently marked messages as synced
    // without uploading, causing data loss. Now uploads to ai_chat_messages.
    const syncedIds: string[] = [];

    for (const message of messages) {
      try {
        // Skip messages missing required server fields
        if (!message.session_id || !message.tenant_id || !message.farmer_id || !message.role || !message.content) {
          console.warn(`[Sync] Skipping malformed chat message ${message.id}`);
          // Mark as synced anyway to prevent retry loops on bad local rows
          syncedIds.push(message.id);
          continue;
        }

        const { data: existing } = await supabase
          .from('ai_chat_messages')
          .select('id')
          .eq('id', message.id)
          .maybeSingle();

        if (existing) {
          // Server already has it — just mark local as synced
          syncedIds.push(message.id);
          continue;
        }

        // Strip local-only fields before upload
        const { lastModified, syncStatus, ...uploadData } = message;

        const { error } = await supabase
          .from('ai_chat_messages')
          .insert({
            ...uploadData,
            created_at: message.created_at || new Date(message.lastModified || Date.now()).toISOString(),
          });

        if (error) {
          // Conflict/duplicate => treat as synced
          if ((error as any).code === '23505') {
            syncedIds.push(message.id);
            continue;
          }
          throw error;
        }

        syncedIds.push(message.id);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to sync chat message ${message.id}:`, error);
        result.errors?.push(`Chat message: ${errorMsg}`);
        result.success = false;
      }
    }

    for (const id of syncedIds) {
      await localDB.markAsSynced('message', id);
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

      // ====================================================================
      // STEP 0: Download subscription data FIRST (gating depends on it)
      // ====================================================================
      await this.downloadSubscriptionData(client, userId, tenant);

      // STEP 0.5: Download proactive alerts (offline-resilient inbox)
      await this.downloadProactiveAlerts(client, userId);

      // ====================================================================
      // PERF: Run independent downloads in PARALLEL.
      // - farmers, lands, alerts, crops are fully independent.
      // - schedules must finish before tasks (data dependency).
      // ====================================================================
      const phaseStart = Date.now();

      const downloadFarmers = async () => {
        console.log('📥 [Sync] Fetching farmers from server...');
        const { data: farmers, error: farmersError } = await client
          .from('farmers')
          .select('*')
          .eq('tenant_id', tenant)
          .eq('id', userId);

        if (farmersError) {
          console.error('❌ [Sync] Failed to fetch farmers:', farmersError);
          return;
        }
        console.log(`✅ [Sync] Fetched ${farmers?.length || 0} farmers from server`);

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
      };

      // Lands download (uses edge function); returns count for verification
      // PHASE 3C: Read per-entity lastSync to request only delta rows.
      const syncMeta = await localDB.getSyncMetadata();
      const landsSince = syncMeta?.entityLastSync?.lands ?? null;
      const schedulesSince = syncMeta?.entityLastSync?.schedules ?? null;
      const tasksSince = syncMeta?.entityLastSync?.tasks ?? null;

      let lands: any[] = [];
      const downloadLands = async () => {
        console.log('📥 [Sync] Fetching lands via lands-api edge function...', { since: landsSince });
        try {
          lands = await landsApi.fetchLands({ since: landsSince });
          console.log(`✅ [Sync] Fetched ${lands?.length || 0} lands from server via API (delta=${!!landsSince})`);
        } catch (error) {
          console.error('❌ [Sync] Failed to fetch lands via API:', error);
        }

        // PHASE 3C: In delta mode (since present), DO NOT clear local lands.
        // Only full-sync (no since) should wipe and replace.
        if (!landsSince) {
          const existingLands = await localDB.getLands(undefined, userId);
          if (existingLands.length > 0) {
            const db = (localDB as any).db;
            if (db) {
              const tx = db.transaction('lands', 'readwrite');
              const store = tx.objectStore('lands');
              for (const land of existingLands) {
                await store.delete(land.id);
              }
              await tx.done;
            }
          }
        }

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
              ndvi_geotiff_url: l.ndvi_geotiff_url || null,
              ndvi_status: l.ndvi_status || null,
              last_processed_at: l.last_processed_at,
              tile_id: l.tile_id,
              tile_ids: l.tile_ids,
              mgrs_tile_id: l.mgrs_tile_id,
              land_documents: l.land_documents,
              notes: l.notes,
              marketplace_enabled: l.marketplace_enabled,
              soil_confidence_level: l.soil_confidence_level || null,
              soil_data_source: l.soil_data_source || null,
              current_moisture_status: l.current_moisture_status || null,
              last_moisture_update: l.last_moisture_update || null,
              is_active: l.is_active,
              deleted_at: l.deleted_at,
              created_at: l.created_at,
              updated_at: l.updated_at,
              lastModified: new Date(l.updated_at || l.created_at).getTime(),
              syncStatus: 'synced' as const,
            })),
          });
          console.log(`✅ [Sync] Saved ${lands.length} lands to localDB`);

          // PHASE 3C: Advance the lands cursor to the newest updated_at we received.
          const maxUpdatedAt = lands
            .map(l => l.updated_at)
            .filter(Boolean)
            .sort()
            .pop();
          if (maxUpdatedAt) {
            await localDB.updateSyncMetadata({
              entityLastSync: {
                ...(syncMeta?.entityLastSync || {}),
                lands: maxUpdatedAt,
              },
            });
          }
        }
      };

      // Schedules + tasks (sequential within this branch — tasks depend on schedules)
      let schedules: any[] = [];
      const downloadSchedulesAndTasks = async () => {
        console.log('📥 [Sync] Fetching schedules via schedules-api edge function...', { since: schedulesSince });
        try {
          schedules = await schedulesApi.fetchSchedules(undefined, { since: schedulesSince });
          console.log(`✅ [Sync] Fetched ${schedules?.length || 0} schedules from server via API (delta=${!!schedulesSince})`);
        } catch (error) {
          console.error('❌ [Sync] Failed to fetch schedules via API:', error);
        }

        // PHASE 3C: Only wipe local schedules on full-sync (no since cursor).
        if (!schedulesSince) {
          const existingSchedules = await localDB.getAllSchedules(userId);
          if (existingSchedules.length > 0) {
            const db = (localDB as any).db;
            if (db) {
              const tx = db.transaction('cropSchedules', 'readwrite');
              const store = tx.objectStore('cropSchedules');
              for (const schedule of existingSchedules) {
                await store.delete(schedule.id);
              }
              await tx.done;
            }
          }
        }

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
              last_weather_check: s.last_weather_check || null,
              weather_data: s.weather_data,
              weather_auto_update_enabled: s.weather_auto_update_enabled || null,
              ai_model: s.ai_model,
              is_active: s.is_active,
              completed_at: s.completed_at,
              status: s.status || null,
              actual_harvest_date: s.actual_harvest_date || null,
              actual_profit: s.actual_profit || null,
              actual_total_cost: s.actual_total_cost || null,
              actual_yield_quintals: s.actual_yield_quintals || null,
              outcome_recorded_at: s.outcome_recorded_at || null,
              expected_gross_revenue: s.expected_gross_revenue || null,
              expected_market_price_per_quintal: s.expected_market_price_per_quintal || null,
              expected_net_profit: s.expected_net_profit || null,
              expected_profit: s.expected_profit || null,
              expected_yield_per_acre: s.expected_yield_per_acre || null,
              expected_yield_quintals: s.expected_yield_quintals || null,
              fertilizer_k_kg: s.fertilizer_k_kg || null,
              fertilizer_n_kg: s.fertilizer_n_kg || null,
              fertilizer_p_kg: s.fertilizer_p_kg || null,
              organic_fertilizer_kg: s.organic_fertilizer_kg || null,
              organic_manure_kg: s.organic_manure_kg || null,
              vermicompost_kg: s.vermicompost_kg || null,
              bio_fertilizer_units: s.bio_fertilizer_units || null,
              bio_pesticide_ml: s.bio_pesticide_ml || null,
              fungicide_gm: s.fungicide_gm || null,
              herbicide_ml: s.herbicide_ml || null,
              insecticide_ml: s.insecticide_ml || null,
              pesticide_requirements: s.pesticide_requirements || null,
              seed_quantity_kg: s.seed_quantity_kg || null,
              pgr_hormone_ml: s.pgr_hormone_ml || null,
              growth_regulators: s.growth_regulators || null,
              organic_input_details: s.organic_input_details || null,
              irrigation_count_total: s.irrigation_count_total || null,
              water_per_irrigation_liters: s.water_per_irrigation_liters || null,
              water_requirement_liters_total: s.water_requirement_liters_total || null,
              total_water_requirement_liters: s.total_water_requirement_liters || null,
              cost_by_category: s.cost_by_category || null,
              cost_by_stage: s.cost_by_stage || null,
              total_estimated_cost: s.total_estimated_cost || null,
              total_labor_cost: s.total_labor_cost || null,
              total_material_cost: s.total_material_cost || null,
              labor_rate_used: s.labor_rate_used || null,
              tasks_completed_count: s.tasks_completed_count || null,
              tasks_on_time_count: s.tasks_on_time_count || null,
              tasks_total_count: s.tasks_total_count || null,
              total_duration_days: s.total_duration_days || null,
              stages_covered: s.stages_covered || null,
              agro_climatic_zone: s.agro_climatic_zone || null,
              district_name: s.district_name || null,
              state_region: s.state_region || null,
              taluka_name: s.taluka_name || null,
              regional_dialect_zone: s.regional_dialect_zone || null,
              farming_type: s.farming_type || null,
              calculated_for_area_acres: s.calculated_for_area_acres || null,
              suitability_score: s.suitability_score || null,
              suitability_warnings: s.suitability_warnings || null,
              data_quality_score: s.data_quality_score || null,
              schedule_accuracy_score: s.schedule_accuracy_score || null,
              yield_boosting_techniques: s.yield_boosting_techniques || null,
              yield_multiplier_target: s.yield_multiplier_target || null,
              products_recommended_count: s.products_recommended_count || null,
              recommendation_order: s.recommendation_order || null,
              recommended_products: s.recommended_products || null,
              is_training_candidate: s.is_training_candidate || null,
              training_batch_id: s.training_batch_id || null,
              training_excluded_reason: s.training_excluded_reason || null,
              training_processed: s.training_processed || null,
              farmer_feedback: s.farmer_feedback || null,
              farmer_rating: s.farmer_rating || null,
              input_land_coordinates: s.input_land_coordinates || null,
              input_soil_data: s.input_soil_data || null,
              input_weather_data: s.input_weather_data || null,
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
              metadata: s.metadata || null,
              created_at: s.created_at,
              updated_at: s.updated_at,
              lastModified: new Date(s.updated_at || s.created_at).getTime(),
              syncStatus: 'synced' as const,
            })),
          });
          console.log(`✅ [Sync] Saved ${schedules.length} schedules to localDB`);

          // PHASE 3C: Advance schedules cursor.
          const maxSchedUpdated = schedules.map(s => s.updated_at).filter(Boolean).sort().pop();
          if (maxSchedUpdated) {
            const meta = await localDB.getSyncMetadata();
            await localDB.updateSyncMetadata({
              entityLastSync: { ...(meta?.entityLastSync || {}), schedules: maxSchedUpdated },
            });
          }
        }

        // Tasks depend on schedules — must run AFTER schedules complete
        console.log('📥 [Sync] Fetching schedule tasks...', { since: tasksSince });
        let tasks: any[] = [];
        try {
          tasks = await schedulesApi.fetchTasks(undefined, { since: tasksSince });
          console.log(`✅ [Sync] Fetched ${tasks?.length || 0} tasks from server (delta=${!!tasksSince})`);
        } catch (error) {
          console.warn('⚠️ [Sync] Failed to fetch tasks (may not be implemented yet):', error);
        }

        if (tasks && tasks.length > 0) {
          // PHASE 3C: Only clear tasks store on full-sync.
          if (!tasksSince) {
            const db = (localDB as any).db;
            if (db) {
              const tx = db.transaction('scheduleTasks', 'readwrite');
              const store = tx.objectStore('scheduleTasks');
              await store.clear();
              await tx.done;
            }
          }

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

          // PHASE 3C: Advance tasks cursor.
          const maxTaskUpdated = tasks.map(t => t.updated_at).filter(Boolean).sort().pop();
          if (maxTaskUpdated) {
            const meta = await localDB.getSyncMetadata();
            await localDB.updateSyncMetadata({
              entityLastSync: { ...(meta?.entityLastSync || {}), tasks: maxTaskUpdated },
            });
          }
        }
      };

      const downloadCrops = async () => {
        console.log('📥 [Sync] Fetching crops reference data...');
        try {
          const { data: crops, error: cropsError } = await client
            .from('crops')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

          if (cropsError) {
            console.warn('⚠️ [Sync] Failed to fetch crops:', cropsError);
          } else if (crops && crops.length > 0) {
            const db = (localDB as any).db;
            if (db) {
              const tx = db.transaction('crops', 'readwrite');
              const store = tx.objectStore('crops');
              await store.clear();
              for (const c of crops) {
                await store.put({
                  id: c.id,
                  value: c.value,
                  label: c.label,
                  label_local: c.label_local || null,
                  label_hi: c.label_hi || null,
                  label_mr: c.label_mr || null,
                  local_name: c.local_name || null,
                  icon: c.icon || '🌾',
                  description: c.description || null,
                  duration_days: c.duration_days || null,
                  season: c.season || null,
                  crop_group_id: c.crop_group_id || null,
                  display_order: c.display_order || 0,
                  is_active: c.is_active,
                  is_popular: c.is_popular || null,
                  metadata: c.metadata || null,
                  created_at: c.created_at || null,
                  updated_at: c.updated_at || new Date().toISOString(),
                  lastModified: new Date(c.updated_at || c.created_at || Date.now()).getTime(),
                  syncStatus: 'synced' as const,
                });
              }
              await tx.done;
              console.log(`✅ [Sync] Saved ${crops.length} crops to localDB`);
            }
          }
        } catch (cropError) {
          console.warn('⚠️ [Sync] Crops download failed (non-critical):', cropError);
        }
      };

      const downloadAlerts = async () => {
        console.log('📥 [Sync] Fetching farmer alerts...');
        try {
          const { data: alerts, error: alertsError } = await client
            .from('farmer_alerts')
            .select('*')
            .eq('tenant_id', tenant)
            .eq('farmer_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

          if (alertsError) {
            console.warn('⚠️ [Sync] Failed to fetch alerts:', alertsError);
          } else if (alerts && alerts.length > 0) {
            const db = (localDB as any).db;
            if (db) {
              const tx = db.transaction('farmerAlerts', 'readwrite');
              const store = tx.objectStore('farmerAlerts');
              await store.clear();
              for (const a of alerts) {
                await store.put({
                  id: a.id,
                  tenant_id: a.tenant_id,
                  farmer_id: a.farmer_id,
                  land_id: a.land_id,
                  title: a.title,
                  message: a.message,
                  alert_type: a.alert_type,
                  priority: a.priority,
                  ai_reasoning: a.ai_reasoning || null,
                  action_required: a.action_required || null,
                  data_source: a.data_source || null,
                  schedule_id: a.schedule_id || null,
                  is_read: a.is_read || false,
                  is_actioned: a.is_actioned || false,
                  actioned_at: a.actioned_at || null,
                  expires_at: a.expires_at || null,
                  created_at: a.created_at || null,
                  lastModified: new Date(a.created_at || Date.now()).getTime(),
                  syncStatus: 'synced' as const,
                });
              }
              await tx.done;
              console.log(`✅ [Sync] Saved ${alerts.length} alerts to localDB`);
            }
          }
        } catch (alertError) {
          console.warn('⚠️ [Sync] Alerts download failed (non-critical):', alertError);
        }
      };

      // PERF: Run all independent downloads in parallel.
      // schedulesAndTasks is one branch (tasks depend on schedules within it).
      await Promise.all([
        downloadFarmers(),
        downloadLands(),
        downloadSchedulesAndTasks(),
        downloadCrops(),
        downloadAlerts(),
      ]);

      console.log(`⏱️ [Sync] Parallel download phase completed in ${Date.now() - phaseStart}ms`);

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

      // Verify save integrity ONLY when the server returned new rows in this sync.
      // Delta syncs legitimately return 0 new rows while localDB retains prior data,
      // so we must NOT compare local total against the delta payload size.
      if (expectedLands > 0 && verifyLands.length < expectedLands) {
        console.error('❌ [Sync] Land save mismatch!', {
          expected: expectedLands,
          actual: verifyLands.length
        });
        throw new Error(`LocalDB save verification failed for lands: expected at least ${expectedLands}, got ${verifyLands.length}`);
      }

      if (expectedSchedules > 0 && verifySchedules.length < expectedSchedules) {
        console.error('❌ [Sync] Schedule save mismatch!', {
          expected: expectedSchedules,
          actual: verifySchedules.length
        });
        throw new Error(`LocalDB save verification failed for schedules: expected at least ${expectedSchedules}, got ${verifySchedules.length}`);
      }
      
      console.log('✅ [Sync] Data verification passed - LocalDB matches server data');
      console.log('✅ [Sync] Server data download complete');
    } catch (error) {
      console.error('❌ [Sync] Failed to download server data:', error);
      throw error;
    }
  }

  /**
   * Download subscription, plans, usage logs and payment records for offline use.
   * Runs FIRST so feature gating works during the rest of the sync.
   */
  private async downloadSubscriptionData(client: any, userId: string, tenantId: string): Promise<void> {
    console.log('📥 [Sync] Fetching subscription data (gating layer)...');

    // 1) Subscription plans (reference data — fetch all active + tenant-specific)
    try {
      const { data: plans, error } = await client
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true);
      if (error) {
        console.warn('⚠️ [Sync] Failed to fetch plans:', error);
      } else if (plans && plans.length > 0) {
        await localDB.saveSubscriptionPlans(plans.map((p: any) => ({ ...p })));
        console.log(`✅ [Sync] Saved ${plans.length} subscription plans`);
      }
    } catch (e) {
      console.warn('⚠️ [Sync] Plans download failed (non-critical):', e);
    }

    // 2) Farmer subscriptions (strict tenant + farmer isolation)
    try {
      const { data: subs, error } = await client
        .from('farmer_subscriptions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('farmer_id', userId);
      if (error) {
        console.warn('⚠️ [Sync] Failed to fetch subscriptions:', error);
      } else if (subs && subs.length > 0) {
        await localDB.saveFarmerSubscriptions(subs.map((s: any) => ({ ...s })));
        console.log(`✅ [Sync] Saved ${subs.length} farmer subscriptions`);
      } else {
        console.log('ℹ️ [Sync] No active subscription on server for farmer');
      }
    } catch (e) {
      console.warn('⚠️ [Sync] Subscription download failed (non-critical):', e);
    }

    // 3) Usage logs (current billing period only — last 90 days for safety)
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: logs, error } = await client
        .from('subscription_usage_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('farmer_id', userId)
        .gte('created_at', ninetyDaysAgo);
      if (error) {
        console.warn('⚠️ [Sync] Failed to fetch usage logs:', error);
      } else if (logs && logs.length > 0) {
        await localDB.saveUsageLogs(logs.map((l: any) => ({ ...l })));
        console.log(`✅ [Sync] Saved ${logs.length} usage logs`);
      }
    } catch (e) {
      console.warn('⚠️ [Sync] Usage logs download failed (non-critical):', e);
    }

    // 4) Payment records (tenant-scoped — farmer linkage via invoice/subscription)
    try {
      const { data: payments, error } = await client
        .from('payment_records')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.warn('⚠️ [Sync] Failed to fetch payment records:', error);
      } else if (payments && payments.length > 0) {
        await localDB.savePaymentRecords(
          payments.map((p: any) => ({ ...p, farmer_id: userId }))
        );
        console.log(`✅ [Sync] Saved ${payments.length} payment records`);
      }
    } catch (e) {
      console.warn('⚠️ [Sync] Payment records download failed (non-critical):', e);
    }
  }

  /**
   * Download last 100 proactive alerts for the farmer for offline access.
   */
  private async downloadProactiveAlerts(client: any, userId: string): Promise<void> {
    try {
      const { data, error } = await client
        .from('proactive_alerts')
        .select('*')
        .eq('farmer_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        console.warn('⚠️ [Sync] Failed to fetch proactive alerts:', error);
        return;
      }
      if (data && data.length > 0) {
        await localDB.saveProactiveAlerts(data.map((a: any) => ({ ...a })));
        console.log(`✅ [Sync] Saved ${data.length} proactive alerts offline`);
      }
    } catch (e) {
      console.warn('⚠️ [Sync] Proactive alerts download failed (non-critical):', e);
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
