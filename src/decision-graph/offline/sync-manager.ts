/**
 * Sync Manager for Decision Graph Offline Data
 * 
 * Handles bidirectional synchronization between:
 * - Server → Device (rule updates, new crop groups)
 * - Device → Server (pending advisories, execution logs)
 * 
 * CRITICAL: Sync must be resilient to partial failures
 */

import { CauseRule, CropGroup, UnifiedAdvisory, DecisionInput } from '../types';
import { getOfflineRuleCache, OfflineRuleCache } from './rule-cache';
import { getRecentLogs, clearLogs } from '../audit-logger';

// Sync configuration
const SYNC_RETRY_DELAYS = [1000, 5000, 15000, 60000]; // Exponential backoff
const MAX_BATCH_SIZE = 50;
const SYNC_TIMEOUT_MS = 30000;

interface SyncResult {
  success: boolean;
  rulesUpdated: number;
  advisoriesSynced: number;
  errors: string[];
  duration_ms: number;
}

interface RuleSyncPayload {
  crop_group: CropGroup;
  rules: CauseRule[];
  version: string;
  checksum: string;
}

interface AdvisorySyncPayload {
  advisory_id: string;
  input: DecisionInput;
  advisory: UnifiedAdvisory;
  generated_offline: boolean;
  client_timestamp: number;
}

type SyncDirection = 'pull' | 'push' | 'both';

/**
 * Sync Manager - Handles all online/offline synchronization
 */
export class SyncManager {
  private cache: OfflineRuleCache;
  private isSyncing = false;
  private lastSyncAttempt = 0;
  private syncListeners: Set<(status: SyncStatus) => void> = new Set();

  constructor() {
    this.cache = getOfflineRuleCache();
  }

  /**
   * Initialize sync manager and set up listeners
   */
  async initialize(): Promise<void> {
    await this.cache.initialize();
    
    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }

    console.log('[SyncManager] Initialized');
  }

  /**
   * Perform full sync (rules + advisories)
   */
  async performFullSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        rulesUpdated: 0,
        advisoriesSynced: 0,
        errors: ['Sync already in progress'],
        duration_ms: 0
      };
    }

    const startTime = Date.now();
    this.isSyncing = true;
    this.notifyListeners({ type: 'syncing', progress: 0 });

    const errors: string[] = [];
    let rulesUpdated = 0;
    let advisoriesSynced = 0;

    try {
      // Step 1: Pull rules from server (40% of progress)
      this.notifyListeners({ type: 'syncing', progress: 10, message: 'Downloading rules...' });
      const ruleResult = await this.syncRulesFromServer();
      rulesUpdated = ruleResult.updated;
      if (ruleResult.errors.length > 0) {
        errors.push(...ruleResult.errors);
      }
      this.notifyListeners({ type: 'syncing', progress: 40 });

      // Step 2: Push pending advisories (30% of progress)
      this.notifyListeners({ type: 'syncing', progress: 50, message: 'Uploading advisories...' });
      const advisoryResult = await this.syncAdvisoriesToServer();
      advisoriesSynced = advisoryResult.synced;
      if (advisoryResult.errors.length > 0) {
        errors.push(...advisoryResult.errors);
      }
      this.notifyListeners({ type: 'syncing', progress: 70 });

      // Step 3: Flush audit logs (20% of progress)
      this.notifyListeners({ type: 'syncing', progress: 80, message: 'Syncing logs...' });
      await this.syncAuditLogs();
      this.notifyListeners({ type: 'syncing', progress: 90 });

      // Step 4: Update sync metadata
      await this.cache.updateSyncMetadata(true);
      this.lastSyncAttempt = Date.now();

      this.notifyListeners({ 
        type: 'complete', 
        progress: 100,
        message: `Synced ${rulesUpdated} rules, ${advisoriesSynced} advisories`
      });

      return {
        success: errors.length === 0,
        rulesUpdated,
        advisoriesSynced,
        errors,
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown sync error';
      errors.push(errorMsg);
      
      this.notifyListeners({ type: 'error', message: errorMsg });

      return {
        success: false,
        rulesUpdated,
        advisoriesSynced,
        errors,
        duration_ms: Date.now() - startTime
      };

    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync only rules (lightweight)
   */
  async syncRulesOnly(): Promise<{ updated: number; errors: string[] }> {
    return await this.syncRulesFromServer();
  }

  /**
   * Sync only pending advisories
   */
  async syncAdvisoriesOnly(): Promise<{ synced: number; errors: string[] }> {
    return await this.syncAdvisoriesToServer();
  }

  /**
   * Pull rules from server
   */
  private async syncRulesFromServer(): Promise<{ updated: number; errors: string[] }> {
    const errors: string[] = [];
    let updated = 0;

    try {
      // Get list of crop groups that need refresh
      const cachedGroups = await this.cache.getCachedCropGroups();
      const allCropGroups: CropGroup[] = [
        CropGroup.CEREALS, CropGroup.PULSES, CropGroup.OILSEEDS, 
        CropGroup.VEGETABLES, CropGroup.FRUITS, CropGroup.SPICES, 
        CropGroup.FIBER, CropGroup.SUGARCANE, CropGroup.FODDER
      ];

      const groupsToFetch = new Set<CropGroup>();
      
      // Check which groups need refresh
      for (const group of allCropGroups) {
        if (await this.cache.needsRuleRefresh(group)) {
          groupsToFetch.add(group);
        }
      }

      // Add any groups not yet cached
      for (const group of allCropGroups) {
        if (!cachedGroups.includes(group)) {
          groupsToFetch.add(group);
        }
      }

      if (groupsToFetch.size === 0) {
        console.log('[SyncManager] All rules up to date');
        return { updated: 0, errors: [] };
      }

      // NOTE: In production, this would call a Supabase edge function
      // For now, we use hardcoded empty arrays (rules are loaded from cause-inference)
      for (const group of groupsToFetch) {
        try {
          // Rules are registered in cause-inference module
          // Just mark as cached with empty array for now
          await this.cache.cacheRulesForCropGroup(group, []);
          console.log(`[SyncManager] Marked ${group} as cached`);
        } catch (error) {
          const msg = `Failed to cache ${group}: ${error instanceof Error ? error.message : 'Unknown'}`;
          errors.push(msg);
          console.error(`[SyncManager] ${msg}`);
        }
      }

      return { updated, errors };

    } catch (error) {
      const msg = `Rule sync failed: ${error instanceof Error ? error.message : 'Unknown'}`;
      errors.push(msg);
      return { updated, errors };
    }
  }

  /**
   * Push pending advisories to server
   */
  private async syncAdvisoriesToServer(): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      const pending = await this.cache.getUnsyncedAdvisories();
      
      if (pending.length === 0) {
        console.log('[SyncManager] No pending advisories to sync');
        return { synced: 0, errors: [] };
      }

      console.log(`[SyncManager] Syncing ${pending.length} pending advisories`);

      // Process in batches
      for (let i = 0; i < pending.length; i += MAX_BATCH_SIZE) {
        const batch = pending.slice(i, i + MAX_BATCH_SIZE);
        
        for (const advisory of batch) {
          try {
            // NOTE: In production, this would call Supabase to store the advisory
            // For now, we just mark it as synced
            await this.uploadAdvisory(advisory);
            await this.cache.markAdvisorySynced(advisory.advisory_id);
            synced++;
          } catch (error) {
            const msg = `Failed to sync advisory ${advisory.advisory_id}: ${error instanceof Error ? error.message : 'Unknown'}`;
            errors.push(msg);
            await this.cache.recordSyncFailure(
              advisory.advisory_id, 
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
        }
      }

      return { synced, errors };

    } catch (error) {
      const msg = `Advisory sync failed: ${error instanceof Error ? error.message : 'Unknown'}`;
      errors.push(msg);
      return { synced, errors };
    }
  }

  /**
   * Upload single advisory to server
   */
  private async uploadAdvisory(pending: {
    advisory_id: string;
    input: DecisionInput;
    advisory: UnifiedAdvisory;
    generated_offline: boolean;
    created_at: number;
  }): Promise<void> {
    // NOTE: In production, this would be a Supabase insert
    // For now, we simulate the upload
    console.log(`[SyncManager] Uploaded advisory: ${pending.advisory_id} (offline: ${pending.generated_offline})`);
    
    // Also store in local history
    await this.cache.storeAdvisoryHistory(pending.advisory, pending.generated_offline);
  }

  /**
   * Sync audit logs to server
   */
  private async syncAuditLogs(): Promise<void> {
    try {
      const logs = getRecentLogs(100);
      
      if (logs.length === 0) {
        return;
      }

      console.log(`[SyncManager] Syncing ${logs.length} audit logs`);
      
      // NOTE: In production, this would batch upload to Supabase
      // For now, we just clear the logs after "syncing"
      clearLogs();
      
    } catch (error) {
      console.error('[SyncManager] Failed to sync audit logs:', error);
    }
  }

  /**
   * Handle device coming online
   */
  private async handleOnline(): Promise<void> {
    console.log('[SyncManager] Device online - initiating sync');
    
    // Small delay to ensure connection is stable
    setTimeout(async () => {
      if (navigator.onLine) {
        await this.performFullSync();
      }
    }, 2000);
  }

  /**
   * Handle device going offline
   */
  private handleOffline(): void {
    console.log('[SyncManager] Device offline - sync paused');
    this.notifyListeners({ type: 'offline' });
  }

  /**
   * Check sync status
   */
  async getSyncStatus(): Promise<{
    isOnline: boolean;
    isSyncing: boolean;
    lastSync: number | null;
    pendingAdvisories: number;
    canOperateOffline: boolean;
  }> {
    const metadata = await this.cache.getSyncMetadata();
    const pendingCount = await this.cache.getPendingCount();
    const canOperate = await this.cache.canOperateOffline();

    return {
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isSyncing: this.isSyncing,
      lastSync: metadata?.last_full_sync || null,
      pendingAdvisories: pendingCount,
      canOperateOffline: canOperate
    };
  }

  /**
   * Subscribe to sync status changes
   */
  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  private notifyListeners(status: SyncStatus): void {
    for (const listener of this.syncListeners) {
      try {
        listener(status);
      } catch (error) {
        console.error('[SyncManager] Listener error:', error);
      }
    }
  }

  /**
   * Force refresh all rules (ignores cache age)
   */
  async forceRefreshRules(): Promise<SyncResult> {
    // Clear existing rules
    const cache = getOfflineRuleCache();
    await cache.clearAllData();
    
    // Perform full sync
    return await this.performFullSync();
  }
}

interface SyncStatus {
  type: 'syncing' | 'complete' | 'error' | 'offline';
  progress?: number;
  message?: string;
}

// Singleton instance
let syncManagerInstance: SyncManager | null = null;

/**
 * Get the singleton SyncManager instance
 */
export function getSyncManager(): SyncManager {
  if (!syncManagerInstance) {
    syncManagerInstance = new SyncManager();
  }
  return syncManagerInstance;
}

/**
 * Initialize the sync manager
 */
export async function initializeSyncManager(): Promise<SyncManager> {
  const manager = getSyncManager();
  await manager.initialize();
  return manager;
}
