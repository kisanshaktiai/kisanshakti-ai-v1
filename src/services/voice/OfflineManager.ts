/**
 * OfflineManager - Handles offline-first voice navigation with graceful degradation
 * Provides seamless experience when network is unavailable
 */

import { voiceCache } from './VoiceCache';
import { networkStatusService } from '../networkStatusService';

export interface OfflineCapability {
  navigation: boolean; // Can navigate offline
  intentMatching: boolean; // Can match intents offline
  tts: boolean; // Can do text-to-speech offline
  asr: boolean; // Can do speech recognition offline
  dataSync: boolean; // Can sync data when online
}

export interface OfflineConfig {
  enableOfflineMode: boolean;
  autoSync: boolean;
  syncInterval: number; // ms between auto-sync attempts
  maxQueueSize: number; // Max pending operations
  capabilities: OfflineCapability;
}

export interface PendingOperation {
  id: string;
  type: 'navigation' | 'crud' | 'query';
  timestamp: number;
  data: any;
  retries: number;
  maxRetries: number;
}

export class OfflineManager {
  private config: OfflineConfig;
  private isOnline: boolean = true;
  private pendingQueue: PendingOperation[] = [];
  private syncTimer: NodeJS.Timeout | null = null;
  private listeners: Set<(online: boolean) => void> = new Set();

  constructor(config?: Partial<OfflineConfig>) {
    this.config = {
      enableOfflineMode: true,
      autoSync: true,
      syncInterval: 30000, // 30 seconds
      maxQueueSize: 100,
      capabilities: {
        navigation: true,
        intentMatching: true,
        tts: true,
        asr: true,
        dataSync: true,
      },
      ...config,
    };

    this.initialize();
  }

  private initialize(): void {
    // Subscribe to network status
    this.isOnline = networkStatusService.getStatus();
    
    networkStatusService.subscribe((online) => {
      const wasOnline = this.isOnline;
      this.isOnline = online;

      console.log('[OfflineManager] Network status changed:', online ? 'ONLINE' : 'OFFLINE');

      // Notify listeners
      this.listeners.forEach(listener => listener(online));

      // Start sync when coming back online
      if (!wasOnline && online && this.config.autoSync) {
        this.syncPendingOperations();
      }
    });

    // Start auto-sync if enabled
    if (this.config.autoSync) {
      this.startAutoSync();
    }

    // Load pending operations from storage
    this.loadPendingQueue();
  }

  /**
   * Check if a feature is available offline
   */
  isFeatureAvailable(feature: keyof OfflineCapability): boolean {
    if (!this.config.enableOfflineMode) {
      return this.isOnline;
    }

    return this.config.capabilities[feature] || this.isOnline;
  }

  /**
   * Execute operation with offline fallback
   */
  async executeWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T> | T,
    requiresOnline: boolean = false
  ): Promise<T> {
    // If offline and operation requires online, use fallback
    if (!this.isOnline && requiresOnline) {
      console.log('[OfflineManager] Using offline fallback');
      return Promise.resolve(fallback());
    }

    try {
      return await operation();
    } catch (error) {
      console.error('[OfflineManager] Operation failed, using fallback:', error);
      return Promise.resolve(fallback());
    }
  }

  /**
   * Queue operation for later execution when online
   */
  queueOperation(operation: Omit<PendingOperation, 'id' | 'retries'>): void {
    if (this.pendingQueue.length >= this.config.maxQueueSize) {
      console.warn('[OfflineManager] Queue full, removing oldest operation');
      this.pendingQueue.shift();
    }

    const op: PendingOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      retries: 0,
      ...operation,
    };

    this.pendingQueue.push(op);
    this.savePendingQueue();

    console.log(`[OfflineManager] Queued operation: ${op.type} (${this.pendingQueue.length} pending)`);
  }

  /**
   * Sync pending operations when online
   */
  async syncPendingOperations(): Promise<void> {
    if (!this.isOnline) {
      console.log('[OfflineManager] Cannot sync while offline');
      return;
    }

    if (this.pendingQueue.length === 0) {
      return;
    }

    console.log(`[OfflineManager] Syncing ${this.pendingQueue.length} pending operations`);

    const operations = [...this.pendingQueue];
    const results: Array<{ id: string; success: boolean }> = [];

    for (const op of operations) {
      try {
        await this.executePendingOperation(op);
        results.push({ id: op.id, success: true });
        
        // Remove from queue
        this.pendingQueue = this.pendingQueue.filter(o => o.id !== op.id);
      } catch (error) {
        console.error(`[OfflineManager] Failed to sync operation ${op.id}:`, error);
        
        // Increment retry count
        op.retries++;
        
        if (op.retries >= op.maxRetries) {
          console.warn(`[OfflineManager] Operation ${op.id} exceeded max retries, removing`);
          this.pendingQueue = this.pendingQueue.filter(o => o.id !== op.id);
          results.push({ id: op.id, success: false });
        }
      }
    }

    this.savePendingQueue();

    const successCount = results.filter(r => r.success).length;
    console.log(`[OfflineManager] Sync complete: ${successCount}/${results.length} succeeded`);
  }

  private async executePendingOperation(op: PendingOperation): Promise<void> {
    // TODO: Implement actual operation execution
    // This would integrate with the ActionHandler and other services
    console.log(`[OfflineManager] Executing pending operation: ${op.type}`, op.data);
    
    // Simulate async execution
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Get offline status and capabilities
   */
  getStatus(): {
    isOnline: boolean;
    capabilities: OfflineCapability;
    pendingOperations: number;
    canOperate: boolean;
  } {
    return {
      isOnline: this.isOnline,
      capabilities: { ...this.config.capabilities },
      pendingOperations: this.pendingQueue.length,
      canOperate: this.isOnline || this.config.enableOfflineMode,
    };
  }

  /**
   * Subscribe to online/offline events
   */
  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Gracefully degrade feature based on network status
   */
  getDegradedFeature<T>(
    onlineFeature: T,
    offlineFeature: T,
    requiresOnline: boolean = false
  ): T {
    if (this.isOnline || !requiresOnline) {
      return onlineFeature;
    }
    return offlineFeature;
  }

  // ============ Private Methods ============

  private startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      if (this.isOnline && this.pendingQueue.length > 0) {
        this.syncPendingOperations();
      }
    }, this.config.syncInterval);
  }

  private savePendingQueue(): void {
    try {
      localStorage.setItem('voice_pending_queue', JSON.stringify(this.pendingQueue));
    } catch (error) {
      console.error('[OfflineManager] Failed to save pending queue:', error);
    }
  }

  private loadPendingQueue(): void {
    try {
      const stored = localStorage.getItem('voice_pending_queue');
      if (stored) {
        this.pendingQueue = JSON.parse(stored);
        console.log(`[OfflineManager] Loaded ${this.pendingQueue.length} pending operations`);
      }
    } catch (error) {
      console.error('[OfflineManager] Failed to load pending queue:', error);
      this.pendingQueue = [];
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.listeners.clear();
  }
}

// Global offline manager instance
export const offlineManager = new OfflineManager();
