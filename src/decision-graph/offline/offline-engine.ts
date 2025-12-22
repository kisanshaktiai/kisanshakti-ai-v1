/**
 * Offline Decision Engine
 * 
 * Provides complete offline-capable decision graph execution.
 * Uses cached rules when offline, queues advisories for later sync.
 */

import { 
  DecisionInput, 
  UnifiedAdvisory, 
  CropGroup,
  Action,
  Cause,
  ActionUrgency,
  RiskLevel,
  ENGINE_VERSION
} from '../types';
import { getOfflineRuleCache, OfflineRuleCache } from './rule-cache';
import { getSyncManager, SyncManager } from './sync-manager';
import { runDecisionGraphSync } from '../index';

interface OfflineExecutionResult {
  advisory: UnifiedAdvisory;
  executedOffline: boolean;
  usedCachedRules: boolean;
  queuedForSync: boolean;
}

interface EngineStatus {
  initialized: boolean;
  isOnline: boolean;
  canOperateOffline: boolean;
  cachedRuleGroups: number;
  pendingAdvisories: number;
  lastSync: Date | null;
}

/**
 * Offline Decision Engine - Main entry point for offline-capable execution
 */
export class OfflineDecisionEngine {
  private cache: OfflineRuleCache;
  private syncManager: SyncManager;
  private isInitialized = false;

  constructor() {
    this.cache = getOfflineRuleCache();
    this.syncManager = getSyncManager();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.cache.initialize();
    await this.syncManager.initialize();
    
    this.isInitialized = true;
    console.log('[OfflineDecisionEngine] Initialized');

    if (this.isOnline()) {
      this.syncManager.performFullSync().catch(err => {
        console.warn('[OfflineDecisionEngine] Initial sync failed:', err);
      });
    }
  }

  async execute(input: DecisionInput): Promise<OfflineExecutionResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const isOnline = this.isOnline();
    let usedCachedRules = false;
    let queuedForSync = false;

    try {
      const advisory = runDecisionGraphSync(input);

      if (!isOnline) {
        await this.cache.storePendingAdvisory(input, advisory, true);
        queuedForSync = true;
      } else {
        await this.cache.storeAdvisoryHistory(advisory, false, input.farmer_id, input.land_id);
      }

      return {
        advisory,
        executedOffline: !isOnline,
        usedCachedRules,
        queuedForSync
      };

    } catch (error) {
      console.error('[OfflineDecisionEngine] Execution error:', error);
      
      if (!isOnline) {
        const cachedResult = await this.executeWithCachedRules(input);
        if (cachedResult) {
          await this.cache.storePendingAdvisory(input, cachedResult, true);
          return {
            advisory: cachedResult,
            executedOffline: true,
            usedCachedRules: true,
            queuedForSync: true
          };
        }
      }

      const degradedAdvisory = this.createDegradedAdvisory(input);
      return {
        advisory: degradedAdvisory,
        executedOffline: !isOnline,
        usedCachedRules: false,
        queuedForSync: false
      };
    }
  }

  private async executeWithCachedRules(input: DecisionInput): Promise<UnifiedAdvisory | null> {
    try {
      const rules = await this.cache.getCachedRulesForceOffline(input.crop_group);
      
      if (!rules || rules.length === 0) {
        console.warn('[OfflineDecisionEngine] No cached rules available for', input.crop_group);
        return null;
      }

      console.log(`[OfflineDecisionEngine] Using ${rules.length} cached rules for ${input.crop_group}`);
      return runDecisionGraphSync(input);

    } catch (error) {
      console.error('[OfflineDecisionEngine] Cached execution failed:', error);
      return null;
    }
  }

  private createDegradedAdvisory(input: DecisionInput): UnifiedAdvisory {
    return {
      advisory_id: `degraded_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      generated_at: new Date().toISOString(),
      engine_version: ENGINE_VERSION,
      facts: {
        soil_states: input.soil_states,
        ndvi_state: input.ndvi_state,
        ndvi_trend: input.ndvi_trend,
        weather_state: input.weather_state,
        crop_stage: input.crop_stage,
        crop_code: input.crop_code,
        days_after_sowing: input.days_after_sowing,
        farming_mode: input.farming_mode
      },
      causes: [],
      actions: [{
        action: Action.MONITOR_CLOSELY,
        priority: 5,
        reason: Cause.COMPOUND_STRESS,
        urgency: ActionUrgency.WITHIN_3_DAYS,
        justification_key: 'system_offline_monitoring',
        rule_id: 'OFFLINE_DEGRADED',
        scientific_source: 'System'
      }],
      risk_level: RiskLevel.MEDIUM,
      confidence: 0.3,
      reasoning_trace: ['System operating in degraded offline mode'],
      rules_applied: [],
      conflicts_resolved: [],
      summary_key: 'advisory.degraded.offline',
      action_count: 1,
      primary_concern: undefined,
      scientific_sources: []
    };
  }

  async getStatus(): Promise<EngineStatus> {
    const cacheStats = await this.cache.getCacheStats();
    const syncStatus = await this.syncManager.getSyncStatus();

    return {
      initialized: this.isInitialized,
      isOnline: this.isOnline(),
      canOperateOffline: syncStatus.canOperateOffline,
      cachedRuleGroups: cacheStats.cachedGroups,
      pendingAdvisories: cacheStats.pendingAdvisories,
      lastSync: cacheStats.lastFullSync ? new Date(cacheStats.lastFullSync) : null
    };
  }

  async getAdvisoryHistory(farmerId: string, limit?: number) {
    return await this.cache.getAdvisoryHistoryByFarmer(farmerId, limit);
  }

  async getLandAdvisoryHistory(landId: string, limit?: number) {
    return await this.cache.getAdvisoryHistoryByLand(landId, limit);
  }

  async syncNow() {
    if (!this.isOnline()) {
      throw new Error('Cannot sync while offline');
    }
    return await this.syncManager.performFullSync();
  }

  private isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  async preloadRulesForCrops(cropGroups: CropGroup[]): Promise<void> {
    if (!this.isOnline()) {
      console.warn('[OfflineDecisionEngine] Cannot preload while offline');
      return;
    }

    for (const group of cropGroups) {
      try {
        if (await this.cache.needsRuleRefresh(group)) {
          console.log(`[OfflineDecisionEngine] Preloading rules for ${group}`);
          await this.syncManager.syncRulesOnly();
        }
      } catch (error) {
        console.error(`[OfflineDecisionEngine] Failed to preload ${group}:`, error);
      }
    }
  }
}

let engineInstance: OfflineDecisionEngine | null = null;

export function getOfflineDecisionEngine(): OfflineDecisionEngine {
  if (!engineInstance) {
    engineInstance = new OfflineDecisionEngine();
  }
  return engineInstance;
}

export async function initializeOfflineDecisionEngine(): Promise<OfflineDecisionEngine> {
  const engine = getOfflineDecisionEngine();
  await engine.initialize();
  return engine;
}

export async function runDecisionGraphOffline(input: DecisionInput): Promise<UnifiedAdvisory> {
  const engine = getOfflineDecisionEngine();
  const result = await engine.execute(input);
  return result.advisory;
}
