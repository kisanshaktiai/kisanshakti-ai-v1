import { SUPABASE_CONFIG } from '@/config/supabase';

/**
 * Centralized Network Status Service
 * 
 * Provides reliable online/offline detection using:
 * 1. Primary: navigator.onLine (browser's network status)
 * 2. Secondary: Supabase connectivity check (verification)
 * 3. Multiple failure requirement before marking offline
 * 4. Quick recovery checks
 */

class NetworkStatusService {
  private isOnline: boolean = navigator.onLine;
  private listeners: Set<(online: boolean) => void> = new Set();
  private failureCount: number = 0;
  private checkInProgress: boolean = false;
  private readonly FAILURE_THRESHOLD = 2; // Require 2+ failures before marking offline
  private readonly RETRY_DELAY = 5000; // 5 seconds
  private readonly CHECK_INTERVAL = 30000; // 30 seconds periodic check
  private periodicCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeListeners();
    this.startPeriodicCheck();
  }

  private initializeListeners(): void {
    // Trust browser's online event immediately
    window.addEventListener('online', () => {
      console.log('🌐 [Network] Browser online event');
      this.failureCount = 0;
      this.setOnline(true);
      this.verifyConnectivity(); // Verify with fetch
    });

    // Trust browser's offline event immediately
    window.addEventListener('offline', () => {
      console.log('📴 [Network] Browser offline event');
      this.setOnline(false);
    });

    // Re-check when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) {
        console.log('👁️ [Network] Tab visible - verifying connectivity');
        this.verifyConnectivity();
      }
    });
  }

  private startPeriodicCheck(): void {
    // Periodic connectivity verification when online
    this.periodicCheckInterval = setInterval(() => {
      if (this.isOnline && navigator.onLine) {
        this.verifyConnectivity();
      }
    }, this.CHECK_INTERVAL);
  }

  private async verifyConnectivity(): Promise<void> {
    // If browser says offline, don't bother checking
    if (!navigator.onLine) {
      this.setOnline(false);
      return;
    }

    // Prevent concurrent checks
    if (this.checkInProgress) {
      return;
    }

    this.checkInProgress = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // Increased timeout

      // Use multiple fallback endpoints for reliability
      const endpoints = [
        // Primary: Simple favicon/asset check (faster, no CORS issues)
        { url: '/manifest.json', method: 'HEAD' as const },
        // Fallback: Supabase health
        { url: `${SUPABASE_CONFIG.URL}/rest/v1/`, method: 'HEAD' as const, mode: 'cors' as const }
      ];

      let success = false;
      
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint.url, {
            method: endpoint.method,
            cache: 'no-store',
            signal: controller.signal,
            ...(endpoint.mode && { mode: endpoint.mode })
          });
          
          // Any response (including errors) means we're online
          // For no-cors requests, response.type is 'opaque' but that's still online
          success = true;
          break;
        } catch (endpointError) {
          // Try next endpoint
          console.log(`[Network] Endpoint ${endpoint.url} failed, trying next...`);
          continue;
        }
      }

      clearTimeout(timeoutId);
      
      if (success) {
        // Success - reset failure count and mark online
        this.failureCount = 0;
        this.setOnline(true);
        console.log('✅ [Network] Connectivity verified');
      } else {
        throw new Error('All endpoints failed');
      }
    } catch (error) {
      this.failureCount++;
      console.warn(`⚠️ [Network] Connectivity check failed (${this.failureCount}/${this.FAILURE_THRESHOLD})`);

      // Only mark offline after multiple consecutive failures AND browser says we're offline
      if (this.failureCount >= this.FAILURE_THRESHOLD && !navigator.onLine) {
        console.error('❌ [Network] Marking as offline after multiple failures');
        this.setOnline(false);
      } else if (this.failureCount >= this.FAILURE_THRESHOLD) {
        // Browser says online but Supabase checks failing - keep online but log warning
        console.warn('⚠️ [Network] Supabase connectivity issues, but browser reports online');
        // Don't mark offline if browser says we're online - Supabase might just be slow
        this.failureCount = 0; // Reset to prevent false offline state
      } else {
        // Retry quickly instead of marking offline immediately
        setTimeout(() => this.verifyConnectivity(), this.RETRY_DELAY);
      }
    } finally {
      this.checkInProgress = false;
    }
  }

  private setOnline(online: boolean): void {
    if (this.isOnline !== online) {
      this.isOnline = online;
      console.log(`🔄 [Network] Status changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
      
      // Notify all listeners
      this.listeners.forEach(listener => {
        try {
          listener(online);
        } catch (error) {
          console.error('[Network] Error in listener:', error);
        }
      });
    }
  }

  /**
   * Subscribe to network status changes
   * @returns Unsubscribe function
   */
  public subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    // Immediately call with current status
    listener(this.isOnline);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get current online status
   */
  public getStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Force a connectivity check
   */
  public async forceCheck(): Promise<void> {
    await this.verifyConnectivity();
  }

  /**
   * Cleanup (for testing)
   */
  public destroy(): void {
    if (this.periodicCheckInterval) {
      clearInterval(this.periodicCheckInterval);
    }
    this.listeners.clear();
  }
}

// Export singleton instance
export const networkStatusService = new NetworkStatusService();
