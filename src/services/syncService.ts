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

      // BUILD-AWARE OFFLINE REHYDRATION:
      // VITE_APP_VERSION is the deployment SHA in production. A new build
      // triggers one safe full rehydration so changed DB fields reach IndexedDB.
      const syncMeta = await localDB.getSyncMetadata();
      const currentBuildHash = import.meta.env.VITE_APP_VERSION || 'development';
      const buildChanged = syncMeta?.cacheBuildHash !== currentBuildHash;

      if (buildChanged) {
        const pendingBeforeRefresh = await localDB.getPendingChanges();
        console.log('🔄 [Sync] New offline cache contract detected', {
          previousBuild: syncMeta?.cacheBuildHash || 'none',
          currentBuild: currentBuildHash,
          pendingCount:
            pendingBeforeRefresh.farmers.length +
            pendingBeforeRefresh.lands.length +
            pendingBeforeRefresh.schedules.length +
            pendingBeforeRefresh.messages.length,
        });

        // Never clear local data until pending writes are accepted.
        await this.uploadPendingChanges(pendingBeforeRefresh, result, tenantId);
        const pendingAfterUpload = await localDB.getPendingChanges();
        const remainingPending =
          pendingAfterUpload.farmers.length +
          pendingAfterUpload.lands.length +
          pendingAfterUpload.schedules.length +
          pendingAfterUpload.messages.length;

        if (remainingPending > 0 || (result.errors && result.errors.length > 0)) {
          result.success = false;
          result.message = 'Offline data could not be fully uploaded; refresh deferred';
          result.errors = [
            ...(result.errors || []),
            'Offline refresh deferred because local changes remain pending.',
          ];
          return result;
        }

        await localDB.prepareForFullServerRefresh();
        await this.downloadServerData(tenantId);

        await localDB.updateSyncMetadata({
          lastSyncTime: Date.now(),
          cacheBuildHash: currentBuildHash,
          syncInProgress: false,
        });

        result.message = 'Offline data refreshed for the latest app build';
        return result;
      }

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
        cacheBuildHash: currentBuildHash,
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

  private async uploadPendingChanges(
    pendingChanges: Awaited<ReturnType<typeof localDB.getPendingChanges>>,
    result: SyncResult,
    tenantId: string
  ): Promise<void> {
    if (pendingChanges.farmers.length > 0) await this.syncFarmers(pendingChanges.farmers, result, tenantId);
    if (pendingChanges.lands.length > 0) await this.syncLands(pendingChanges.lands, result, tenantId);
    if (pendingChanges.schedules.length > 0) await this.syncSchedules(pendingChanges.schedules, result);
    if (pendingChanges.messages.length > 0) await this.syncChatMessages(pendingChanges.messages, result);
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
              ...f,
              tenant_id: tenantId,
              lastModified: new Date(f.updated_at || f.created_at || Date.now()).getTime(),
              syncStatus: 'synced' as const,
            })),),
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
              ...l,
              tenant_id: tenantId,
              farmer_id: l.farmer_id || userId,
              lastModified: new Date(l.updated_at || l.created_at || Date.now()).getTime(),
              syncStatus: 'synced' as const,
            })),),
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
              ...s,
              tenant_id: tenantId,
              lastModified: new Date(s.updated_at || s.created_at || Date.now()).getTime(),
              syncStatus: 'synced' as const,
            })),),
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
              ...t,
              tenant_id: tenantId,
              farmer_id: t.farmer_id || userId,
              lastModified: new Date(t.updated_at || t.created_at || Date.now()).getTime(),
              syncStatus: 'synced' as const,
            })),),
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
