/**
 * Offline Rule Cache for Decision Graph Engine
 * 
 * Provides IndexedDB-based caching of crop group rules for offline execution.
 * Ensures farmers can receive advisories even without network connectivity.
 * 
 * CRITICAL: All rules are versioned and validated before use.
 */

import { openDB, IDBPDatabase, DBSchema } from 'idb';
import { CauseRule, CropGroup, DecisionInput, UnifiedAdvisory } from '../types';

const DB_NAME = 'kisanshakti-decision-graph';
const DB_VERSION = 1;
const ENGINE_VERSION = '1.0.0';

// Cache expiry times
const RULE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ADVISORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface RuleDBSchema extends DBSchema {
  'crop-group-rules': {
    key: string;
    value: CachedRuleGroup;
    indexes: { 'by-cached-at': number };
  };
  'pending-advisories': {
    key: string;
    value: PendingAdvisory;
    indexes: { 'by-synced': number; 'by-created': number };
  };
  'advisory-history': {
    key: string;
    value: AdvisoryHistoryEntry;
    indexes: { 'by-farmer': string; 'by-land': string; 'by-created': number };
  };
  'sync-metadata': {
    key: string;
    value: SyncMetadata;
  };
}

interface CachedRuleGroup {
  group_key: string;
  rules: CauseRule[];
  version: string;
  cached_at: number;
  rule_count: number;
  checksum: string;
}

interface PendingAdvisory {
  advisory_id: string;
  input: DecisionInput;
  advisory: UnifiedAdvisory;
  generated_offline: boolean;
  synced: boolean;
  created_at: number;
  sync_attempts: number;
  last_sync_error?: string;
}

interface AdvisoryHistoryEntry {
  advisory_id: string;
  farmer_id: string;
  land_id: string;
  crop_code: string;
  advisory_summary: string;
  actions_recommended: string[];
  risk_level: string;
  confidence_score: number;
  created_at: number;
  was_offline: boolean;
}

interface SyncMetadata {
  key: string;
  last_full_sync: number;
  last_incremental_sync: number;
  pending_count: number;
  failed_sync_count: number;
  rules_version: string;
}

/**
 * Offline Rule Cache - Manages all offline decision graph data
 */
export class OfflineRuleCache {
  private db: IDBPDatabase<RuleDBSchema> | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  /**
   * Initialize the IndexedDB database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      this.db = await openDB<RuleDBSchema>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion) {
          console.log(`[OfflineRuleCache] Upgrading DB from v${oldVersion} to v${newVersion}`);

          // Crop group rules store
          if (!db.objectStoreNames.contains('crop-group-rules')) {
            const rulesStore = db.createObjectStore('crop-group-rules', { keyPath: 'group_key' });
            rulesStore.createIndex('by-cached-at', 'cached_at');
          }

          // Pending advisories store
          if (!db.objectStoreNames.contains('pending-advisories')) {
            const pendingStore = db.createObjectStore('pending-advisories', { keyPath: 'advisory_id' });
            pendingStore.createIndex('by-synced', 'synced');
            pendingStore.createIndex('by-created', 'created_at');
          }

          // Advisory history store
          if (!db.objectStoreNames.contains('advisory-history')) {
            const historyStore = db.createObjectStore('advisory-history', { keyPath: 'advisory_id' });
            historyStore.createIndex('by-farmer', 'farmer_id');
            historyStore.createIndex('by-land', 'land_id');
            historyStore.createIndex('by-created', 'created_at');
          }

          // Sync metadata store
          if (!db.objectStoreNames.contains('sync-metadata')) {
            db.createObjectStore('sync-metadata', { keyPath: 'key' });
          }
        },
        blocked() {
          console.warn('[OfflineRuleCache] Database upgrade blocked by other tabs');
        },
        blocking() {
          console.warn('[OfflineRuleCache] This tab is blocking database upgrade');
        },
      });

      this.isInitialized = true;
      console.log('[OfflineRuleCache] Database initialized successfully');
    } catch (error) {
      console.error('[OfflineRuleCache] Failed to initialize database:', error);
      throw error;
    }
  }

  private ensureDb(): IDBPDatabase<RuleDBSchema> {
    if (!this.db) {
      throw new Error('OfflineRuleCache not initialized. Call initialize() first.');
    }
    return this.db;
  }

  // ============================================================
  // RULE CACHING METHODS
  // ============================================================

  /**
   * Cache rules for a crop group
   */
  async cacheRulesForCropGroup(groupKey: CropGroup, rules: CauseRule[]): Promise<void> {
    const db = this.ensureDb();
    
    const checksum = this.calculateChecksum(rules);
    
    await db.put('crop-group-rules', {
      group_key: groupKey,
      rules,
      version: ENGINE_VERSION,
      cached_at: Date.now(),
      rule_count: rules.length,
      checksum
    });

    console.log(`[OfflineRuleCache] Cached ${rules.length} rules for ${groupKey}`);
  }

  /**
   * Get cached rules for a crop group
   * Returns null if cache is stale or missing
   */
  async getCachedRules(groupKey: CropGroup): Promise<CauseRule[] | null> {
    const db = this.ensureDb();
    
    const cached = await db.get('crop-group-rules', groupKey);
    
    if (!cached) {
      console.log(`[OfflineRuleCache] No cached rules for ${groupKey}`);
      return null;
    }

    // Check version compatibility
    if (cached.version !== ENGINE_VERSION) {
      console.log(`[OfflineRuleCache] Cache version mismatch for ${groupKey}: ${cached.version} vs ${ENGINE_VERSION}`);
      return null;
    }

    // Check if cache is stale
    if (Date.now() - cached.cached_at > RULE_CACHE_MAX_AGE_MS) {
      console.log(`[OfflineRuleCache] Cache expired for ${groupKey}`);
      return null;
    }

    console.log(`[OfflineRuleCache] Retrieved ${cached.rule_count} cached rules for ${groupKey}`);
    return cached.rules;
  }

  /**
   * Get cached rules, accepting stale data if necessary (for true offline mode)
   */
  async getCachedRulesForceOffline(groupKey: CropGroup): Promise<CauseRule[] | null> {
    const db = this.ensureDb();
    
    const cached = await db.get('crop-group-rules', groupKey);
    
    if (!cached) {
      return null;
    }

    // Even if stale, return for offline use (but log warning)
    if (Date.now() - cached.cached_at > RULE_CACHE_MAX_AGE_MS) {
      console.warn(`[OfflineRuleCache] Using stale cache for ${groupKey} (offline mode)`);
    }

    return cached.rules;
  }

  /**
   * Cache all crop group rules at once (bulk operation for initial sync)
   */
  async cacheAllRules(allRules: Map<CropGroup, CauseRule[]>): Promise<void> {
    const db = this.ensureDb();
    
    const tx = db.transaction('crop-group-rules', 'readwrite');
    const store = tx.objectStore('crop-group-rules');

    const promises: Promise<string>[] = [];
    
    for (const [groupKey, rules] of allRules) {
      const checksum = this.calculateChecksum(rules);
      promises.push(store.put({
        group_key: groupKey,
        rules,
        version: ENGINE_VERSION,
        cached_at: Date.now(),
        rule_count: rules.length,
        checksum
      }));
    }

    await Promise.all(promises);
    await tx.done;

    console.log(`[OfflineRuleCache] Bulk cached rules for ${allRules.size} crop groups`);
  }

  /**
   * Check if rules need refresh
   */
  async needsRuleRefresh(groupKey: CropGroup): Promise<boolean> {
    const db = this.ensureDb();
    
    const cached = await db.get('crop-group-rules', groupKey);
    
    if (!cached) return true;
    if (cached.version !== ENGINE_VERSION) return true;
    if (Date.now() - cached.cached_at > RULE_CACHE_MAX_AGE_MS) return true;
    
    return false;
  }

  /**
   * Get all cached crop groups
   */
  async getCachedCropGroups(): Promise<CropGroup[]> {
    const db = this.ensureDb();
    
    const all = await db.getAll('crop-group-rules');
    return all.map(entry => entry.group_key as CropGroup);
  }

  // ============================================================
  // PENDING ADVISORY METHODS
  // ============================================================

  /**
   * Store a pending advisory generated offline
   */
  async storePendingAdvisory(
    input: DecisionInput,
    advisory: UnifiedAdvisory,
    generatedOffline: boolean = true
  ): Promise<void> {
    const db = this.ensureDb();
    
    await db.put('pending-advisories', {
      advisory_id: advisory.advisory_id,
      input,
      advisory,
      generated_offline: generatedOffline,
      synced: false,
      created_at: Date.now(),
      sync_attempts: 0
    });

    // Update pending count in metadata
    await this.incrementPendingCount();

    console.log(`[OfflineRuleCache] Stored pending advisory: ${advisory.advisory_id}`);
  }

  /**
   * Get all unsynced advisories
   */
  async getUnsyncedAdvisories(): Promise<PendingAdvisory[]> {
    const db = this.ensureDb();
    
    const all = await db.getAllFromIndex('pending-advisories', 'by-synced', 0);
    return all.filter(a => !a.synced);
  }

  /**
   * Mark advisory as synced
   */
  async markAdvisorySynced(advisoryId: string): Promise<void> {
    const db = this.ensureDb();
    
    const existing = await db.get('pending-advisories', advisoryId);
    if (existing) {
      existing.synced = true;
      await db.put('pending-advisories', existing);
      await this.decrementPendingCount();
    }
  }

  /**
   * Record sync failure for an advisory
   */
  async recordSyncFailure(advisoryId: string, error: string): Promise<void> {
    const db = this.ensureDb();
    
    const existing = await db.get('pending-advisories', advisoryId);
    if (existing) {
      existing.sync_attempts += 1;
      existing.last_sync_error = error;
      await db.put('pending-advisories', existing);
    }
  }

  /**
   * Get pending advisories count
   */
  async getPendingCount(): Promise<number> {
    const db = this.ensureDb();
    
    const all = await db.getAllFromIndex('pending-advisories', 'by-synced', 0);
    return all.filter(a => !a.synced).length;
  }

  // ============================================================
  // ADVISORY HISTORY METHODS
  // ============================================================

  /**
   * Store advisory in history for offline reference
   */
  async storeAdvisoryHistory(
    advisory: UnifiedAdvisory, 
    wasOffline: boolean = false,
    farmerId?: string,
    landId?: string
  ): Promise<void> {
    const db = this.ensureDb();
    
    await db.put('advisory-history', {
      advisory_id: advisory.advisory_id,
      farmer_id: farmerId || 'unknown',
      land_id: landId || 'unknown',
      crop_code: advisory.facts.crop_code,
      advisory_summary: advisory.summary_key,
      actions_recommended: advisory.actions.map(a => a.action as string),
      risk_level: advisory.risk_level,
      confidence_score: advisory.confidence,
      created_at: Date.now(),
      was_offline: wasOffline
    });

    // Clean up old history entries
    await this.cleanupOldHistory();
  }

  /**
   * Get advisory history for a farmer
   */
  async getAdvisoryHistoryByFarmer(farmerId: string, limit: number = 50): Promise<AdvisoryHistoryEntry[]> {
    const db = this.ensureDb();
    
    const all = await db.getAllFromIndex('advisory-history', 'by-farmer', farmerId);
    return all
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  }

  /**
   * Get advisory history for a land
   */
  async getAdvisoryHistoryByLand(landId: string, limit: number = 30): Promise<AdvisoryHistoryEntry[]> {
    const db = this.ensureDb();
    
    const all = await db.getAllFromIndex('advisory-history', 'by-land', landId);
    return all
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  }

  // ============================================================
  // SYNC METADATA METHODS
  // ============================================================

  /**
   * Update last sync time
   */
  async updateSyncMetadata(isFullSync: boolean): Promise<void> {
    const db = this.ensureDb();
    
    const existing = await db.get('sync-metadata', 'main') || {
      key: 'main',
      last_full_sync: 0,
      last_incremental_sync: 0,
      pending_count: 0,
      failed_sync_count: 0,
      rules_version: ENGINE_VERSION
    };

    if (isFullSync) {
      existing.last_full_sync = Date.now();
    }
    existing.last_incremental_sync = Date.now();
    existing.rules_version = ENGINE_VERSION;

    await db.put('sync-metadata', existing);
  }

  /**
   * Get sync metadata
   */
  async getSyncMetadata(): Promise<SyncMetadata | null> {
    const db = this.ensureDb();
    return await db.get('sync-metadata', 'main') || null;
  }

  private async incrementPendingCount(): Promise<void> {
    const db = this.ensureDb();
    const existing = await db.get('sync-metadata', 'main');
    if (existing) {
      existing.pending_count += 1;
      await db.put('sync-metadata', existing);
    }
  }

  private async decrementPendingCount(): Promise<void> {
    const db = this.ensureDb();
    const existing = await db.get('sync-metadata', 'main');
    if (existing && existing.pending_count > 0) {
      existing.pending_count -= 1;
      await db.put('sync-metadata', existing);
    }
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Calculate simple checksum for rule validation
   */
  private calculateChecksum(rules: CauseRule[]): string {
    const content = JSON.stringify(rules.map(r => r.rule_id).sort());
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Clean up old history entries (older than retention period)
   */
  private async cleanupOldHistory(): Promise<void> {
    const db = this.ensureDb();
    
    const cutoff = Date.now() - ADVISORY_RETENTION_MS;
    const all = await db.getAll('advisory-history');
    
    const toDelete = all.filter(entry => entry.created_at < cutoff);
    
    if (toDelete.length > 0) {
      const tx = db.transaction('advisory-history', 'readwrite');
      const store = tx.objectStore('advisory-history');
      
      for (const entry of toDelete) {
        await store.delete(entry.advisory_id);
      }
      
      await tx.done;
      console.log(`[OfflineRuleCache] Cleaned up ${toDelete.length} old history entries`);
    }
  }

  /**
   * Clear all cached data (for debugging/reset)
   */
  async clearAllData(): Promise<void> {
    const db = this.ensureDb();
    
    await db.clear('crop-group-rules');
    await db.clear('pending-advisories');
    await db.clear('advisory-history');
    await db.clear('sync-metadata');
    
    console.log('[OfflineRuleCache] All cached data cleared');
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    cachedGroups: number;
    totalRules: number;
    pendingAdvisories: number;
    historyEntries: number;
    lastFullSync: number | null;
    cacheVersion: string;
  }> {
    const db = this.ensureDb();
    
    const groups = await db.getAll('crop-group-rules');
    const pending = await db.getAll('pending-advisories');
    const history = await db.getAll('advisory-history');
    const metadata = await db.get('sync-metadata', 'main');
    
    return {
      cachedGroups: groups.length,
      totalRules: groups.reduce((sum, g) => sum + g.rule_count, 0),
      pendingAdvisories: pending.filter(p => !p.synced).length,
      historyEntries: history.length,
      lastFullSync: metadata?.last_full_sync || null,
      cacheVersion: ENGINE_VERSION
    };
  }

  /**
   * Check if device can operate offline
   */
  async canOperateOffline(): Promise<boolean> {
    const db = this.ensureDb();
    
    const groups = await db.getAll('crop-group-rules');
    
    // Need at least some rules cached
    if (groups.length === 0) return false;
    
    // Check if any rules are valid (not expired)
    const validGroups = groups.filter(g => 
      Date.now() - g.cached_at < RULE_CACHE_MAX_AGE_MS &&
      g.version === ENGINE_VERSION
    );
    
    return validGroups.length > 0;
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}

// Singleton instance
let cacheInstance: OfflineRuleCache | null = null;

/**
 * Get the singleton OfflineRuleCache instance
 */
export function getOfflineRuleCache(): OfflineRuleCache {
  if (!cacheInstance) {
    cacheInstance = new OfflineRuleCache();
  }
  return cacheInstance;
}

/**
 * Initialize the offline rule cache
 */
export async function initializeOfflineCache(): Promise<OfflineRuleCache> {
  const cache = getOfflineRuleCache();
  await cache.initialize();
  return cache;
}
