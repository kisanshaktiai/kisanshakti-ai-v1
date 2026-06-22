import { getSupabaseFunctionUrl } from '@/config/supabase';

/**
 * Version Service for tracking app version and checking for updates
 */

class VersionService {
  private currentVersion: string;
  private checkInterval: number = 2 * 60 * 1000; // 2 minutes
  private intervalId: NodeJS.Timeout | null = null;
  private lastCheckTime: number = 0;
  private isDevelopment: boolean;

  constructor() {
    // Get version and build hash from build-time environment variables
    this.currentVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
    
    // Detect development mode
    this.isDevelopment = import.meta.env.DEV || 
      window.location.hostname === 'localhost' ||
      window.location.hostname.includes('127.0.0.1') ||
      window.location.hostname.includes('preview') ||
      window.location.hostname.includes('lovable.app');
    
    console.log(`[VersionService] App version: ${this.currentVersion}, Build: ${this.getBuildTime()}, Hash: ${this.getBuildHash()?.substring(0, 10)}, Mode: ${this.isDevelopment ? 'Development' : 'Production'}`);
  }

  /**
   * Check if running in development mode
   */
  isDevelopmentMode(): boolean {
    return this.isDevelopment;
  }

  /**
   * Start periodic version checking
   */
  startVersionChecking(callback?: (updateAvailable: boolean) => void) {
    if (this.intervalId) {
      console.log('[VersionService] Version checking already running');
      return;
    }

    console.log('[VersionService] Starting version check interval');
    
    // Check immediately
    this.checkForUpdates().then(callback).catch(console.error);
    
    // Then check periodically
    this.intervalId = setInterval(() => {
      this.checkForUpdates().then(callback).catch(console.error);
    }, this.checkInterval);
  }

  /**
   * Stop periodic version checking
   */
  stopVersionChecking() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[VersionService] Stopped version checking');
    }
  }

  /**
   * Get build hash for cache invalidation
   */
  getBuildHash(): string | null {
    return import.meta.env.VITE_BUILD_HASH || null;
  }

  /**
   * Check if a new version is available by comparing build hash
   * This is the primary mechanism for detecting new deploys
   */
  async checkForUpdates(): Promise<boolean> {
    const now = Date.now();
    
    // Throttle checks to avoid too frequent requests
    if (now - this.lastCheckTime < 60 * 1000) { // 1 minute
      return false;
    }
    
    this.lastCheckTime = now;

    try {
      // Get current build hash
      const currentHash = this.getBuildHash();
      if (!currentHash) {
        console.warn('[VersionService] No build hash available');
        return false;
      }

      // Compare with stored hash
      const storedHash = localStorage.getItem('build_hash');
      
      if (storedHash && storedHash !== currentHash) {
        console.log('[VersionService] New build detected (old: %s, new: %s)', 
          storedHash.substring(0, 10), 
          currentHash.substring(0, 10)
        );
        return true;
      }

      if (!storedHash) {
        // First time - store it as baseline
        localStorage.setItem('build_hash', currentHash);
        console.log('[VersionService] Baseline build hash stored');
      }

      return false;
    } catch (error) {
      console.error('[VersionService] Error checking for updates:', error);
      return false;
    }
  }

  /**
   * Fetch current version from database
   */
  async fetchVersionFromDatabase(): Promise<{ version: string; buildHash: string; forceUpdate: boolean } | null> {
    try {
      const response = await fetch(
        `${getSupabaseFunctionUrl('app-version')}?app_key=farmer_app`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.warn('[VersionService] Failed to fetch version from database');
        return null;
      }

      const data = await response.json();
      return {
        version: data.version,
        buildHash: data.build_hash,
        forceUpdate: data.force_update || false,
      };
    } catch (error) {
      console.error('[VersionService] Error fetching version from database:', error);
      return null;
    }
  }

  /**
   * Mark current build as acknowledged (called after update or dismissal)
   */
  acknowledgeCurrentVersion(): void {
    const currentHash = this.getBuildHash();
    if (currentHash) {
      localStorage.setItem('build_hash', currentHash);
      console.log('[VersionService] Current build hash acknowledged:', currentHash.substring(0, 10));
    }
  }

  /**
   * Clear all caches for force update
   */
  async clearAllCaches(): Promise<void> {
    console.log('[VersionService] Clearing all caches...');
    
    try {
      // Clear all cache storage
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[VersionService] All cache storage cleared');
      }

      // Clear localStorage caches
      localStorage.removeItem('tenant_config_cache');
      localStorage.removeItem('white_label_config');
      localStorage.removeItem('tenant_primary_color');
      
      // Signal service worker to clear caches
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' });
        console.log('[VersionService] Sent cache clear signal to service worker');
      }

      console.log('[VersionService] All caches cleared successfully');
    } catch (error) {
      console.error('[VersionService] Error clearing caches:', error);
    }
  }

  /**
   * Force update by clearing caches and reloading
   */
  async forceUpdate() {
    console.log('[VersionService] Force updating app...');

    try {
      // Clear all caches using the new method
      await this.clearAllCaches();

      // Unregister service worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
        console.log('[VersionService] Unregistered service workers');
      }

      // Clear build hash tracking
      localStorage.removeItem('build_hash');

      // Hard reload
      window.location.reload();
    } catch (error) {
      console.error('[VersionService] Error during force update:', error);
      // Fallback: just reload
      window.location.reload();
    }
  }

  /**
   * Get current app version
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Get build timestamp if available
   */
  getBuildTime(): string | null {
    return import.meta.env.VITE_BUILD_TIMESTAMP || null;
  }

  /**
   * Get update check interval in milliseconds
   */
  getCheckInterval(): number {
    return this.checkInterval;
  }

  /**
   * Set update check interval
   */
  setCheckInterval(intervalMs: number) {
    this.checkInterval = intervalMs;
    
    // Restart checking with new interval if already running
    if (this.intervalId) {
      this.stopVersionChecking();
      this.startVersionChecking();
    }
  }
}

// Singleton instance
export const versionService = new VersionService();

// Export class for testing
export default VersionService;
